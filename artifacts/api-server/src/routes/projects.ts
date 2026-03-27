import { Router, type IRouter } from "express";
import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, documentsTable, activityLogsTable, usersTable, projectInspectionTypesTable, checklistTemplatesTable, checklistItemsTable, documentChecklistLinksTable, checklistResultsTable, notesTable, reportsTable } from "@workspace/db";
import { checkProjectQuota } from "../lib/quota";
import { optionalAuth } from "../middleware/auth";

const router: IRouter = Router();

function getUserIdFromRequest(req: any): number | null {
  const auth = req.headers?.authorization;
  if (!auth) return null;
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth.startsWith('Basic ') ? auth.slice(6) : null;
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [userId] = decoded.split(':');
    return Number(userId) || null;
  } catch { return null; }
}

const TEST_PROJECT_NAME = "Test Project";

function formatProject(p: any, totalInspections = 0, openIssues = 0) {
  return {
    id: p.id,
    name: p.name,
    siteAddress: p.siteAddress,
    suburb: p.suburb,
    state: p.state,
    postcode: p.postcode,
    clientName: p.clientName,
    builderName: p.builderName,
    designerName: p.designerName,
    daNumber: p.daNumber,
    certificationNumber: p.certificationNumber,
    buildingClassification: p.buildingClassification,
    projectType: p.projectType,
    status: p.status,
    stage: p.stage,
    assignedCertifierId: p.assignedCertifierId,
    assignedInspectorId: p.assignedInspectorId,
    startDate: p.startDate,
    expectedCompletionDate: p.expectedCompletionDate,
    completedDate: p.completedDate,
    totalInspections,
    openIssues,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

function formatDoc(d: any) {
  return {
    id: d.id,
    projectId: d.projectId,
    name: d.name,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    version: d.version,
    tags: d.tags || [],
    folder: d.folder || "General",
    fileUrl: d.fileUrl,
    includedInInspection: d.includedInInspection ?? true,
    uploadedById: d.uploadedById,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
  };
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let projects = await db.select().from(projectsTable).orderBy(sql`${projectsTable.updatedAt} DESC`);

    // Scope projects to the requesting user unless they are an admin
    if (req.authUser && !req.authUser.isAdmin) {
      projects = projects.filter(p =>
        p.name === TEST_PROJECT_NAME ||
        p.createdById === req.authUser!.id
      );
    } else if (!req.authUser) {
      // Unauthenticated – only show the test project
      projects = projects.filter(p => p.name === TEST_PROJECT_NAME);
    }

    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    if (search) {
      const s = (search as string).toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.siteAddress.toLowerCase().includes(s) ||
        p.clientName.toLowerCase().includes(s) ||
        p.suburb.toLowerCase().includes(s)
      );
    }

    const result = await Promise.all(projects.map(async (p) => {
      const [inspCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(inspectionsTable).where(eq(inspectionsTable.projectId, p.id));
      const [issueCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(issuesTable).where(sql`${issuesTable.projectId} = ${p.id} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);
      return formatProject(p, inspCount.count, issueCount.count);
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List projects error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", checkProjectQuota, async (req, res) => {
  try {
    const data = req.body;
    const createdById = getUserIdFromRequest(req);
    const [project] = await db.insert(projectsTable).values({
      name: data.name,
      siteAddress: data.siteAddress,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      clientName: data.clientName,
      builderName: data.builderName,
      designerName: data.designerName,
      daNumber: data.daNumber,
      certificationNumber: data.certificationNumber,
      buildingClassification: data.buildingClassification,
      projectType: data.projectType || "residential",
      status: "active",
      stage: "pre_construction",
      assignedCertifierId: data.assignedCertifierId,
      assignedInspectorId: data.assignedInspectorId,
      createdById: createdById ?? undefined,
      startDate: data.startDate,
      expectedCompletionDate: data.expectedCompletionDate,
    }).returning();

    await db.insert(activityLogsTable).values({
      entityType: "project",
      entityId: project.id,
      action: "created",
      description: `Project "${project.name}" created`,
      userId: 1,
    });

    res.status(201).json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Create project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    const project = projects[0];
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const inspections = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.projectId, id))
      .orderBy(sql`${inspectionsTable.scheduledDate} DESC`);

    const issues = await db.select().from(issuesTable)
      .where(eq(issuesTable.projectId, id))
      .orderBy(sql`${issuesTable.createdAt} DESC`);

    const documents = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.createdAt} DESC`);

    const openIssues = issues.filter(i => !['closed', 'resolved'].includes(i.status)).length;

    const formatInspection = (i: any) => ({
      id: i.id,
      projectId: i.projectId,
      projectName: project.name,
      inspectionType: i.inspectionType,
      status: i.status,
      scheduledDate: i.scheduledDate,
      scheduledTime: i.scheduledTime,
      completedDate: i.completedDate,
      inspectorId: i.inspectorId,
      inspectorName: null,
      duration: i.duration,
      notes: i.notes,
      weatherConditions: i.weatherConditions,
      checklistTemplateId: i.checklistTemplateId,
      passCount: 0, failCount: 0, naCount: 0,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    });

    const formatIssue = (i: any) => ({
      id: i.id,
      projectId: i.projectId,
      inspectionId: i.inspectionId,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      location: i.location,
      codeReference: i.codeReference,
      responsibleParty: i.responsibleParty,
      dueDate: i.dueDate,
      resolvedDate: i.resolvedDate,
      assignedToId: i.assignedToId,
      projectName: project.name,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
      updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
    });

    res.json({
      ...formatProject(project, inspections.length, openIssues),
      inspections: inspections.map(formatInspection),
      recentIssues: issues.slice(0, 5).map(formatIssue),
      documents: documents.map(formatDoc),
    });
  } catch (err) {
    req.log.error({ err }, "Get project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    const [project] = await db.update(projectsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();

    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db.insert(activityLogsTable).values({
      entityType: "project",
      entityId: project.id,
      action: "updated",
      description: `Project "${project.name}" updated`,
      userId: 1,
    });

    res.json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Update project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const allowed = ["status", "name", "siteAddress", "suburb", "state", "postcode", "client", "builder",
      "designer", "stage", "projectType", "daNumber", "certificationNumber", "buildingClassification",
      "startDate", "expectedCompletion"];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in req.body) data[key] = req.body[key];
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    const [project] = await db.update(projectsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Patch project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Confirm project exists
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Get all inspection IDs for this project
    const inspections = await db.select({ id: inspectionsTable.id })
      .from(inspectionsTable).where(eq(inspectionsTable.projectId, id));
    const inspectionIds = inspections.map(i => i.id);

    if (inspectionIds.length > 0) {
      // Delete checklist results, notes, reports, and activity logs for inspections
      await db.delete(checklistResultsTable).where(inArray(checklistResultsTable.inspectionId, inspectionIds));
      await db.delete(notesTable).where(inArray(notesTable.inspectionId, inspectionIds));
      await db.delete(reportsTable).where(inArray(reportsTable.inspectionId, inspectionIds));
      await db.delete(issuesTable).where(inArray(issuesTable.inspectionId, inspectionIds));
    }

    // Delete all inspections for this project
    await db.delete(inspectionsTable).where(eq(inspectionsTable.projectId, id));

    // Delete document–checklist links, documents, project-level issues
    await db.delete(documentChecklistLinksTable).where(eq(documentChecklistLinksTable.projectId, id));
    await db.delete(documentsTable).where(eq(documentsTable.projectId, id));
    await db.delete(issuesTable).where(eq(issuesTable.projectId, id));

    // Delete project inspection type assignments and activity logs
    await db.delete(projectInspectionTypesTable).where(eq(projectInspectionTypesTable.projectId, id));
    await db.delete(activityLogsTable).where(sql`${activityLogsTable.entityType} = 'project' AND ${activityLogsTable.entityId} = ${id}`);

    // Finally delete the project
    await db.delete(projectsTable).where(eq(projectsTable.id, id));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/activity", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const logs = await db.select().from(activityLogsTable)
      .where(sql`${activityLogsTable.entityType} = 'project' AND ${activityLogsTable.entityId} = ${id}`)
      .orderBy(sql`${activityLogsTable.createdAt} DESC`)
      .limit(20);

    res.json(logs.map(l => ({
      id: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      action: l.action,
      description: l.description,
      userId: l.userId,
      userName: "Admin User",
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Get project activity error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Documents ────────────────────────────────────────────────────────────────

router.get("/:id/documents", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docs = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.folder} ASC, ${documentsTable.name} ASC`);
    res.json(docs.map(formatDoc));
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/documents", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, fileName, fileSize, mimeType, fileUrl, folder, includedInInspection } = req.body;
    const [doc] = await db.insert(documentsTable).values({
      projectId: id,
      name: name || fileName,
      category: "other",
      fileName: fileName,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      fileUrl: fileUrl || null,
      folder: folder || "General",
      includedInInspection: includedInInspection ?? true,
      uploadedById: 1,
    }).returning();
    res.status(201).json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "Create document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/documents/:docId", async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const updates: any = { updatedAt: new Date() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.folder !== undefined) updates.folder = req.body.folder;
    if (req.body.includedInInspection !== undefined) updates.includedInInspection = req.body.includedInInspection;

    const [doc] = await db.update(documentsTable)
      .set(updates)
      .where(eq(documentsTable.id, docId))
      .returning();

    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "Update document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id/documents/:docId", async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    await db.delete(documentsTable).where(eq(documentsTable.id, docId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/documents/folders", async (req, res) => {
  try {
    const { folderName } = req.body;
    if (!folderName?.trim()) {
      res.status(400).json({ error: "folder_name_required" });
      return;
    }
    res.json({ folderName: folderName.trim() });
  } catch (err) {
    req.log.error({ err }, "Create folder error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/documents/folders/:folderName", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const oldName = decodeURIComponent(req.params.folderName);
    const { newName } = req.body;
    if (!newName?.trim()) {
      res.status(400).json({ error: "new_name_required" });
      return;
    }
    await db.update(documentsTable)
      .set({ folder: newName.trim(), updatedAt: new Date() })
      .where(and(eq(documentsTable.projectId, id), eq(documentsTable.folder, oldName)));
    res.json({ success: true, folderName: newName.trim() });
  } catch (err) {
    req.log.error({ err }, "Rename folder error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Inspection Types ─────────────────────────────────────────────────────────

router.get("/:id/inspection-types", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const all = await db.select({
      id: checklistTemplatesTable.id,
      name: checklistTemplatesTable.name,
      inspectionType: checklistTemplatesTable.inspectionType,
      folder: checklistTemplatesTable.folder,
      itemCount: sql<number>`cast(count(${checklistItemsTable.id}) as int)`,
    }).from(checklistTemplatesTable)
      .leftJoin(checklistItemsTable, eq(checklistItemsTable.templateId, checklistTemplatesTable.id))
      .groupBy(checklistTemplatesTable.id)
      .orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.name} ASC`);

    const selected = await db.select().from(projectInspectionTypesTable)
      .where(eq(projectInspectionTypesTable.projectId, id));

    const selectedIds = new Set(selected.filter(s => s.isSelected).map(s => s.templateId));

    res.json(all.map(t => ({
      templateId: t.id,
      name: t.name,
      inspectionType: t.inspectionType,
      folder: t.folder,
      itemCount: t.itemCount,
      isSelected: selectedIds.has(t.id),
    })));
  } catch (err) {
    req.log.error({ err }, "Get inspection types error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id/inspection-types", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { selectedTemplateIds } = req.body as { selectedTemplateIds: number[] };

    await db.delete(projectInspectionTypesTable)
      .where(eq(projectInspectionTypesTable.projectId, id));

    if (selectedTemplateIds?.length) {
      await db.insert(projectInspectionTypesTable).values(
        selectedTemplateIds.map((tid, i) => ({
          projectId: id,
          inspectionType: "template",
          isSelected: true,
          templateId: tid,
          sortOrder: i,
        }))
      );
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Update inspection types error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Checklist Items (for linking to documents) ────────────────────────────────

router.get("/:id/checklist-items", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const selected = await db.select().from(projectInspectionTypesTable)
      .where(and(eq(projectInspectionTypesTable.projectId, id), eq(projectInspectionTypesTable.isSelected, true)));

    if (!selected.length) {
      res.json([]);
      return;
    }

    const templateIds = selected.map(s => s.templateId).filter(Boolean) as number[];
    const allItems: any[] = [];

    for (const templateId of templateIds) {
      const template = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, templateId));
      if (!template[0]) continue;
      const items = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, templateId))
        .orderBy(checklistItemsTable.orderIndex);
      allItems.push({ templateId, templateName: template[0].name, inspectionType: template[0].inspectionType, items });
    }

    res.json(allItems);
  } catch (err) {
    req.log.error({ err }, "List checklist items error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Document ↔ Checklist Item Links ──────────────────────────────────────────

router.get("/:id/documents/:docId/checklist-links", async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const links = await db.select().from(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.documentId, docId));
    res.json(links.map(l => l.checklistItemId));
  } catch (err) {
    req.log.error({ err }, "Get checklist links error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id/documents/:docId/checklist-links", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    const { itemIds } = req.body as { itemIds: number[] };

    await db.delete(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.documentId, docId));

    if (itemIds?.length) {
      await db.insert(documentChecklistLinksTable).values(
        itemIds.map(itemId => ({ documentId: docId, checklistItemId: itemId, projectId: id }))
      );
    }

    res.json({ success: true, linkedCount: itemIds?.length ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Set checklist links error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Documents with linked checklist item ids (enriched list) ─────────────────

router.get("/:id/documents-with-links", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docs = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.folder} ASC, ${documentsTable.name} ASC`);

    const links = await db.select().from(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.projectId, id));

    const linksByDoc: Record<number, number[]> = {};
    for (const l of links) {
      if (!linksByDoc[l.documentId]) linksByDoc[l.documentId] = [];
      linksByDoc[l.documentId].push(l.checklistItemId);
    }

    res.json(docs.map(d => ({
      ...formatDoc(d),
      linkedItemIds: linksByDoc[d.id] ?? [],
    })));
  } catch (err) {
    req.log.error({ err }, "List docs with links error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
