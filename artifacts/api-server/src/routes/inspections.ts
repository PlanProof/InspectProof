import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, inspectionsTable, projectsTable, checklistItemsTable, checklistResultsTable, issuesTable, notesTable, activityLogsTable, usersTable, checklistTemplatesTable, reportsTable } from "@workspace/db";
import { checkInspectionQuota } from "../lib/quota";
import { optionalAuth, isInspectorOnly } from "../middleware/auth";
import { sendInspectionAssignedEmail } from "../lib/email";

const router: IRouter = Router();

function getUserIdFromRequest(req: any): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [userId] = decoded.split(":");
    return Number(userId) || null;
  } catch {
    return null;
  }
}

async function getInspectionCounts(inspectionId: number) {
  const results = await db.select().from(checklistResultsTable)
    .where(eq(checklistResultsTable.inspectionId, inspectionId));
  const passCount = results.filter(r => r.result === "pass").length;
  const failCount = results.filter(r => r.result === "fail").length;
  const monitorCount = results.filter(r => r.result === "monitor").length;
  const naCount = results.filter(r => r.result === "na").length;
  return { passCount, failCount, monitorCount, naCount };
}

async function formatInspection(i: any) {
  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, i.projectId));
  const pName = project[0]?.name || "Unknown";
  const pAddress = project[0]?.siteAddress || null;
  const pSuburb = project[0]?.suburb || null;

  let inspectorName = null;
  if (i.inspectorId) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, i.inspectorId));
    if (users[0]) inspectorName = `${users[0].firstName} ${users[0].lastName}`;
  }

  const counts = await getInspectionCounts(i.id);

  let checklistTemplateName: string | null = null;
  let checklistTemplateDiscipline: string | null = null;
  if (i.checklistTemplateId) {
    const tmpl = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, i.checklistTemplateId));
    checklistTemplateName = tmpl[0]?.name || null;
    checklistTemplateDiscipline = tmpl[0]?.discipline || null;
  }

  return {
    id: i.id,
    projectId: i.projectId,
    projectName: pName,
    projectAddress: pAddress,
    projectSuburb: pSuburb,
    inspectionType: i.inspectionType,
    status: i.status,
    scheduledDate: i.scheduledDate,
    scheduledTime: i.scheduledTime,
    completedDate: i.completedDate,
    inspectorId: i.inspectorId,
    inspectorName,
    duration: i.duration,
    siteNotes: i.notes ?? null,
    weatherConditions: i.weatherConditions,
    checklistTemplateId: i.checklistTemplateId,
    checklistTemplateName,
    checklistTemplateDiscipline,
    ...counts,
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
  };
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, status, inspectorId, fromDate, toDate } = req.query;
    let inspections = await db.select().from(inspectionsTable)
      .orderBy(sql`${inspectionsTable.scheduledDate} DESC`);

    // Scope inspections to projects owned by the requesting user (unless admin)
    if (req.authUser && !req.authUser.isAdmin) {
      const allProjects = await db.select({ id: projectsTable.id, name: projectsTable.name, createdById: projectsTable.createdById })
        .from(projectsTable);
      const accessibleProjectIds = allProjects
        .filter(p => p.name === "Test Project" || p.createdById === req.authUser!.id)
        .map(p => p.id);
      inspections = inspections.filter(i => i.projectId !== null && accessibleProjectIds.includes(i.projectId));
    } else if (!req.authUser) {
      const testProjects = await db.select({ id: projectsTable.id }).from(projectsTable)
        .where(eq(projectsTable.name, "Test Project"));
      const testIds = testProjects.map(p => p.id);
      inspections = inspections.filter(i => i.projectId !== null && testIds.includes(i.projectId));
    }

    if (projectId) inspections = inspections.filter(i => i.projectId === parseInt(projectId as string));
    if (status) inspections = inspections.filter(i => i.status === status);
    if (inspectorId) inspections = inspections.filter(i => i.inspectorId === parseInt(inspectorId as string));

    // Inspector-role users only see inspections assigned to them
    if (req.authUser && isInspectorOnly(req.authUser)) {
      inspections = inspections.filter(i => i.inspectorId === req.authUser!.id);
    }

    const result = await Promise.all(inspections.map(formatInspection));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List inspections error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", checkInspectionQuota, async (req, res) => {
  try {
    const data = req.body;
    const [inspection] = await db.insert(inspectionsTable).values({
      projectId: data.projectId,
      inspectionType: data.inspectionType,
      status: "scheduled",
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      inspectorId: data.inspectorId,
      duration: data.duration,
      notes: data.notes,
      checklistTemplateId: data.checklistTemplateId,
    }).returning();

    // If checklist template selected, pre-populate results
    if (data.checklistTemplateId) {
      const items = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, data.checklistTemplateId));
      if (items.length > 0) {
        await db.insert(checklistResultsTable).values(
          items.map(item => ({
            inspectionId: inspection.id,
            checklistItemId: item.id,
            result: "pending" as const,
          }))
        );
      }
    }

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: inspection.id,
      action: "scheduled",
      description: `${inspection.inspectionType} inspection scheduled for ${inspection.scheduledDate}`,
      userId: getUserIdFromRequest(req) ?? 1,
    });

    const formatted = await formatInspection(inspection);
    res.status(201).json(formatted);

    // Send assignment email (non-blocking, after response sent)
    if (inspection.inspectorId) {
      const [inspector] = await db.select().from(usersTable).where(eq(usersTable.id, inspection.inspectorId));
      const [project] = inspection.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId)) : [];
      if (inspector?.email && project) {
        sendInspectionAssignedEmail({
          inspectorName: `${inspector.firstName} ${inspector.lastName}`.trim(),
          inspectorEmail: inspector.email,
          inspectionType: inspection.inspectionType,
          projectName: project.name,
          projectAddress: [project.siteAddress, project.suburb, project.state].filter(Boolean).join(", "),
          scheduledDate: inspection.scheduledDate,
          scheduledTime: inspection.scheduledTime ?? null,
          inspectionId: inspection.id,
          isReassignment: false,
        }, req.log).catch(() => {});
      }
    }
  } catch (err) {
    req.log.error({ err }, "Create inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/run-sheet/send", async (req, res) => {
  try {
    const { date, inspectorIds, inspectorNames } = req.body;
    if (!date || !inspectorNames?.length) {
      res.status(400).json({ error: "date and inspectorNames are required" });
      return;
    }
    await db.insert(activityLogsTable).values({
      entityType: "run_sheet",
      entityId: 0,
      action: "sent",
      description: `Run sheet for ${date} sent to: ${(inspectorNames as string[]).join(", ")}`,
      userId: getUserIdFromRequest(req) ?? 1,
    });
    res.json({ success: true, sentTo: inspectorNames });
  } catch (err) {
    req.log.error({ err }, "Send run sheet error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const inspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    const inspection = inspections[0];
    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Inspector-role users can only view their own assigned inspections
    if (req.authUser && isInspectorOnly(req.authUser) && inspection.inspectorId !== req.authUser.id) {
      res.status(403).json({ error: "forbidden", message: "You can only view inspections assigned to you." });
      return;
    }

    const checklistResults = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, id))
      .orderBy(checklistItemsTable.orderIndex);

    const formattedResults = checklistResults.map(r => ({
      id: r.result.id,
      inspectionId: r.result.inspectionId,
      checklistItemId: r.result.checklistItemId,
      category: r.item.category,
      description: r.item.description,
      codeReference: r.item.codeReference,
      riskLevel: r.item.riskLevel,
      requirePhoto: r.item.requirePhoto ?? false,
      defectTrigger: r.item.defectTrigger ?? false,
      recommendedActionDefault: r.item.recommendedAction ?? null,
      result: r.result.result,
      notes: r.result.notes,
      photoUrls: r.result.photoUrls ? JSON.parse(r.result.photoUrls) : [],
      photoMarkups: r.result.photoMarkups ? JSON.parse(r.result.photoMarkups) : {},
      severity: r.result.severity ?? null,
      location: r.result.location ?? null,
      tradeAllocated: r.result.tradeAllocated ?? null,
      defectStatus: r.result.defectStatus ?? "open",
      clientVisible: r.result.clientVisible ?? true,
      recommendedAction: r.result.recommendedAction ?? null,
      orderIndex: r.item.orderIndex,
    }));

    const realIssues = await db.select().from(issuesTable)
      .where(eq(issuesTable.inspectionId, id));

    const notes = await db.select().from(notesTable)
      .where(eq(notesTable.inspectionId, id));

    const project = inspection.projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId))
      : [];
    const pName = project[0]?.name || "Standalone";

    // Synthesise issues from failed/monitor checklist results so the Issues tab
    // always reflects what was found on the checklist, even if no manual issue
    // record was raised.
    const syntheticIssues = formattedResults
      .filter(r => r.result === "fail" || r.result === "monitor")
      .map(r => ({
        id: -(r.id),          // negative to avoid collision with real issue IDs
        projectId: inspection.projectId,
        inspectionId: id,
        title: r.description,
        description: r.notes ?? "",
        severity: r.severity ?? (r.riskLevel === "high" ? "high" : r.riskLevel === "critical" ? "critical" : r.riskLevel === "low" ? "low" : "medium"),
        status: r.defectStatus ?? "open",
        location: r.location ?? null,
        codeReference: r.codeReference ?? null,
        responsibleParty: r.tradeAllocated ?? null,
        dueDate: null,
        resolvedDate: null,
        assignedToId: null,
        projectName: pName,
        source: "checklist" as const,
        checklistResultId: r.id,
        category: r.category ?? null,
        result: r.result,
        recommendedAction: r.recommendedAction ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    const counts = await getInspectionCounts(id);

    // Resolve inspector name + signature URL
    let inspectorNameResolved: string | null = null;
    let inspectorSignatureUrl: string | null = null;
    if (inspection.inspectorId) {
      const inspUsers = await db.select().from(usersTable).where(eq(usersTable.id, inspection.inspectorId));
      if (inspUsers[0]) {
        inspectorNameResolved = `${inspUsers[0].firstName} ${inspUsers[0].lastName}`;
        inspectorSignatureUrl = inspUsers[0].signatureUrl ?? null;
      }
    }

    // Resolve checklist template name + discipline
    let checklistTemplateName: string | null = null;
    let checklistTemplateDiscipline: string | null = null;
    if (inspection.checklistTemplateId) {
      const tmpl = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, inspection.checklistTemplateId));
      checklistTemplateName = tmpl[0]?.name ?? null;
      checklistTemplateDiscipline = tmpl[0]?.discipline ?? null;
    }

    res.json({
      id: inspection.id,
      projectId: inspection.projectId,
      projectName: pName,
      inspectionType: inspection.inspectionType,
      status: inspection.status,
      scheduledDate: inspection.scheduledDate,
      scheduledTime: inspection.scheduledTime,
      completedDate: inspection.completedDate,
      inspectorId: inspection.inspectorId,
      inspectorName: inspectorNameResolved,
      inspectorSignatureUrl,
      duration: inspection.duration,
      weatherConditions: inspection.weatherConditions,
      siteNotes: inspection.notes ?? null,
      checklistTemplateId: inspection.checklistTemplateId,
      checklistTemplateName,
      checklistTemplateDiscipline,
      ...counts,
      createdAt: inspection.createdAt instanceof Date ? inspection.createdAt.toISOString() : inspection.createdAt,
      checklistResults: formattedResults,
      issues: [
        ...realIssues.map(i => ({
          id: i.id, projectId: i.projectId, inspectionId: i.inspectionId,
          title: i.title, description: i.description, severity: i.severity,
          status: i.status, location: i.location, codeReference: i.codeReference,
          responsibleParty: i.responsibleParty, dueDate: i.dueDate, resolvedDate: i.resolvedDate,
          assignedToId: i.assignedToId, projectName: pName, source: "manual" as const,
          createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
          updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
        })),
        ...syntheticIssues,
      ],
      notes: notes.map(n => ({
        id: n.id, projectId: n.projectId, inspectionId: n.inspectionId,
        content: n.content, authorId: n.authorId, authorName: "Inspector",
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    // Capture previous inspectorId before update to detect reassignment
    const [before] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const prevInspectorId = before.inspectorId;

    const [inspection] = await db.update(inspectionsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id))
      .returning();

    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: id,
      action: "updated",
      description: `Inspection status updated to ${data.status || inspection.status}`,
      userId: getUserIdFromRequest(req) ?? 1,
    });

    const formatted = await formatInspection(inspection);
    res.json(formatted);

    // Send reassignment email if inspector changed to a new (non-null) person
    const newInspectorId = inspection.inspectorId;
    if (newInspectorId && newInspectorId !== prevInspectorId) {
      const [inspector] = await db.select().from(usersTable).where(eq(usersTable.id, newInspectorId));
      const [project] = inspection.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId)) : [];
      if (inspector?.email && project) {
        sendInspectionAssignedEmail({
          inspectorName: `${inspector.firstName} ${inspector.lastName}`.trim(),
          inspectorEmail: inspector.email,
          inspectionType: inspection.inspectionType,
          projectName: project.name,
          projectAddress: [project.siteAddress, project.suburb, project.state].filter(Boolean).join(", "),
          scheduledDate: inspection.scheduledDate,
          scheduledTime: inspection.scheduledTime ?? null,
          inspectionId: inspection.id,
          isReassignment: prevInspectorId !== null,
        }, req.log).catch(() => {});
      }
    }
  } catch (err) {
    req.log.error({ err }, "Update inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/checklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let results = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, id))
      .orderBy(checklistItemsTable.orderIndex);

    // Auto-initialise results from template if none exist yet
    if (results.length === 0) {
      const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
      if (inspection?.checklistTemplateId) {
        const templateItems = await db.select().from(checklistItemsTable)
          .where(eq(checklistItemsTable.templateId, inspection.checklistTemplateId));
        if (templateItems.length > 0) {
          const inserted = await db.insert(checklistResultsTable)
            .values(templateItems.map(item => ({
              inspectionId: id,
              checklistItemId: item.id,
              result: "pending" as const,
              notes: null,
            }))).returning();
          results = inserted.map((r, i) => ({ result: r, item: templateItems[i] }));
        }
      }
    }

    res.json(results.map(r => ({
      id: r.result.id,
      inspectionId: r.result.inspectionId,
      checklistItemId: r.result.checklistItemId,
      category: r.item.category,
      description: r.item.description,
      codeReference: r.item.codeReference,
      riskLevel: r.item.riskLevel,
      requirePhoto: r.item.requirePhoto ?? false,
      defectTrigger: r.item.defectTrigger ?? false,
      recommendedActionDefault: r.item.recommendedAction ?? null,
      result: r.result.result,
      notes: r.result.notes,
      photoUrls: r.result.photoUrls ? JSON.parse(r.result.photoUrls) : [],
      photoMarkups: r.result.photoMarkups ? JSON.parse(r.result.photoMarkups) : {},
      severity: r.result.severity ?? null,
      location: r.result.location ?? null,
      tradeAllocated: r.result.tradeAllocated ?? null,
      defectStatus: r.result.defectStatus ?? "open",
      clientVisible: r.result.clientVisible ?? true,
      recommendedAction: r.result.recommendedAction ?? null,
      orderIndex: r.item.orderIndex,
    })));
  } catch (err) {
    req.log.error({ err }, "Get checklist error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/checklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { results } = req.body;

    for (const r of results) {
      const existing = await db.select().from(checklistResultsTable)
        .where(sql`${checklistResultsTable.inspectionId} = ${id} AND ${checklistResultsTable.checklistItemId} = ${r.checklistItemId}`);

      const extraFields: any = {};
      if (r.severity !== undefined) extraFields.severity = r.severity;
      if (r.location !== undefined) extraFields.location = r.location;
      if (r.tradeAllocated !== undefined) extraFields.tradeAllocated = r.tradeAllocated;
      if (r.defectStatus !== undefined) extraFields.defectStatus = r.defectStatus;
      if (r.clientVisible !== undefined) extraFields.clientVisible = r.clientVisible;
      if (r.recommendedAction !== undefined) extraFields.recommendedAction = r.recommendedAction;

      if (existing.length > 0) {
        await db.update(checklistResultsTable)
          .set({ result: r.result, notes: r.notes, ...extraFields, updatedAt: new Date() })
          .where(sql`${checklistResultsTable.inspectionId} = ${id} AND ${checklistResultsTable.checklistItemId} = ${r.checklistItemId}`);
      } else {
        await db.insert(checklistResultsTable).values({
          inspectionId: id,
          checklistItemId: r.checklistItemId,
          result: r.result,
          notes: r.notes,
          ...extraFields,
        });
      }
    }

    res.json({ success: true, message: "Checklist results saved" });
  } catch (err) {
    req.log.error({ err }, "Save checklist error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Reset all checklist results to "pending" (used by Re-Do Inspection)
router.post("/:id/reset-checklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(checklistResultsTable)
      .set({
        result: "pending",
        notes: null,
        photoUrls: null,
        photoMarkups: null,
        severity: null,
        location: null,
        tradeAllocated: null,
        recommendedAction: null,
        defectStatus: "open",
        updatedAt: new Date(),
      })
      .where(eq(checklistResultsTable.inspectionId, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reset checklist error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Apply a checklist template to an inspection (replaces pending items)
router.post("/:id/apply-checklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { templateId } = req.body;

    if (!templateId) {
      res.status(400).json({ error: "templateId required" });
      return;
    }

    // Verify inspection exists
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!inspection) { res.status(404).json({ error: "not_found" }); return; }

    // Delete existing pending results only (preserve pass/fail/na that were already scored)
    const existingResults = await db.select().from(checklistResultsTable).where(eq(checklistResultsTable.inspectionId, id));
    const pendingIds = existingResults.filter(r => r.result === "pending").map(r => r.id);
    if (pendingIds.length > 0) {
      for (const rid of pendingIds) {
        await db.delete(checklistResultsTable).where(eq(checklistResultsTable.id, rid));
      }
    }

    // If switching to a different template, remove ALL old results
    if (inspection.checklistTemplateId && inspection.checklistTemplateId !== templateId) {
      await db.delete(checklistResultsTable).where(eq(checklistResultsTable.inspectionId, id));
    }

    // Load template items
    const items = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.templateId, templateId))
      .orderBy(checklistItemsTable.orderIndex);

    if (items.length === 0) {
      res.status(400).json({ error: "template_has_no_items" });
      return;
    }

    // Check if results already exist for this template (in case of partial re-apply)
    const existingAfterClean = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, id));
    const existingItemIds = new Set(existingAfterClean.map(r => r.checklistItemId));

    const newItems = items.filter(item => !existingItemIds.has(item.id));
    if (newItems.length > 0) {
      await db.insert(checklistResultsTable).values(
        newItems.map(item => ({
          inspectionId: id,
          checklistItemId: item.id,
          result: "pending" as const,
          notes: null,
        }))
      );
    }

    // Update the inspection's checklistTemplateId
    const [updated] = await db.update(inspectionsTable)
      .set({ checklistTemplateId: templateId, updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: id,
      action: "checklist_applied",
      description: `Checklist template applied to inspection`,
      userId: getUserIdFromRequest(req) ?? 1,
    });

    const formatted = await formatInspection(updated);
    res.json({ ...formatted, itemCount: items.length });
  } catch (err) {
    req.log.error({ err }, "Apply checklist error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/checklist/:resultId", async (req, res) => {
  try {
    const resultId = parseInt(req.params.resultId);
    const { result, notes, photoUrls, photoMarkups, severity, location, tradeAllocated, defectStatus, clientVisible, recommendedAction } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (result !== undefined) updateData.result = result;
    if (notes !== undefined) updateData.notes = notes;
    if (photoUrls !== undefined) updateData.photoUrls = JSON.stringify(photoUrls);
    if (photoMarkups !== undefined) updateData.photoMarkups = JSON.stringify(photoMarkups);
    if (severity !== undefined) updateData.severity = severity;
    if (location !== undefined) updateData.location = location;
    if (tradeAllocated !== undefined) updateData.tradeAllocated = tradeAllocated;
    if (defectStatus !== undefined) updateData.defectStatus = defectStatus;
    if (clientVisible !== undefined) updateData.clientVisible = clientVisible;
    if (recommendedAction !== undefined) updateData.recommendedAction = recommendedAction;

    const [updated] = await db.update(checklistResultsTable)
      .set(updateData)
      .where(eq(checklistResultsTable.id, resultId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const item = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.id, updated.checklistItemId));

    res.json({
      id: updated.id,
      inspectionId: updated.inspectionId,
      checklistItemId: updated.checklistItemId,
      category: item[0]?.category,
      description: item[0]?.description,
      codeReference: item[0]?.codeReference,
      riskLevel: item[0]?.riskLevel,
      requirePhoto: item[0]?.requirePhoto ?? false,
      defectTrigger: item[0]?.defectTrigger ?? false,
      recommendedActionDefault: item[0]?.recommendedAction ?? null,
      result: updated.result,
      notes: updated.notes,
      photoUrls: updated.photoUrls ? JSON.parse(updated.photoUrls) : [],
      photoMarkups: updated.photoMarkups ? JSON.parse(updated.photoMarkups) : {},
      severity: updated.severity ?? null,
      location: updated.location ?? null,
      tradeAllocated: updated.tradeAllocated ?? null,
      defectStatus: updated.defectStatus ?? "open",
      clientVisible: updated.clientVisible ?? true,
      recommendedAction: updated.recommendedAction ?? null,
      orderIndex: item[0]?.orderIndex,
    });
  } catch (err) {
    req.log.error({ err }, "Patch checklist result error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/manual-item", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { description, category } = req.body;

    if (!description?.trim() || !category?.trim()) {
      res.status(400).json({ error: "description and category are required" });
      return;
    }

    // Find the max orderIndex already on this inspection so we append at end
    const existing = await db.select({ oi: checklistItemsTable.orderIndex })
      .from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, id));

    const maxOrder = existing.length > 0 ? Math.max(...existing.map(e => e.oi)) : 0;

    const [newItem] = await db.insert(checklistItemsTable).values({
      templateId: null,
      orderIndex: maxOrder + 1,
      category: category.trim(),
      description: description.trim(),
      riskLevel: "medium",
      isRequired: false,
      requirePhoto: false,
      defectTrigger: false,
      includeInReport: true,
    }).returning();

    const [newResult] = await db.insert(checklistResultsTable).values({
      inspectionId: id,
      checklistItemId: newItem.id,
      result: "pending",
      notes: null,
    }).returning();

    res.json({
      id: newResult.id,
      inspectionId: newResult.inspectionId,
      checklistItemId: newResult.checklistItemId,
      category: newItem.category,
      description: newItem.description,
      codeReference: null,
      riskLevel: newItem.riskLevel,
      requirePhoto: false,
      defectTrigger: false,
      recommendedActionDefault: null,
      result: newResult.result,
      notes: null,
      photoUrls: [],
      photoMarkups: {},
      severity: null,
      location: null,
      tradeAllocated: null,
      defectStatus: "open",
      clientVisible: true,
      recommendedAction: null,
      orderIndex: newItem.orderIndex,
      isManual: true,
    });
  } catch (err) {
    req.log.error({ err }, "Add manual checklist item error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // Delete child records first (no CASCADE in schema)
    await db.delete(checklistResultsTable).where(eq(checklistResultsTable.inspectionId, id));
    await db.delete(notesTable).where(eq(notesTable.inspectionId, id));
    await db.delete(issuesTable).where(eq(issuesTable.inspectionId, id));
    await db.delete(reportsTable).where(eq(reportsTable.inspectionId, id));
    await db.delete(activityLogsTable).where(sql`${activityLogsTable.entityType} = 'inspection' AND ${activityLogsTable.entityId} = ${id}`);
    await db.delete(inspectionsTable).where(eq(inspectionsTable.id, id));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
