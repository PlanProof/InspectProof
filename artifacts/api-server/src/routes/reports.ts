import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, reportsTable, projectsTable, inspectionsTable, issuesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function formatReport(r: any) {
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, r.projectId));
  const pName = projects[0]?.name || "Unknown";

  let generatedByName = "Unknown";
  if (r.generatedById) {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, r.generatedById));
    if (users[0]) generatedByName = `${users[0].firstName} ${users[0].lastName}`;
  }

  return {
    id: r.id,
    projectId: r.projectId,
    inspectionId: r.inspectionId,
    title: r.title,
    reportType: r.reportType,
    status: r.status,
    generatedById: r.generatedById,
    generatedByName,
    projectName: pName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { projectId } = req.query;
    let reports = await db.select().from(reportsTable)
      .orderBy(sql`${reportsTable.createdAt} DESC`);

    if (projectId) reports = reports.filter(r => r.projectId === parseInt(projectId as string));

    const result = await Promise.all(reports.map(formatReport));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List reports error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const [report] = await db.insert(reportsTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      title: data.title,
      reportType: data.reportType,
      status: "draft",
      generatedById: data.generatedById,
    }).returning();

    res.status(201).json(await formatReport(report));
  } catch (err) {
    req.log.error({ err }, "Create report error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const reports = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const report = reports[0];
    if (!report) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, report.projectId));
    const project = projects[0];

    let inspection = null;
    if (report.inspectionId) {
      const inspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, report.inspectionId));
      if (inspections[0]) {
        inspection = {
          id: inspections[0].id,
          projectId: inspections[0].projectId,
          projectName: project?.name || "Unknown",
          inspectionType: inspections[0].inspectionType,
          status: inspections[0].status,
          scheduledDate: inspections[0].scheduledDate,
          scheduledTime: inspections[0].scheduledTime,
          completedDate: inspections[0].completedDate,
          inspectorId: inspections[0].inspectorId,
          inspectorName: null,
          duration: inspections[0].duration,
          notes: inspections[0].notes,
          weatherConditions: inspections[0].weatherConditions,
          checklistTemplateId: inspections[0].checklistTemplateId,
          passCount: 0, failCount: 0, naCount: 0,
          createdAt: inspections[0].createdAt instanceof Date ? inspections[0].createdAt.toISOString() : inspections[0].createdAt,
        };
      }
    }

    const issues = await db.select().from(issuesTable).where(eq(issuesTable.projectId, report.projectId));

    let generatedByName = "Unknown";
    if (report.generatedById) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, report.generatedById));
      if (users[0]) generatedByName = `${users[0].firstName} ${users[0].lastName}`;
    }

    const pName = project?.name || "Unknown";

    const formatProject = (p: any) => ({
      id: p.id, name: p.name, siteAddress: p.siteAddress,
      suburb: p.suburb, state: p.state, postcode: p.postcode,
      clientName: p.clientName, builderName: p.builderName,
      designerName: p.designerName, daNumber: p.daNumber,
      certificationNumber: p.certificationNumber,
      buildingClassification: p.buildingClassification,
      projectType: p.projectType, status: p.status, stage: p.stage,
      assignedCertifierId: p.assignedCertifierId,
      assignedInspectorId: p.assignedInspectorId,
      startDate: p.startDate, expectedCompletionDate: p.expectedCompletionDate,
      completedDate: p.completedDate,
      totalInspections: 0, openIssues: 0,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
    });

    res.json({
      id: report.id,
      projectId: report.projectId,
      inspectionId: report.inspectionId,
      title: report.title,
      reportType: report.reportType,
      status: report.status,
      generatedById: report.generatedById,
      generatedByName,
      projectName: pName,
      createdAt: report.createdAt instanceof Date ? report.createdAt.toISOString() : report.createdAt,
      project: project ? formatProject(project) : null,
      inspection,
      issues: issues.map(i => ({
        id: i.id, projectId: i.projectId, inspectionId: i.inspectionId,
        title: i.title, description: i.description, severity: i.severity,
        status: i.status, location: i.location, codeReference: i.codeReference,
        responsibleParty: i.responsibleParty, dueDate: i.dueDate, resolvedDate: i.resolvedDate,
        assignedToId: i.assignedToId, projectName: pName,
        createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
        updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get report error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
