import { Request, Response, NextFunction } from 'express';
import { db, projectsTable, inspectionsTable, usersTable } from '@workspace/db';
import { eq, sql, count, and, gte, inArray } from 'drizzle-orm';
import { getLimits } from './planLimits';

async function getUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user ?? null;
}

/**
 * Resolve the billing owner for quota purposes.
 * Team members share the org admin's plan and usage bucket.
 * Returns the admin user if adminUserId is set, otherwise the user itself.
 */
async function resolveBillingOwner(user: Awaited<ReturnType<typeof getUser>>) {
  if (!user) return null;
  if (user.isCompanyAdmin || user.isAdmin) return user;
  if (user.adminUserId) {
    const adminId = parseInt(user.adminUserId);
    if (!isNaN(adminId)) {
      const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
      if (admin) return admin;
    }
  }
  // Standalone user with no org linkage — they are their own billing owner
  return user;
}

/**
 * Get all user IDs in the org: the billing-owner admin plus all team members
 * whose adminUserId = admin.id. Used for shared-pool quota counting.
 */
export async function getOrgMemberIds(adminId: number): Promise<number[]> {
  const members = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.adminUserId, String(adminId)));
  return [adminId, ...members.map(m => m.id)];
}

/**
 * Project creation quota guard.
 * MUST be preceded by requireAuth in the middleware chain — uses req.authUser.
 */
export async function checkProjectQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
  }

  const user = await getUser(req.authUser.id);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'User not found.' });
  }

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

  // Count ALL projects across the entire org (billing owner + all team members).
  // Archived projects are NOT excluded — archiving does not free a quota slot.
  // Once a project is created it permanently counts against the org's limit.
  const orgMemberIds = await getOrgMemberIds(owner.id);

  const [{ value }] = await db
    .select({ value: count() })
    .from(projectsTable)
    .where(inArray(projectsTable.createdById, orgMemberIds));

  if (value >= effectiveMax) {
    return res.status(403).json({
      error: 'project_limit_reached',
      message: `Your organisation's ${limits.label} plan allows up to ${effectiveMax} project${effectiveMax === 1 ? '' : 's'}. Upgrade your plan to create more.`,
      plan: owner.plan,
      limit: effectiveMax,
      current: value,
    });
  }

  next();
}

/**
 * Inspection creation quota guard.
 * MUST be preceded by requireAuth in the middleware chain — uses req.authUser.
 */
export async function checkInspectionQuota(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
  }

  const user = await getUser(req.authUser.id);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'User not found.' });
  }

  // Note: mobileOnly team members ARE permitted to create inspections via the mobile app.
  // Quota is still enforced via the billing owner's org-wide pool below.

  const owner = await resolveBillingOwner(user);
  if (!owner) return next();

  const limits = getLimits(owner.plan ?? 'free_trial');
  const overrideMax = owner.planOverrideInspections ? Number(owner.planOverrideInspections) : null;

  // Get all org member IDs for shared-pool counting
  const orgMemberIds = await getOrgMemberIds(owner.id);

  if (limits.maxInspectionsTotal !== null) {
    const effectiveMax = overrideMax ?? limits.maxInspectionsTotal;

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
