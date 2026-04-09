import { Router, type IRouter } from "express";
import { eq, desc, or, isNull } from "drizzle-orm";
import { db, docTemplatesTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthUser } from "../middleware/auth";

const router: IRouter = Router();

function effectiveAdminId(user: AuthUser): number {
  if (user.isAdmin || user.isCompanyAdmin) return user.id;
  return user.adminUserId ? parseInt(user.adminUserId) : user.id;
}

function fmt(t: any) {
  return {
    id: t.id,
    userId: t.userId,
    name: t.name,
    content: t.content ?? "",
    linkedChecklistIds: (() => {
      try { return JSON.parse(t.linkedChecklistIds ?? "[]"); } catch { return []; }
    })(),
    backgroundImage: t.backgroundImage ?? null,
    isGlobal: t.userId == null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

function canEdit(template: { userId: number | null }, user: AuthUser): boolean {
  if (user.isAdmin) return true;
  if (template.userId == null) return false;
  return template.userId === effectiveAdminId(user);
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const adminId = effectiveAdminId(req.authUser!);
    const rows = await db.select().from(docTemplatesTable)
      .where(or(
        isNull(docTemplatesTable.userId),
        eq(docTemplatesTable.userId, adminId)
      ))
      .orderBy(desc(docTemplatesTable.updatedAt));
    res.json(rows.map(fmt));
  } catch (err: any) {
    req.log?.error({ err }, "List doc templates error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const adminId = effectiveAdminId(req.authUser!);
    const [row] = await db.select().from(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    if (!row) { res.status(404).json({ error: "not_found" }); return; }
    if (row.userId != null && row.userId !== adminId && !req.authUser!.isAdmin) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const adminId = effectiveAdminId(req.authUser!);
    const { name, content, linkedChecklistIds, backgroundImage } = req.body;
    const [row] = await db.insert(docTemplatesTable).values({
      name: name ?? "Untitled Template",
      content: content ?? "",
      linkedChecklistIds: JSON.stringify(linkedChecklistIds ?? []),
      backgroundImage: backgroundImage ?? null,
      userId: adminId,
    }).returning();
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const [existing] = await db.select().from(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (!canEdit(existing, req.authUser!)) { res.status(403).json({ error: "forbidden", message: "Platform templates cannot be modified." }); return; }

    const { name, content, linkedChecklistIds, backgroundImage } = req.body;
    const update: any = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (content !== undefined) update.content = content;
    if (linkedChecklistIds !== undefined) update.linkedChecklistIds = JSON.stringify(linkedChecklistIds);
    if (backgroundImage !== undefined) update.backgroundImage = backgroundImage;
    const [row] = await db.update(docTemplatesTable).set(update).where(eq(docTemplatesTable.id, parseInt(req.params.id))).returning();
    if (!row) { res.status(404).json({ error: "not_found" }); return; }
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const [existing] = await db.select().from(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (!canEdit(existing, req.authUser!)) { res.status(403).json({ error: "forbidden", message: "Platform templates cannot be deleted." }); return; }
    await db.delete(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
