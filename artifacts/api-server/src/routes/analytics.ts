import { Router, type IRouter } from "express";
import { sql, ne, eq } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, reportsTable, activityLogsTable, checklistResultsTable, checklistItemsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

    const [totalProjectsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(projectsTable);
    const [activeProjectsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(projectsTable).where(sql`${projectsTable.status} = 'active'`);
    const [totalInspRow] = await db.select({ count: sql<number>`count(*)::int` }).from(inspectionsTable);
    const [monthlyInspRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable).where(sql`${inspectionsTable.scheduledDate} >= ${monthStart}`);
    const [openIssuesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable).where(sql`${issuesTable.status} NOT IN ('closed', 'resolved')`);
    const [criticalRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable).where(sql`${issuesTable.severity} = 'critical' AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);
    const todayStr = now.toISOString().split("T")[0];
    const [overdueRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable).where(sql`${issuesTable.dueDate} < ${todayStr} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);
    const [pendingReportsRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(reportsTable).where(sql`${reportsTable.status} = 'draft'`);

    // Fetch ALL inspections for the calendar (entire year ±)
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
    .orderBy(inspectionsTable.scheduledDate, inspectionsTable.scheduledTime);

    // Resolve inspector names
    const users = await db.select().from(usersTable);
    const userMap = new Map(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const allInspections = allInspectionsRaw.map(i => ({
      ...i,
      inspectorName: i.inspectorId ? (userMap.get(i.inspectorId) ?? null) : null,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    }));

    // Upcoming (scheduled, future) for legacy compat
    const todayStr2 = now.toISOString().split("T")[0];
    const formattedUpcoming = allInspections.filter(
      i => i.status === "scheduled" && i.scheduledDate >= todayStr2
    ).slice(0, 5);

    const recentActivity = await db.select().from(activityLogsTable)
      .orderBy(sql`${activityLogsTable.createdAt} DESC`)
      .limit(10);

    const projectsByStage = await db.select({
      stage: projectsTable.stage,
      count: sql<number>`count(*)::int`,
    }).from(projectsTable)
      .where(sql`${projectsTable.status} = 'active'`)
      .groupBy(projectsTable.stage);

    const issuesBySeverity = await db.select({
      severity: issuesTable.severity,
      count: sql<number>`count(*)::int`,
    }).from(issuesTable)
      .where(sql`${issuesTable.status} NOT IN ('closed', 'resolved')`)
      .groupBy(issuesTable.severity);

    const inspectionsByType = await db.select({
      type: inspectionsTable.inspectionType,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where "inspections"."status" = 'completed')::int`,
      scheduled: sql<number>`count(*) filter (where "inspections"."status" = 'scheduled')::int`,
    }).from(inspectionsTable).groupBy(inspectionsTable.inspectionType);

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
    });
  } catch (err) {
    req.log.error({ err }, "Dashboard analytics error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/trends", async (req, res) => {
  try {
    // Inspections by month (last 6 months)
    const inspectionsByMonth = await db.select({
      month: sql<string>`to_char(${inspectionsTable.scheduledDate}::date, 'Mon YYYY')`,
      count: sql<number>`count(*)::int`,
    }).from(inspectionsTable)
      .where(sql`${inspectionsTable.scheduledDate}::date >= now() - interval '6 months'`)
      .groupBy(sql`to_char(${inspectionsTable.scheduledDate}::date, 'Mon YYYY'), date_trunc('month', ${inspectionsTable.scheduledDate}::date)`)
      .orderBy(sql`date_trunc('month', ${inspectionsTable.scheduledDate}::date)`);

    // Common failures from checklist
    const commonFailures = await db.select({
      description: checklistItemsTable.description,
      count: sql<number>`count(*)::int`,
    }).from(checklistResultsTable)
      .innerJoin(checklistItemsTable, sql`${checklistResultsTable.checklistItemId} = ${checklistItemsTable.id}`)
      .where(sql`${checklistResultsTable.result} = 'fail'`)
      .groupBy(checklistItemsTable.description)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // Defects by severity as categories
    const defectsByType = await db.select({
      category: issuesTable.severity,
      count: sql<number>`count(*)::int`,
    }).from(issuesTable)
      .groupBy(issuesTable.severity);

    // Average resolution days
    const resolvedIssues = await db.select().from(issuesTable)
      .where(sql`${issuesTable.resolvedDate} IS NOT NULL AND ${issuesTable.dueDate} IS NOT NULL`);

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

    // Compliance rate
    const [totalResults] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} != 'pending'`);
    const [passResults] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} = 'pass'`);

    const complianceRate = totalResults.count > 0
      ? Math.round((passResults.count / totalResults.count) * 100)
      : 0;

    res.json({
      inspectionsByMonth,
      defectsByType,
      commonFailures,
      avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
      complianceRate,
    });
  } catch (err) {
    req.log.error({ err }, "Trends analytics error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
