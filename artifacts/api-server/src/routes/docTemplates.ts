import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, docTemplatesTable } from "@workspace/db";

const router: IRouter = Router();

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
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(docTemplatesTable).orderBy(desc(docTemplatesTable.updatedAt));
    res.json(rows.map(fmt));
  } catch (err: any) {
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [row] = await db.select().from(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, content, linkedChecklistIds, backgroundImage, userId } = req.body;
    const [row] = await db.insert(docTemplatesTable).values({
      name: name ?? "Untitled Template",
      content: content ?? "",
      linkedChecklistIds: JSON.stringify(linkedChecklistIds ?? []),
      backgroundImage: backgroundImage ?? null,
      userId: userId ?? null,
    }).returning();
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, content, linkedChecklistIds, backgroundImage } = req.body;
    const update: any = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (content !== undefined) update.content = content;
    if (linkedChecklistIds !== undefined) update.linkedChecklistIds = JSON.stringify(linkedChecklistIds);
    if (backgroundImage !== undefined) update.backgroundImage = backgroundImage;
    const [row] = await db.update(docTemplatesTable).set(update).where(eq(docTemplatesTable.id, parseInt(req.params.id))).returning();
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(fmt(row));
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(docTemplatesTable).where(eq(docTemplatesTable.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
