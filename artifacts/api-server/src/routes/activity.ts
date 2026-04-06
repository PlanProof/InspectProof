import { Router, type IRouter } from "express";
import { desc, eq, and } from "drizzle-orm";
import { db, activityLogsTable, usersTable } from "@workspace/db";
import { optionalAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/", optionalAuth, async (req, res) => {
  try {
    if (!req.authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const { entityType, entityId, limit: limitQ, offset: offsetQ } = req.query;
    const limit = Math.min(parseInt(limitQ as string) || 100, 500);
    const offset = parseInt(offsetQ as string) || 0;

    const conditions = [];
    if (entityType) {
      conditions.push(eq(activityLogsTable.entityType, entityType as string));
    }
    if (entityId) {
      const eid = parseInt(entityId as string);
      if (!isNaN(eid)) {
        conditions.push(eq(activityLogsTable.entityId, eid));
      }
    }

    const logs = await db.select().from(activityLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
          .from(usersTable)
      : [];

    const userMap: Record<number, { name: string; email: string }> = {};
    for (const u of users) {
      userMap[u.id] = { name: `${u.firstName} ${u.lastName}`, email: u.email };
    }

    const result = logs.map(l => ({
      id: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      action: l.action,
      description: l.description,
      userId: l.userId,
      userName: userMap[l.userId]?.name ?? "System",
      userEmail: userMap[l.userId]?.email ?? null,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List activity logs error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
