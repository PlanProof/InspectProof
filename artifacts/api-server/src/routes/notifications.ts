import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const notifications = await db.select().from(notificationsTable)
      .orderBy(sql`${notificationsTable.createdAt} DESC`)
      .limit(20);

    res.json(notifications.map(n => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      type: n.type,
      isRead: n.isRead === "true",
      entityType: n.entityType,
      entityId: n.entityId,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List notifications error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id/read", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(notificationsTable)
      .set({ isRead: "true" })
      .where(eq(notificationsTable.id, id));
    res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    req.log.error({ err }, "Mark notification read error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
