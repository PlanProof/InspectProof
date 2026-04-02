import { Request, Response, NextFunction } from 'express';
import { db, projectsTable, inspectionsTable, usersTable } from '@workspace/db';
import { eq, sql, count, and, gte, ne, inArray } from 'drizzle-orm';
import { getLimits } from './planLimits';

function getUserId(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(7), 'base64').toString();
    const [userId] = decoded.split(':');
    return Number(userId);
  } catch {
    return null;
  }
}

async function getUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

/**
 * Resolve the billing owner for quota purposes.
 * Team members (non-admins) share the org admin's plan and usage bucket.
 * Returns the admin user if adminUserId is set, otherwise the user itself.
 */
async function resolveBillingOwner(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;
  if (user.isCompanyAdmin) return user;
  if (user.adminUserId) {
    const adminId = parseInt(user.adminUserId);
    if (!isNaN(adminId)) {
      const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
      if (admin) return admin;
    }
  }
  return user;
}

/**
 * Get all user IDs in the org: the admin plus all team members whose adminUserId = admin.id.
 * Used for shared-pool quota counting.
 */
async function getOrgMemberIds(adminId: number): Promise<number[]> {
  const members = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.adminUserId, String(adminId)));
  return [adminId, ...members.map(m => m.id)];
}

export async function checkProjectQuota(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) return next();

  const user = await getUser(userId);
  if (!user) return next();

  // mobileOnly users cannot create projects at all
  if (user.mobileOnly) {
    return res.status(403).json({
      error: 'mobile_only_restricted',
      message: 'Your account is restricted to mobile app access. Creating projects requires a desktop plan.',
    });
  }

  const owner = await resolveBillingOwner(user);
  if (!owner) return next();

  const limits = getLimits(owner.plan ?? 'free_trial');
  if (limits.maxProjects === null) return next();

  const overrideMax = owner.planOverrideProjects ? Number(owner.planOverrideProjects) : null;
  const effectiveMax = overrideMax ?? limits.maxProjects;

  // Count projects across the entire org (admin + all team members with adminUserId = admin.id)
  const orgMemberIds = await getOrgMemberIds(owner.id);

  const [{ value }] = await db
    .select({ value: count() })
    .from(projectsTable)
    .where(
      and(
        inArray(projectsTable.createdById, orgMemberIds),
        ne(projectsTable.status, 'archived')
      )
    );

  if (value >= effectiveMax) {
    return res.status(403).json({
      error: 'project_limit_reached',
      message: `Your organisation's ${limits.label} plan allows up to ${effectiveMax} active project${effectiveMax === 1 ? '' : 's'}. Archive a project or upgrade to create more.`,
      plan: owner.plan,
      limit: effectiveMax,
      current: value,
    });
  }

  next();
}

export async function checkInspectionQuota(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) return next();

  const user = await getUser(userId);
  if (!user) return next();

  // Note: mobileOnly team members are permitted to create inspections via the mobile app.
  // The mobileOnly flag restricts web-portal access (handled by AppLayout redirect), not
  // inspection-creation itself. Quota is still enforced via the billing owner's org pool below.

  const owner = await resolveBillingOwner(user);
  if (!owner) return next();

  const limits = getLimits(owner.plan ?? 'free_trial');
  const overrideMax = owner.planOverrideInspections ? Number(owner.planOverrideInspections) : null;

  // Get all org member IDs for shared-pool counting
  const orgMemberIds = await getOrgMemberIds(owner.id);

  if (limits.maxInspectionsTotal !== null) {
    const effectiveMax = overrideMax ?? limits.maxInspectionsTotal;

    // Count inspections across all org member projects
    const [{ value }] = await db
      .select({ value: count() })
      .from(inspectionsTable)
      .where(
        sql`(SELECT created_by_id FROM projects WHERE id = ${inspectionsTable.projectId}) = ANY(ARRAY[${sql.join(orgMemberIds.map(id => sql`${id}`), sql`, `)}]::int[])`
      );

    if (value >= effectiveMax) {
      return res.status(403).json({
        error: 'inspection_limit_reached',
        message: `Your organisation's ${limits.label} plan includes up to ${effectiveMax} total inspections. Upgrade to continue.`,
        plan: owner.plan,
        limit: effectiveMax,
        current: value,
      });
    }
  } else if (limits.maxInspectionsMonthly !== null) {
    const effectiveMax = overrideMax ?? limits.maxInspectionsMonthly;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count this-month inspections across all org member projects
    const [{ value }] = await db
      .select({ value: count() })
      .from(inspectionsTable)
      .where(
        and(
          sql`(SELECT created_by_id FROM projects WHERE id = ${inspectionsTable.projectId}) = ANY(ARRAY[${sql.join(orgMemberIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
          gte(inspectionsTable.createdAt, startOfMonth)
        )
      );

    if (value >= effectiveMax) {
      return res.status(403).json({
        error: 'inspection_limit_reached',
        message: `Your organisation's ${limits.label} plan allows ${effectiveMax} inspections per month. Upgrade or wait until next month.`,
        plan: owner.plan,
        limit: effectiveMax,
        current: value,
      });
    }
  }

  next();
}
