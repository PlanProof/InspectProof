import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, inspectionsTable, projectsTable, checklistItemsTable, checklistResultsTable, issuesTable, notesTable, activityLogsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function getInspectionCounts(inspectionId: number) {
  const results = await db.select().from(checklistResultsTable)
    .where(eq(checklistResultsTable.inspectionId, inspectionId));
  const passCount = results.filter(r => r.result === "pass").length;
  const failCount = results.filter(r => r.result === "fail").length;
  const naCount = results.filter(r => r.result === "na").length;
  return { passCount, failCount, naCount };
}

async function formatInspection(i: any) {
  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, i.projectId));
  const pName = project[0]?.name || "Unknown";

  let inspectorName = null;
  if (i.inspectorId) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, i.inspectorId));
    if (users[0]) inspectorName = `${users[0].firstName} ${users[0].lastName}`;
  }

  const counts = await getInspectionCounts(i.id);

  return {
    id: i.id,
    projectId: i.projectId,
    projectName: pName,
    inspectionType: i.inspectionType,
    status: i.status,
    scheduledDate: i.scheduledDate,
    scheduledTime: i.scheduledTime,
    completedDate: i.completedDate,
    inspectorId: i.inspectorId,
    inspectorName,
    duration: i.duration,
    notes: i.notes,
    weatherConditions: i.weatherConditions,
    checklistTemplateId: i.checklistTemplateId,
    ...counts,
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { projectId, status, inspectorId, fromDate, toDate } = req.query;
    let inspections = await db.select().from(inspectionsTable)
      .orderBy(sql`${inspectionsTable.scheduledDate} DESC`);

    if (projectId) inspections = inspections.filter(i => i.projectId === parseInt(projectId as string));
    if (status) inspections = inspections.filter(i => i.status === status);
    if (inspectorId) inspections = inspections.filter(i => i.inspectorId === parseInt(inspectorId as string));

    const result = await Promise.all(inspections.map(formatInspection));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List inspections error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
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
      userId: 1,
    });

    const formatted = await formatInspection(inspection);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const inspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    const inspection = inspections[0];
    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const checklistResults = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, id));

    const formattedResults = checklistResults.map(r => ({
      id: r.result.id,
      inspectionId: r.result.inspectionId,
      checklistItemId: r.result.checklistItemId,
      category: r.item.category,
      description: r.item.description,
      codeReference: r.item.codeReference,
      riskLevel: r.item.riskLevel,
      result: r.result.result,
      notes: r.result.notes,
      orderIndex: r.item.orderIndex,
    }));

    const issues = await db.select().from(issuesTable)
      .where(eq(issuesTable.inspectionId, id));

    const notes = await db.select().from(notesTable)
      .where(eq(notesTable.inspectionId, id));

    const project = await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId));
    const pName = project[0]?.name || "Unknown";

    const counts = await getInspectionCounts(id);

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
      inspectorName: null,
      duration: inspection.duration,
      notes: inspection.notes,
      weatherConditions: inspection.weatherConditions,
      checklistTemplateId: inspection.checklistTemplateId,
      ...counts,
      createdAt: inspection.createdAt instanceof Date ? inspection.createdAt.toISOString() : inspection.createdAt,
      checklistResults: formattedResults,
      issues: issues.map(i => ({
        id: i.id, projectId: i.projectId, inspectionId: i.inspectionId,
        title: i.title, description: i.description, severity: i.severity,
        status: i.status, location: i.location, codeReference: i.codeReference,
        responsibleParty: i.responsibleParty, dueDate: i.dueDate, resolvedDate: i.resolvedDate,
        assignedToId: i.assignedToId, projectName: pName,
        createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
        updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
      })),
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
      userId: 1,
    });

    const formatted = await formatInspection(inspection);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Update inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/checklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const results = await db.select({
      result: checklistResultsTable,
      item: checklistItemsTable,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
      .where(eq(checklistResultsTable.inspectionId, id));

    res.json(results.map(r => ({
      id: r.result.id,
      inspectionId: r.result.inspectionId,
      checklistItemId: r.result.checklistItemId,
      category: r.item.category,
      description: r.item.description,
      codeReference: r.item.codeReference,
      riskLevel: r.item.riskLevel,
      result: r.result.result,
      notes: r.result.notes,
      photoUrls: r.result.photoUrls ? JSON.parse(r.result.photoUrls) : [],
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

      if (existing.length > 0) {
        await db.update(checklistResultsTable)
          .set({ result: r.result, notes: r.notes, updatedAt: new Date() })
          .where(sql`${checklistResultsTable.inspectionId} = ${id} AND ${checklistResultsTable.checklistItemId} = ${r.checklistItemId}`);
      } else {
        await db.insert(checklistResultsTable).values({
          inspectionId: id,
          checklistItemId: r.checklistItemId,
          result: r.result,
          notes: r.notes,
        });
      }
    }

    res.json({ success: true, message: "Checklist results saved" });
  } catch (err) {
    req.log.error({ err }, "Save checklist error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/checklist/:resultId", async (req, res) => {
  try {
    const resultId = parseInt(req.params.resultId);
    const { result, notes, photoUrls } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (result !== undefined) updateData.result = result;
    if (notes !== undefined) updateData.notes = notes;
    if (photoUrls !== undefined) updateData.photoUrls = JSON.stringify(photoUrls);

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
      result: updated.result,
      notes: updated.notes,
      photoUrls: updated.photoUrls ? JSON.parse(updated.photoUrls) : [],
      orderIndex: item[0]?.orderIndex,
    });
  } catch (err) {
    req.log.error({ err }, "Patch checklist result error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
