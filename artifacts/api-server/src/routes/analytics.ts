import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
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

    // Upcoming (scheduled, future)
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

    // Overall compliance rate for KPI display
    const [totalResultsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} != 'pending'`);
    const [passResultsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} = 'pass'`);
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
    // Inspections by month (last 12 months)
    const inspectionsByMonth = await db.select({
      month: sql<string>`to_char(date_trunc('month', ${inspectionsTable.scheduledDate}::date), 'Mon')`,
      total: sql<number>`count(*)::int`,
    }).from(inspectionsTable)
      .where(sql`${inspectionsTable.scheduledDate}::date >= now() - interval '12 months'`)
      .groupBy(sql`date_trunc('month', ${inspectionsTable.scheduledDate}::date)`)
      .orderBy(sql`date_trunc('month', ${inspectionsTable.scheduledDate}::date)`);

    // Pass / Fail / N/A breakdown from checklist results
    const passFailRaw = await db.select({
      result: checklistResultsTable.result,
      count: sql<number>`count(*)::int`,
    }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} != 'pending'`)
      .groupBy(checklistResultsTable.result);

    const resultLabelMap: Record<string, string> = {
      pass: "Pass",
      fail: "Fail",
      na: "N/A",
      monitor: "Monitor",
    };
    // Merge by label so duplicates combine correctly
    const passFailMap: Record<string, number> = {};
    for (const r of passFailRaw) {
      const label = resultLabelMap[r.result] ?? r.result;
      passFailMap[label] = (passFailMap[label] ?? 0) + r.count;
    }
    const passFailBreakdown = Object.entries(passFailMap).map(([name, value]) => ({ name, value }));

    // Compliance rate trend — monthly for last 12 months
    const complianceTrendRaw = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', created_at::date), 'Mon') AS month,
        date_trunc('month', created_at::date) AS month_date,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE result = 'pass') /
          NULLIF(COUNT(*) FILTER (WHERE result != 'pending'), 0)
        )::int AS rate
      FROM checklist_results
      WHERE created_at::date >= now() - interval '12 months'
        AND result != 'pending'
      GROUP BY date_trunc('month', created_at::date)
      ORDER BY date_trunc('month', created_at::date)
    `);
    const trendRows: any[] = Array.isArray(complianceTrendRaw)
      ? complianceTrendRaw
      : (complianceTrendRaw as any).rows ?? [];
    const complianceTrend = trendRows.map((r: any) => ({
      month: r.month as string,
      rate: Number(r.rate ?? 0),
    }));

    // Issues by severity (active only)
    const issuesBySeverity = await db.select({
      name: issuesTable.severity,
      count: sql<number>`count(*)::int`,
    }).from(issuesTable)
      .where(sql`${issuesTable.status} NOT IN ('closed', 'resolved')`)
      .groupBy(issuesTable.severity)
      .orderBy(sql`count(*) DESC`);

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

    // Overall compliance rate
    const [totalResults] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} != 'pending'`);
    const [passResults] = await db.select({ count: sql<number>`count(*)::int` }).from(checklistResultsTable)
      .where(sql`${checklistResultsTable.result} = 'pass'`);
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
    const [totalInspRow] = await db.select({ count: sql<number>`count(*)::int` }).from(inspectionsTable);
    const [completedRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(inspectionsTable).where(sql`${inspectionsTable.status} = 'completed'`);
    const [openIssuesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(issuesTable).where(sql`${issuesTable.status} NOT IN ('closed', 'resolved')`);
    const [totalResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable).where(sql`${checklistResultsTable.result} != 'pending'`);
    const [passResults] = await db.select({ count: sql<number>`count(*)::int` })
      .from(checklistResultsTable).where(sql`${checklistResultsTable.result} = 'pass'`);
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
