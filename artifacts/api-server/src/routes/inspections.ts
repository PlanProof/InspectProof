import { Router, type IRouter } from "express";
import { eq, sql, ilike, and, gte, lte, inArray, isNotNull, type SQL } from "drizzle-orm";
import { db, inspectionsTable, projectsTable, checklistItemsTable, checklistResultsTable, issuesTable, notesTable, activityLogsTable, usersTable, checklistTemplatesTable, reportsTable, userOrganisationsTable } from "@workspace/db";
import { checkInspectionQuota, getOrgMemberIds } from "../lib/quota";
import { optionalAuth, requireAuth, isInspectorOnly, type AuthUser } from "../middleware/auth";
import { decodeSessionToken } from "../lib/session-token";

import { sendInspectionAssignedEmail } from "../lib/email";
import { sendExpoPush } from "../lib/expoPush";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "../lib/calendarEventService";

/**
 * Returns the set of org admin IDs this user may access data for.
 * - Primary org (derived from adminUserId) is included unless suspended/revoked in user_organisations.
 * - Additional cross-org memberships are included only when status = "active".
 */
async function getAccessibleOrgAdminIds(user: AuthUser): Promise<Set<number>> {
  const primaryAdminId = user.isCompanyAdmin ? user.id : (user.adminUserId ? parseInt(user.adminUserId) : user.id);

  const allMemberships = await db
    .select({ orgAdminId: userOrganisationsTable.orgAdminId, status: userOrganisationsTable.status })
    .from(userOrganisationsTable)
    .where(eq(userOrganisationsTable.userId, user.id));

  const blockedOrgAdminIds = new Set(
    allMemberships.filter(m => m.status !== "active").map(m => m.orgAdminId),
  );
  const activeExtraOrgAdminIds = allMemberships
    .filter(m => m.status === "active")
    .map(m => m.orgAdminId);

  const accessible = new Set<number>(activeExtraOrgAdminIds);
  if (!blockedOrgAdminIds.has(primaryAdminId)) {
    accessible.add(primaryAdminId);
  }
  return accessible;
}

/** Build the full set of user IDs visible to a user across all their orgs */
async function getMultiOrgMemberIds(user: AuthUser): Promise<number[]> {
  if (user.isAdmin) return [];
  const accessibleOrgAdminIds = await getAccessibleOrgAdminIds(user);
  const memberIds: number[] = [];
  for (const adminId of accessibleOrgAdminIds) {
    const ids = await getOrgMemberIds(adminId);
    memberIds.push(...ids);
  }
  memberIds.push(user.id);
  return [...new Set(memberIds)];
}

/** Returns true if the authenticated user may access the inspection (via its project). */
async function canAccessInspection(inspection: { projectId: number | null; inspectorId?: number | null }, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  if (isInspectorOnly(user)) return inspection.inspectorId === user.id;
  if (!inspection.projectId) return false;
  const [project] = await db.select({ createdById: projectsTable.createdById }).from(projectsTable).where(eq(projectsTable.id, inspection.projectId));
  if (!project) return false;
  const adminId = user.isCompanyAdmin ? user.id : (user.adminUserId ? parseInt(user.adminUserId) : user.id);
  if (project.createdById === user.id || project.createdById === adminId) return true;
  const [creator] = await db.select({ adminUserId: usersTable.adminUserId }).from(usersTable).where(eq(usersTable.id, project.createdById));
  return !!(creator?.adminUserId && parseInt(creator.adminUserId) === adminId);
}

const router: IRouter = Router();

function getUserIdFromRequest(req: any): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const { userId, valid } = decodeSessionToken(auth.slice(7));
  return valid ? userId : null;
}

/** Fetch pass/fail/monitor/na counts for a single inspection via SQL aggregates. */
async function getInspectionCounts(inspectionId: number) {
  const [row] = await db.select({
    passCount:    sql<number>`count(*) filter (where ${checklistResultsTable.result} = 'pass')::int`,
    failCount:    sql<number>`count(*) filter (where ${checklistResultsTable.result} = 'fail')::int`,
    monitorCount: sql<number>`count(*) filter (where ${checklistResultsTable.result} = 'monitor')::int`,
    naCount:      sql<number>`count(*) filter (where ${checklistResultsTable.result} = 'na')::int`,
  }).from(checklistResultsTable)
    .where(eq(checklistResultsTable.inspectionId, inspectionId));
  return row ?? { passCount: 0, failCount: 0, monitorCount: 0, naCount: 0 };
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

// ── Calendar endpoint ─────────────────────────────────────────────────────────
// Returns inspections within a date range enriched with project + inspector info.
// Uses SQL-level filtering and LEFT JOINs to avoid N+1 queries.
router.get("/calendar", optionalAuth, async (req, res) => {
  try {
    const { start, end, inspectorId: inspectorIdQ, projectId: projectIdQ, discipline } = req.query;

    // Unauthenticated — return empty immediately
    if (!req.authUser) {
      res.json([]);
      return;
    }

    // ── Build WHERE conditions ────────────────────────────────────────────────
    const conditions: SQL[] = [];

    // RBAC: all users (including platform admins) are scoped to their own org.
    // - Org admins / platform admins: rows from their org's projects
    // - Everyone else: only their own assigned inspections
    if (req.authUser.isAdmin || req.authUser.isCompanyAdmin) {
      const orgMemberIds = await getOrgMemberIds(req.authUser.id);
      const orgSet = new Set([...orgMemberIds, req.authUser.id]);
      const orgProjects = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(inArray(projectsTable.createdById, [...orgSet]));
      const projectIds = orgProjects.map(p => p.id);
      if (projectIds.length === 0) {
        res.json([]);
        return;
      }
      conditions.push(inArray(inspectionsTable.projectId, projectIds));
    } else {
      conditions.push(eq(inspectionsTable.inspectorId, req.authUser.id));
    }

    // Date range filter at SQL level
    if (start) conditions.push(gte(inspectionsTable.scheduledDate, start as string));
    if (end) conditions.push(lte(inspectionsTable.scheduledDate, end as string));

    // Additional explicit filters
    if (inspectorIdQ) conditions.push(eq(inspectionsTable.inspectorId, parseInt(inspectorIdQ as string)));
    if (projectIdQ) conditions.push(eq(inspectionsTable.projectId, parseInt(projectIdQ as string)));

    // ── Single query with LEFT JOINs ─────────────────────────────────────────
    const rows = await db
      .select({
        id: inspectionsTable.id,
        projectId: inspectionsTable.projectId,
        projectName: projectsTable.name,
        projectAddress: projectsTable.siteAddress,
        projectSuburb: projectsTable.suburb,
        inspectionType: inspectionsTable.inspectionType,
        status: inspectionsTable.status,
        scheduledDate: inspectionsTable.scheduledDate,
        scheduledEndDate: inspectionsTable.scheduledEndDate,
        scheduledTime: inspectionsTable.scheduledTime,
        completedDate: inspectionsTable.completedDate,
        inspectorId: inspectionsTable.inspectorId,
        inspectorFirstName: usersTable.firstName,
        inspectorLastName: usersTable.lastName,
        duration: inspectionsTable.duration,
        discipline: checklistTemplatesTable.discipline,
        checklistTemplateId: inspectionsTable.checklistTemplateId,
        signedOffAt: inspectionsTable.signedOffAt,
      })
      .from(inspectionsTable)
      .leftJoin(projectsTable, eq(inspectionsTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(inspectionsTable.inspectorId, usersTable.id))
      .leftJoin(checklistTemplatesTable, eq(inspectionsTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(inspectionsTable.scheduledDate);

    // Discipline filter (after join)
    let result = rows.map(r => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName ?? "Unknown",
      projectAddress: r.projectAddress ?? null,
      projectSuburb: r.projectSuburb ?? null,
      inspectionType: r.inspectionType,
      status: r.status,
      scheduledDate: r.scheduledDate,
      scheduledEndDate: r.scheduledEndDate ?? null,
      scheduledTime: r.scheduledTime,
      completedDate: r.completedDate,
      inspectorId: r.inspectorId,
      inspectorName: r.inspectorFirstName ? `${r.inspectorFirstName} ${r.inspectorLastName ?? ""}`.trim() : null,
      duration: r.duration,
      discipline: r.discipline ?? null,
      checklistTemplateId: r.checklistTemplateId,
      signedOffAt: r.signedOffAt ?? null,
    }));

    if (discipline) {
      result = result.filter(i => i.discipline === (discipline as string));
    }

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Calendar endpoint error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Calendar disciplines endpoint ─────────────────────────────────────────────
// Returns the distinct disciplines available in the authenticated user's accessible inspections.
router.get("/calendar/disciplines", optionalAuth, async (req, res) => {
  try {
    if (!req.authUser) { res.json([]); return; }

    // Build the same RBAC conditions as /calendar to prevent cross-tenant data exposure
    const conditions: SQL[] = [isNotNull(checklistTemplatesTable.discipline)];

    if (!req.authUser.isAdmin) {
      if (req.authUser.isCompanyAdmin) {
        const orgMemberIds = await getOrgMemberIds(req.authUser.id);
        const orgSet = new Set([...orgMemberIds, req.authUser.id]);
        const orgProjects = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(inArray(projectsTable.createdById, [...orgSet]));
        const projectIds = orgProjects.map(p => p.id);
        if (projectIds.length === 0) { res.json([]); return; }
        conditions.push(inArray(inspectionsTable.projectId, projectIds));
      } else {
        conditions.push(eq(inspectionsTable.inspectorId, req.authUser.id));
      }
    }

    const rows = await db
      .selectDistinct({ discipline: checklistTemplatesTable.discipline })
      .from(inspectionsTable)
      .leftJoin(checklistTemplatesTable, eq(inspectionsTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(and(...conditions));
    res.json(rows.map(r => r.discipline).filter(Boolean).sort());
  } catch (err) {
    req.log.error({ err }, "Calendar disciplines error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, status, inspectorId, fromDate, toDate, orgId } = req.query;

    // Determine which project IDs the caller may access — resolved once, used in SQL
    // Values: "all" = unrestricted, "none" = deny all, number[] = specific project IDs
    let accessibleProjectIds: number[] | string = "none";

    if (req.authUser && isInspectorOnly(req.authUser)) {
      // Inspector-role: further restricted to their own assignments below
      accessibleProjectIds = "all";
    } else if (req.authUser) {
      if (req.authUser.isAdmin) {
        // Platform admin: full visibility across all orgs
        if (orgId) {
          const filterOrgAdminId = parseInt(orgId as string);
          if (!isNaN(filterOrgAdminId)) {
            const allProjects = await db.select({ id: projectsTable.id }).from(projectsTable)
              .where(eq(projectsTable.orgAdminId, filterOrgAdminId));
            accessibleProjectIds = allProjects.map(p => p.id);
          } else {
            accessibleProjectIds = "all";
          }
        } else {
          accessibleProjectIds = "all";
        }
      } else {
        // Build the set of org admin IDs this user can access (respects suspend/revoke)
        const accessibleOrgAdminIds = await getAccessibleOrgAdminIds(req.authUser);

        const allProjects = await db.select({ id: projectsTable.id, orgAdminId: projectsTable.orgAdminId })
          .from(projectsTable);

        let filteredProjects = allProjects.filter(p => p.orgAdminId != null && accessibleOrgAdminIds.has(p.orgAdminId));

        // Optional orgId filter: narrow to a single org the user is authorised for
        if (orgId) {
          const filterOrgAdminId = parseInt(orgId as string);
          if (!isNaN(filterOrgAdminId) && accessibleOrgAdminIds.has(filterOrgAdminId)) {
            filteredProjects = filteredProjects.filter(p => p.orgAdminId === filterOrgAdminId);
          } else if (!isNaN(filterOrgAdminId)) {
            // Requested org not accessible — deny
            filteredProjects = [];
          }
        }

        accessibleProjectIds = filteredProjects.map(p => p.id);
      }
    } else {
      // Unauthenticated – only show test project inspections
      const testProjects = await db.select({ id: projectsTable.id }).from(projectsTable)
        .where(eq(projectsTable.name, "Test Project"));
      accessibleProjectIds = testProjects.map(p => p.id);
    }

    // Build a single JOIN query that fetches inspections + project info + counts together.
    // Avoids N+1 by joining projects and aggregating checklist counts inline.
    const conditions: ReturnType<typeof sql>[] = [];

    if (accessibleProjectIds === "none") {
      res.json([]);
      return;
    }

    if (accessibleProjectIds !== "all") {
      const idArr = accessibleProjectIds as number[];
      if (idArr.length === 0) {
        res.json([]);
        return;
      }
      const idList = sql.join(idArr.map(id => sql`${id}`), sql`, `);
      conditions.push(sql`i.project_id IN (${idList})`);
    }

    // Inspector-only users: further restrict to their own assignments
    if (req.authUser && isInspectorOnly(req.authUser)) {
      conditions.push(sql`i.inspector_id = ${req.authUser.id}`);
    }

    if (projectId) conditions.push(sql`i.project_id = ${parseInt(projectId as string)}`);
    if (status)    conditions.push(sql`i.status = ${status as string}`);
    if (inspectorId) conditions.push(sql`i.inspector_id = ${parseInt(inspectorId as string)}`);
    if (fromDate) conditions.push(sql`i.scheduled_date >= ${fromDate as string}`);
    if (toDate)   conditions.push(sql`i.scheduled_date <= ${toDate as string}`);

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const rows = await db.execute(sql`
      SELECT
        i.id,
        i.project_id AS "projectId",
        p.name AS "projectName",
        p.site_address AS "projectAddress",
        p.suburb AS "projectSuburb",
        p.org_admin_id AS "orgAdminId",
        p.org_admin_id AS "orgId",
        org_admin.company_name AS "orgName",
        i.inspection_type AS "inspectionType",
        i.status,
        i.scheduled_date AS "scheduledDate",
        i.scheduled_time AS "scheduledTime",
        i.completed_date AS "completedDate",
        i.inspector_id AS "inspectorId",
        TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS "inspectorName",
        i.duration,
        i.notes AS "siteNotes",
        i.weather_conditions AS "weatherConditions",
        i.checklist_template_id AS "checklistTemplateId",
        ct.name AS "checklistTemplateName",
        ct.discipline AS "checklistTemplateDiscipline",
        COUNT(cr.id) FILTER (WHERE cr.result = 'pass')::int    AS "passCount",
        COUNT(cr.id) FILTER (WHERE cr.result = 'fail')::int    AS "failCount",
        COUNT(cr.id) FILTER (WHERE cr.result = 'monitor')::int AS "monitorCount",
        COUNT(cr.id) FILTER (WHERE cr.result = 'na')::int      AS "naCount",
        i.created_at AS "createdAt"
      FROM inspections i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN users org_admin ON org_admin.id = p.org_admin_id
      LEFT JOIN users u ON u.id = i.inspector_id
      LEFT JOIN checklist_templates ct ON ct.id = i.checklist_template_id
      LEFT JOIN checklist_results cr ON cr.inspection_id = i.id
      ${whereClause}
      GROUP BY i.id, p.name, p.site_address, p.suburb, p.org_admin_id, org_admin.company_name, u.first_name, u.last_name, ct.name, ct.discipline
      ORDER BY i.scheduled_date DESC
    `);

    type InspectionListRow = Record<string, unknown> & {
      inspectorName: string | null;
      createdAt: Date | string | null;
    };
    const rawRows: InspectionListRow[] = (rows as { rows: InspectionListRow[] }).rows ?? [];
    const result = rawRows.map(r => ({
      ...r,
      inspectorName: typeof r.inspectorName === "string" ? r.inspectorName.trim() || null : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List inspections error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, checkInspectionQuota, async (req, res) => {
  try {
    const data = req.body;
    const actorId = req.authUser!.id;

    // Auto-resolve checklistTemplateId from inspectionType if not explicitly provided
    let resolvedTemplateId: number | null = data.checklistTemplateId ?? null;
    if (!resolvedTemplateId && data.inspectionType) {
      const [matched] = await db.select()
        .from(checklistTemplatesTable)
        .where(ilike(checklistTemplatesTable.inspectionType, data.inspectionType))
        .limit(1);
      if (matched) resolvedTemplateId = matched.id;
    }

    const [inspection] = await db.insert(inspectionsTable).values({
      projectId: data.projectId,
      inspectionType: data.inspectionType,
      status: "scheduled",
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      inspectorId: data.inspectorId,
      duration: data.duration,
      notes: data.notes,
      checklistTemplateId: resolvedTemplateId,
    }).returning();

    // Pre-populate checklist results from the resolved template
    if (resolvedTemplateId) {
      const items = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, resolvedTemplateId));
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
      userId: actorId,
    });

    const formatted = await formatInspection(inspection);
    res.status(201).json(formatted);

    // Send assignment email + push notification (non-blocking, after response sent)
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

        // Push notification to inspector
        if (inspector.expoPushToken && inspector.notifyOnAssignment) {
          const typeLabel = (inspection.inspectionType || "Inspection").replace(/_/g, " ");
          const dateStr = inspection.scheduledDate
            ? new Date(inspection.scheduledDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
            : "";
          sendExpoPush(
            inspector.expoPushToken,
            "New Inspection Booking",
            `${typeLabel} — ${project.name}${dateStr ? ` · ${dateStr}` : ""}`,
            { inspectionId: inspection.id, type: "assignment" },
            req.log,
          ).catch(() => {});
        }
      }
    }

    // Calendar event — fire-and-forget (only if inspector is assigned and has a scheduled date)
    if (inspection.inspectorId && inspection.scheduledDate) {
      createCalendarEvent(inspection.id, inspection.inspectorId, req.log).catch(() => {});
    }
  } catch (err) {
    req.log.error({ err }, "Create inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/run-sheet/send", requireAuth, async (req, res) => {
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

/**
 * PATCH /api/inspections/bulk
 * Bulk update inspections by ID array or filter.
 * Body: { ids?: number[], filterAll?: boolean, patch: { status?, inspectorId? }, filters?: {...} }
 */
router.patch("/bulk", requireAuth, async (req, res) => {
  try {
    const { ids, filterAll, patch, filters } = req.body;

    if (!patch || typeof patch !== "object") {
      res.status(400).json({ error: "bad_request", message: "patch payload is required" });
      return;
    }

    const requestingUserId = req.authUser!.id;

    // Resolve which inspection IDs to operate on
    let targetIds: number[] = [];

    if (filterAll) {
      let inspList = await db.select({ id: inspectionsTable.id }).from(inspectionsTable);

      // Scope to accessible projects for non-admins
      if (!req.authUser!.isAdmin) {
        const adminId = req.authUser!.isCompanyAdmin
          ? req.authUser!.id
          : (req.authUser!.adminUserId ? parseInt(req.authUser!.adminUserId) : req.authUser!.id);
        const orgMemberIds = await getOrgMemberIds(adminId);
        const orgSet = new Set([...orgMemberIds, req.authUser!.id]);
        const allProjects = await db.select({ id: projectsTable.id, createdById: projectsTable.createdById }).from(projectsTable);
        const accessibleProjectIds = new Set(allProjects.filter(p => orgSet.has(p.createdById)).map(p => p.id));
        const allInsp = await db.select().from(inspectionsTable);
        inspList = allInsp.filter(i => i.projectId !== null && accessibleProjectIds.has(i.projectId));
      }

      if (filters?.status) inspList = inspList.filter((i: any) => i.status === filters.status);
      if (filters?.inspectorId) inspList = inspList.filter((i: any) => i.inspectorId === filters.inspectorId);
      if (filters?.projectId) inspList = inspList.filter((i: any) => i.projectId === filters.projectId);

      targetIds = inspList.map(i => i.id);
    } else if (Array.isArray(ids) && ids.length > 0) {
      targetIds = ids.map(Number).filter(Boolean);
    }

    if (targetIds.length === 0) {
      res.status(400).json({ error: "bad_request", message: "No inspections selected" });
      return;
    }

    // Build update payload
    const updateData: any = { updatedAt: new Date() };
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.inspectorId !== undefined) updateData.inspectorId = patch.inspectorId;

    // Execute the bulk update
    await db.update(inspectionsTable)
      .set(updateData)
      .where(inArray(inspectionsTable.id, targetIds));

    // Build activity log description
    let actionLabel = "bulk_updated";
    let descriptionText = "";

    if (patch.status) {
      actionLabel = "bulk_status_change";
      descriptionText = `Admin bulk-changed ${targetIds.length} inspection${targetIds.length !== 1 ? "s" : ""} to "${patch.status}"`;
    } else if (patch.inspectorId !== undefined) {
      let assigneeName = "unassigned";
      if (patch.inspectorId) {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, patch.inspectorId));
        if (user) assigneeName = `${user.firstName} ${user.lastName}`.trim();
      }
      actionLabel = "bulk_assign";
      descriptionText = `Admin bulk-assigned ${targetIds.length} inspection${targetIds.length !== 1 ? "s" : ""} to ${assigneeName}`;
    } else {
      descriptionText = `Admin bulk-updated ${targetIds.length} inspection${targetIds.length !== 1 ? "s" : ""}`;
    }

    // Write a single batched activity log entry
    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: 0,
      action: actionLabel,
      description: descriptionText,
      userId: requestingUserId,
    });

    res.json({ success: true, updatedCount: targetIds.length, description: descriptionText });
  } catch (err) {
    req.log.error({ err }, "Bulk update inspections error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const inspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    const inspection = inspections[0];
    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    if (!await canAccessInspection(inspection, req.authUser!)) {
      res.status(403).json({ error: "forbidden", message: "You can only view inspections in your organisation." });
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
      issueCategory: r.result.issueCategory ?? null,
      issuePriority: r.result.issuePriority ?? null,
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
    const pAddress = project[0]?.siteAddress ?? null;
    const pSuburb = project[0]?.suburb ?? null;

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
        category: r.issueCategory ?? r.category ?? null,
        priority: r.issuePriority ?? null,
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
      projectAddress: pAddress,
      projectSuburb: pSuburb,
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

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    // Capture previous inspectorId before update to detect reassignment
    const [before] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!await canAccessInspection(before, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
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

    // Send reassignment email + push notification if inspector changed to a new (non-null) person
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

        // Push notification to newly assigned inspector
        if (inspector.expoPushToken && inspector.notifyOnAssignment) {
          const typeLabel = (inspection.inspectionType || "Inspection").replace(/_/g, " ");
          const dateStr = inspection.scheduledDate
            ? new Date(inspection.scheduledDate).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
            : "";
          const isReassignment = prevInspectorId !== null;
          sendExpoPush(
            inspector.expoPushToken,
            isReassignment ? "Inspection Reassigned to You" : "New Inspection Booking",
            `${typeLabel} — ${project.name}${dateStr ? ` · ${dateStr}` : ""}`,
            { inspectionId: inspection.id, type: isReassignment ? "reassignment" : "assignment" },
            req.log,
          ).catch(() => {});
        }
      }
    }

    // Calendar event update — fire-and-forget
    if (inspection.inspectorId && inspection.scheduledDate) {
      updateCalendarEvent(inspection.id, inspection.inspectorId, req.log).catch(() => {});
    }
  } catch (err) {
    req.log.error({ err }, "Update inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

// PATCH /:id/reschedule — drag-to-reschedule from the calendar; only updates scheduledDate
router.patch("/:id/reschedule", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { scheduledDate } = req.body;
    if (!scheduledDate) {
      res.status(400).json({ error: "scheduledDate is required" });
      return;
    }
    const [before] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!before) { res.status(404).json({ error: "not_found" }); return; }

    const actor = req.authUser!;
    // Reschedule RBAC matches calendar visibility:
    // - Platform admin → all
    // - Company admin → any inspection within their org
    // - Everyone else → only inspections they are assigned to as inspector
    const canReschedule = await (async () => {
      if (actor.isAdmin) return true;
      if (actor.isCompanyAdmin) return canAccessInspection(before, actor);
      // Non-admin non-company-admin: must be the assigned inspector
      return before.inspectorId === actor.id;
    })();

    if (!canReschedule) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    const [updated] = await db.update(inspectionsTable)
      .set({ scheduledDate, updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: id,
      action: "rescheduled",
      description: `Inspection rescheduled from ${before.scheduledDate} to ${scheduledDate} via calendar`,
      userId: req.authUser!.id,
    });

    const formatted = await formatInspection(updated);
    res.json(formatted);
  } catch (err) {
    req.log.error({ err }, "Reschedule inspection error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/checklist", requireAuth, async (req, res) => {
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
      issueCategory: r.result.issueCategory ?? null,
      issuePriority: r.result.issuePriority ?? null,
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

router.post("/:id/checklist", requireAuth, async (req, res) => {
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
router.post("/:id/reset-checklist", requireAuth, async (req, res) => {
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
router.post("/:id/apply-checklist", requireAuth, async (req, res) => {
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

router.patch("/:id/checklist/:resultId", requireAuth, async (req, res) => {
  try {
    const resultId = parseInt(req.params.resultId);
    const { result, notes, photoUrls, photoMarkups, severity, issueCategory, issuePriority, location, tradeAllocated, defectStatus, clientVisible, recommendedAction } = req.body;

    // Capture previous result before update so we can detect fault transitions
    const [prevRow] = await db.select({ result: checklistResultsTable.result })
      .from(checklistResultsTable)
      .where(eq(checklistResultsTable.id, resultId));
    const prevResult = prevRow?.result ?? null;

    const updateData: any = { updatedAt: new Date() };
    if (result !== undefined) updateData.result = result;
    if (notes !== undefined) updateData.notes = notes;
    if (photoUrls !== undefined) {
      // Deduplicate: preserve order, remove duplicate paths
      const seen = new Set<string>();
      const deduped = (photoUrls as string[]).filter(p => {
        if (seen.has(p)) return false;
        seen.add(p);
        return true;
      });
      updateData.photoUrls = JSON.stringify(deduped);
    }
    if (photoMarkups !== undefined) updateData.photoMarkups = JSON.stringify(photoMarkups);
    if (severity !== undefined) updateData.severity = severity;
    if (issueCategory !== undefined) updateData.issueCategory = issueCategory;
    if (issuePriority !== undefined) updateData.issuePriority = issuePriority;
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

    // Auto-complete: if all results for this inspection are no longer pending, update status
    if (result !== undefined) {
      const allResults = await db.select().from(checklistResultsTable)
        .where(eq(checklistResultsTable.inspectionId, updated.inspectionId));

      const allDone = allResults.length > 0 && allResults.every(r => r.result !== "pending");
      if (allDone) {
        const [insp] = await db.select().from(inspectionsTable)
          .where(eq(inspectionsTable.id, updated.inspectionId));
        if (insp && insp.status === "in_progress") {
          const hasFails = allResults.some(r => r.result === "fail");
          const hasMonitor = allResults.some(r => r.result === "monitor");
          const autoStatus = hasFails || hasMonitor ? "follow_up_required" : "completed";
          await db.update(inspectionsTable)
            .set({ status: autoStatus, completedDate: new Date() })
            .where(eq(inspectionsTable.id, updated.inspectionId));
          req.log.info({ inspectionId: updated.inspectionId, autoStatus }, "Inspection auto-completed");
        }
      }
    }

    const item = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.id, updated.checklistItemId));

    // ── Auto-create / auto-close issues on fail/monitor transitions ─────────────
    if (result !== undefined && result !== prevResult) {
      const isFaultNow  = result    === "fail" || result    === "monitor";
      const wasFaultPrev = prevResult === "fail" || prevResult === "monitor";
      // Unique marker embedded in description to find the auto-created issue later
      const descKey = `[auto:${resultId}]`;

      if (isFaultNow && !wasFaultPrev) {
        // Transition INTO a fault — create an issue (idempotent: skip if already exists)
        const existing = await db.select({ id: issuesTable.id })
          .from(issuesTable)
          .where(sql`${issuesTable.inspectionId} = ${updated.inspectionId} AND ${issuesTable.description} LIKE ${descKey + "%"}`);

        if (existing.length === 0) {
          // Fetch inspection to get projectId
          const [insp] = await db.select({ projectId: inspectionsTable.projectId })
            .from(inspectionsTable)
            .where(eq(inspectionsTable.id, updated.inspectionId));
          const itemDesc = item[0]?.description || "Checklist item";
          const notesSuffix = updated.notes ? `\n\nNotes: ${updated.notes}` : "";
          await db.insert(issuesTable).values({
            inspectionId: updated.inspectionId,
            projectId: insp?.projectId ?? null,
            title: itemDesc.length > 160 ? itemDesc.substring(0, 157) + "…" : itemDesc,
            description: `${descKey} ${itemDesc}${notesSuffix}`,
            severity: (updated.severity as any) || "medium",
            category: item[0]?.category || null,
            codeReference: item[0]?.codeReference || null,
            location: updated.location || null,
            responsibleParty: updated.tradeAllocated || null,
            status: "open",
          });
          req.log.info({ resultId, inspectionId: updated.inspectionId }, "Auto-created issue from checklist fail/monitor");
        }
      } else if (!isFaultNow && wasFaultPrev) {
        // Transition OUT of a fault — auto-close the linked issue (if still open)
        await db.update(issuesTable)
          .set({ status: "closed", resolvedDate: new Date().toISOString().split("T")[0], updatedAt: new Date() })
          .where(sql`${issuesTable.inspectionId} = ${updated.inspectionId} AND ${issuesTable.description} LIKE ${descKey + "%"} AND ${issuesTable.status} = 'open'`);
        req.log.info({ resultId, inspectionId: updated.inspectionId }, "Auto-closed issue — checklist item no longer a fault");
      }
    }
    // ────────────────────────────────────────────────────────────────────────────

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
      issueCategory: updated.issueCategory ?? null,
      issuePriority: updated.issuePriority ?? null,
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

router.post("/:id/manual-item", requireAuth, async (req, res) => {
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

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!inspection) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Delete calendar event before removing from DB
    if (inspection.inspectorId && inspection.calendarEventId) {
      deleteCalendarEvent(id, inspection.inspectorId, req.log).catch(() => {});
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
