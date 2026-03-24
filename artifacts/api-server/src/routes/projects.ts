import { Router, type IRouter } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, documentsTable, activityLogsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

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

router.get("/", async (req, res) => {
  try {
    const { status, search } = req.query;
    let projects = await db.select().from(projectsTable).orderBy(sql`${projectsTable.updatedAt} DESC`);

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

router.post("/", async (req, res) => {
  try {
    const data = req.body;
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

    const formatDoc = (d: any) => ({
      id: d.id,
      projectId: d.projectId,
      name: d.name,
      category: d.category,
      fileName: d.fileName,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      version: d.version,
      tags: d.tags || [],
      uploadedById: d.uploadedById,
      uploadedByName: "Inspector",
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
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

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(projectsTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(projectsTable.id, id));
    res.json({ success: true, message: "Project archived" });
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

export default router;
