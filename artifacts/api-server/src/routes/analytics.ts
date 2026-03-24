import { Router, type IRouter } from "express";
import { sql, ne } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, reportsTable, activityLogsTable, checklistResultsTable, checklistItemsTable } from "@workspace/db";

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

    const upcomingInspections = await db.select().from(inspectionsTable)
      .where(sql`${inspectionsTable.status} = 'scheduled' AND ${inspectionsTable.scheduledDate} >= ${now.toISOString().split("T")[0]}`)
      .orderBy(inspectionsTable.scheduledDate)
      .limit(5);

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

    // Format upcoming inspections with project names
    const formattedUpcoming = await Promise.all(upcomingInspections.map(async (i) => {
      const projects = await db.select().from(projectsTable).where(sql`${projectsTable.id} = ${i.projectId}`);
      return {
        id: i.id,
        projectId: i.projectId,
        projectName: projects[0]?.name || "Unknown",
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
      };
    }));

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
