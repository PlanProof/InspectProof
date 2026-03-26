import { Request, Response, NextFunction } from 'express';
import { db, projectsTable, inspectionsTable, usersTable } from '@workspace/db';
import { eq, sql, count, and, gte, ne } from 'drizzle-orm';
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

export async function checkProjectQuota(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) return next();

  const user = await getUser(userId);
  if (!user) return next();

  const limits = getLimits(user.plan ?? 'free_trial');
  if (limits.maxProjects === null) return next();

  const overrideMax = user.planOverrideProjects ? Number(user.planOverrideProjects) : null;
  const effectiveMax = overrideMax ?? limits.maxProjects;

  const [{ value }] = await db
    .select({ value: count() })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.createdById, userId),
        ne(projectsTable.status, 'archived')
      )
    );

  if (value >= effectiveMax) {
    return res.status(403).json({
      error: 'project_limit_reached',
      message: `Your ${limits.label} plan allows up to ${effectiveMax} active project${effectiveMax === 1 ? '' : 's'}. Archive a project or upgrade to create more.`,
      plan: user.plan,
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

  const limits = getLimits(user.plan ?? 'free_trial');
  const overrideMax = user.planOverrideInspections ? Number(user.planOverrideInspections) : null;

  if (limits.maxInspectionsTotal !== null) {
    const effectiveMax = overrideMax ?? limits.maxInspectionsTotal;
    const [{ value }] = await db
      .select({ value: count() })
      .from(inspectionsTable)
      .where(
        eq(
          sql`(SELECT created_by_id FROM projects WHERE id = ${inspectionsTable.projectId})`,
          userId
        )
      );

    if (value >= effectiveMax) {
      return res.status(403).json({
        error: 'inspection_limit_reached',
        message: `Your ${limits.label} plan includes up to ${effectiveMax} total inspections. Upgrade to continue.`,
        plan: user.plan,
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
          eq(
            sql`(SELECT created_by_id FROM projects WHERE id = ${inspectionsTable.projectId})`,
            userId
          ),
          gte(inspectionsTable.createdAt, startOfMonth)
        )
      );

    if (value >= effectiveMax) {
      return res.status(403).json({
        error: 'inspection_limit_reached',
        message: `Your ${limits.label} plan allows ${effectiveMax} inspections per month. Upgrade or wait until next month.`,
        plan: user.plan,
        limit: effectiveMax,
        current: value,
      });
    }
  }

  next();
}
