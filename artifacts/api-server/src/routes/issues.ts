import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, issuesTable, projectsTable, activityLogsTable } from "@workspace/db";
import { optionalAuth } from "../middleware/auth";

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

async function formatIssue(i: any) {
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, i.projectId));
  const pName = projects[0]?.name || "Unknown";
  return {
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
    projectName: pName,
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
  };
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, inspectionId, status, severity } = req.query;
    let issues = await db.select().from(issuesTable)
      .orderBy(sql`${issuesTable.createdAt} DESC`);

    // Scope issues to user's accessible projects
    if (req.authUser && !req.authUser.isAdmin) {
      const allProjects = await db.select({ id: projectsTable.id, name: projectsTable.name, createdById: projectsTable.createdById })
        .from(projectsTable);
      const accessibleIds = allProjects
        .filter(p => p.name === "Test Project" || p.createdById === req.authUser!.id)
        .map(p => p.id);
      issues = issues.filter(i => accessibleIds.includes(i.projectId));
    } else if (!req.authUser) {
      issues = [];
    }

    if (projectId) issues = issues.filter(i => i.projectId === parseInt(projectId as string));
    if (inspectionId) issues = issues.filter(i => i.inspectionId === parseInt(inspectionId as string));
    if (status) issues = issues.filter(i => i.status === status);
    if (severity) issues = issues.filter(i => i.severity === severity);

    const result = await Promise.all(issues.map(formatIssue));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List issues error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    if (!data.title || !data.severity) {
      res.status(400).json({ error: "bad_request", message: "title and severity are required" });
      return;
    }
    const requestingUserId = getUserIdFromRequest(req);
    const [issue] = await db.insert(issuesTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      status: "open",
      location: data.location,
      codeReference: data.codeReference,
      responsibleParty: data.responsibleParty,
      dueDate: data.dueDate,
      assignedToId: data.assignedToId,
    }).returning();

    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: issue.id,
      action: "created",
      description: `Issue "${issue.title}" created (${issue.severity} severity)`,
      userId: requestingUserId ?? 1,
    });

    const formatted = await formatIssue(issue);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const issues = await db.select().from(issuesTable).where(eq(issuesTable.id, id));
    if (!issues[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(await formatIssue(issues[0]));
  } catch (err) {
    req.log.error({ err }, "Get issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    const [issue] = await db.update(issuesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(issuesTable.id, id))
      .returning();

    if (!issue) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: id,
      action: "updated",
      description: `Issue "${issue.title}" updated to ${data.status || issue.status}`,
      userId: 1,
    });

    res.json(await formatIssue(issue));
  } catch (err) {
    req.log.error({ err }, "Update issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
