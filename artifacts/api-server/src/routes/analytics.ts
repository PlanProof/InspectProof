import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, reportsTable, activityLogsTable, checklistResultsTable, checklistItemsTable, usersTable } from "@workspace/db";
import { optionalAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(optionalAuth);

router.get("/dashboard", async (req, res) => {
  try {
    const userId = (req as any).authUser?.id ?? null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const todayStr = now.toISOString().split("T")[0];

    // SQL subquery fragments scoped to the current user's projects
    const userProjects = userId
      ? sql`(SELECT id FROM projects WHERE created_by_id = ${userId})`
      : sql`(SELECT id FROM projects WHERE 1=0)`;
    const userInspections = userId
      ? sql`(SELECT id FROM inspections WHERE project_id IN (SELECT id FROM projects WHERE created_by_id = ${userId}))`
      : sql`(SELECT id FROM inspections WHERE 1=0)`;

    const [totalProjectsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(userId ? sql`${projectsTable.createdById} = ${userId}` : sql`1=0`);

    const [activeProjectsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(userId ? sql`${projectsTable.createdById} = ${userId} AND ${projectsTable.status} = 'active'` : sql`1=0`);

    const [totalInspRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects}`);

    const [monthlyInspRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects} AND ${inspectionsTable.scheduledDate} >= ${monthStart}`);

    const [openIssuesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);

    const [criticalRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.severity} = 'critical' AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);

    const [overdueRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.dueDate} < ${todayStr} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);

    const [pendingReportsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(reportsTable)
      .where(sql`${reportsTable.inspectionId} IN ${userInspections} AND ${reportsTable.status} = 'draft'`);

    // Fetch ALL inspections for the calendar scoped to user's projects
    const allInspectionsRaw = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      projectName: projectsTable.name,
      siteAddress: projectsTable.siteAddress,
      inspectionType: inspectionsTable.inspectionType,
      status: inspectionsTable.status,
      scheduledDate: inspectionsTable.scheduledDate,
      scheduledTime: inspectionsTable.scheduledTime,
      completedDate: inspectionsTable.completedDate,
      inspectorId: inspectionsTable.inspectorId,
      duration: inspectionsTable.duration,
      notes: inspectionsTable.notes,
      createdAt: inspectionsTable.createdAt,
    })
    .from(inspectionsTable)
    .leftJoin(projectsTable, eq(inspectionsTable.projectId, projectsTable.id))
    .where(sql`${inspectionsTable.projectId} IN ${userProjects}`)
    .orderBy(inspectionsTable.scheduledDate, inspectionsTable.scheduledTime);

    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const allInspections = allInspectionsRaw.map(i => ({
      ...i,
      inspectorName: i.inspectorId ? (userMap.get(i.inspectorId) ?? null) : null,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    }));

    const formattedUpcoming = allInspections.filter(
      i => i.status === "scheduled" && i.scheduledDate >= todayStr
    ).slice(0, 5);

    const recentActivity = await db.select().from(activityLogsTable)
      .where(sql`${activityLogsTable.userId} = ${userId ?? 0}`)
      .orderBy(sql`${activityLogsTable.createdAt} DESC`)
      .limit(10);

    const projectsByStage = await db.select({
      stage: projectsTable.stage,
      count: sql<number>`count(*)::int`,
    }).from(projectsTable)
      .where(userId ? sql`${projectsTable.createdById} = ${userId} AND ${projectsTable.status} = 'active'` : sql`1=0`)
      .groupBy(projectsTable.stage);

    const issuesBySeverity = await db.select({
      severity: issuesTable.severity,
      count: sql<number>`count(*)::int`,
    }).from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`)
      .groupBy(issuesTable.severity);

    const inspectionsByType = await db.select({
      type: inspectionsTable.inspectionType,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${inspectionsTable.status} = 'completed')::int`,
      scheduled: sql<number>`count(*) filter (where ${inspectionsTable.status} = 'scheduled')::int`,
    }).from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects}`)
      .groupBy(inspectionsTable.inspectionType);

    const [totalResultsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} != 'pending'`);

    const [passResultsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} = 'pass'`);

    const complianceRate = totalResultsRow.count > 0
      ? Math.round((passResultsRow.count / totalResultsRow.count) * 100)
      : null;

    res.json({
      totalProjects: totalProjectsRow.count,
      activeProjects: activeProjectsRow.count,
      totalInspections: totalInspRow.count,
      inspectionsThisMonth: monthlyInspRow.count,
      openIssues: openIssuesRow.count,
      criticalIssues: criticalRow.count,
      overdueIssues: overdueRow.count,
      reportsPending: pendingReportsRow.count,
      upcomingInspections: formattedUpcoming,
      allInspections,
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        action: a.action,
        description: a.description,
        userId: a.userId,
        userName: "Admin User",
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      })),
      projectsByStage,
      issuesBySeverity,
      inspectionsByType,
      complianceRate,
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard analytics error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/trends", async (req, res) => {
  try {
    const userId = (req as any).authUser?.id ?? null;

    const userProjects = userId
      ? sql`(SELECT id FROM projects WHERE created_by_id = ${userId})`
      : sql`(SELECT id FROM projects WHERE 1=0)`;
    const userInspections = userId
      ? sql`(SELECT id FROM inspections WHERE project_id IN (SELECT id FROM projects WHERE created_by_id = ${userId}))`
      : sql`(SELECT id FROM inspections WHERE 1=0)`;

    const inspectionsByMonth = await db.select({
      month: sql<string>`to_char(date_trunc('month', ${inspectionsTable.scheduledDate}::date), 'Mon')`,
      total: sql<number>`count(*)::int`,
    }).from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects} AND ${inspectionsTable.scheduledDate}::date >= now() - interval '12 months'`)
      .groupBy(sql`date_trunc('month', ${inspectionsTable.scheduledDate}::date)`)
      .orderBy(sql`date_trunc('month', ${inspectionsTable.scheduledDate}::date)`);

    const passFailRaw = await db.select({
      result: checklistResultsTable.result,
      count: sql<number>`count(*)::int`,
    }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} != 'pending'`)
      .groupBy(checklistResultsTable.result);

    const resultLabelMap: Record<string, string> = {
      pass: "Pass",
      fail: "Fail",
      na: "N/A",
      monitor: "Monitor",
    };
    const passFailMap: Record<string, number> = {};
    for (const r of passFailRaw) {
      const label = resultLabelMap[r.result] ?? r.result;
      passFailMap[label] = (passFailMap[label] ?? 0) + r.count;
    }
    const passFailBreakdown = Object.entries(passFailMap).map(([name, value]) => ({ name, value }));

    const complianceTrendRaw = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', cr.created_at::date), 'Mon') AS month,
        date_trunc('month', cr.created_at::date) AS month_date,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE cr.result = 'pass') /
          NULLIF(COUNT(*) FILTER (WHERE cr.result != 'pending'), 0)
        )::int AS rate
      FROM checklist_results cr
      WHERE cr.created_at::date >= now() - interval '12 months'
        AND cr.result != 'pending'
        AND cr.inspection_id IN ${userInspections}
      GROUP BY date_trunc('month', cr.created_at::date)
      ORDER BY date_trunc('month', cr.created_at::date)
    `);
    const trendRows: any[] = Array.isArray(complianceTrendRaw)
      ? complianceTrendRaw
      : (complianceTrendRaw as any).rows ?? [];
    const complianceTrend = trendRows.map((r: any) => ({
      month: r.month as string,
      rate: Number(r.rate ?? 0),
    }));

    const issuesBySeverity = await db.select({
      name: issuesTable.severity,
      count: sql<number>`count(*)::int`,
    }).from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`)
      .groupBy(issuesTable.severity)
      .orderBy(sql`count(*) DESC`);

    const commonFailures = await db.select({
      description: checklistItemsTable.description,
      count: sql<number>`count(*)::int`,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, sql`${checklistResultsTable.checklistItemId} = ${checklistItemsTable.id}`)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} = 'fail'`)
      .groupBy(checklistItemsTable.description)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    const resolvedIssues = await db.select().from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.resolvedDate} IS NOT NULL AND ${issuesTable.dueDate} IS NOT NULL`);

    let avgResolutionDays = 0;
    if (resolvedIssues.length > 0) {
      const totalDays = resolvedIssues.reduce((sum, i) => {
        if (i.resolvedDate && i.dueDate) {
          const diff = (new Date(i.resolvedDate).getTime() - new Date(i.dueDate).getTime()) / (1000 * 60 * 60 * 24);
          return sum + Math.abs(diff);
        }
        return sum;
      }, 0);
      avgResolutionDays = totalDays / resolvedIssues.length;
    }

    const [totalResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} != 'pending'`);

    const [passResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} = 'pass'`);

    const complianceRate = totalResults.count > 0
      ? Math.round((passResults.count / totalResults.count) * 100)
      : null;

    res.json({
      inspectionsByMonth,
      passFailBreakdown,
      complianceTrend,
      issuesBySeverity,
      commonFailures,
      avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
      complianceRate,
    });
  } catch (err) {
    req.log.error({ err }, "Trends analytics error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const userId = (req as any).authUser?.id ?? null;

    const userProjects = userId
      ? sql`(SELECT id FROM projects WHERE created_by_id = ${userId})`
      : sql`(SELECT id FROM projects WHERE 1=0)`;
    const userInspections = userId
      ? sql`(SELECT id FROM inspections WHERE project_id IN (SELECT id FROM projects WHERE created_by_id = ${userId}))`
      : sql`(SELECT id FROM inspections WHERE 1=0)`;

    const [totalInspRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects}`);

    const [completedRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable)
      .where(sql`${inspectionsTable.projectId} IN ${userProjects} AND ${inspectionsTable.status} = 'completed'`);

    const [openIssuesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable)
      .where(sql`${issuesTable.projectId} IN ${userProjects} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);

    const [totalResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} != 'pending'`);

    const [passResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable)
      .where(sql`${checklistResultsTable.inspectionId} IN ${userInspections} AND ${checklistResultsTable.result} = 'pass'`);

    const complianceRate = totalResults.count > 0
      ? Math.round((passResults.count / totalResults.count) * 100)
      : null;
    const completionRate = totalInspRow.count > 0
      ? Math.round((completedRow.count / totalInspRow.count) * 100)
      : null;

    res.json({
      complianceRate,
      completionRate,
      openIssues: openIssuesRow.count,
      totalInspections: totalInspRow.count,
    });
  } catch (err) {
    req.log.error({ err }, "Insights analytics error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
