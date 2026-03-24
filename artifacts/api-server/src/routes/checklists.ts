import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, checklistTemplatesTable, checklistItemsTable } from "@workspace/db";

const router: IRouter = Router();

function formatTemplate(t: any, itemCount = 0) {
  return {
    id: t.id,
    name: t.name,
    inspectionType: t.inspectionType,
    description: t.description,
    folder: t.folder,
    discipline: t.discipline ?? "Building Surveyor",
    sortOrder: t.sortOrder ?? 0,
    itemCount,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  };
}

function formatItem(i: any) {
  return {
    id: i.id,
    templateId: i.templateId,
    orderIndex: i.orderIndex,
    category: i.category,
    description: i.description,
    reason: i.reason ?? null,
    codeReference: i.codeReference ?? null,
    riskLevel: i.riskLevel,
    isRequired: i.isRequired,
  };
}

// ── Templates list & create ──────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { discipline } = req.query;
    const templates = discipline
      ? await db.select().from(checklistTemplatesTable)
          .where(eq(checklistTemplatesTable.discipline, discipline as string))
          .orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.sortOrder} ASC`)
      : await db.select().from(checklistTemplatesTable)
          .orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.sortOrder} ASC`);

    const result = await Promise.all(templates.map(async (t) => {
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(checklistItemsTable).where(eq(checklistItemsTable.templateId, t.id));
      return formatTemplate(t, countRow.count);
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List templates error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, inspectionType, description, folder, discipline, sortOrder, items } = req.body;
    const [template] = await db.insert(checklistTemplatesTable).values({
      name, inspectionType, description,
      folder: folder ?? "Class 1a",
      discipline: discipline ?? "Building Surveyor",
      sortOrder: sortOrder ?? 0,
    }).returning();

    if (items?.length > 0) {
      await db.insert(checklistItemsTable).values(
        items.map((item: any, idx: number) => ({
          templateId: template.id,
          orderIndex: item.orderIndex ?? idx,
          category: item.category,
          description: item.description,
          reason: item.reason ?? null,
          codeReference: item.codeReference ?? null,
          riskLevel: item.riskLevel ?? "medium",
          isRequired: item.isRequired ?? true,
        }))
      );
    }

    res.status(201).json(formatTemplate(template, items?.length || 0));
  } catch (err) {
    req.log.error({ err }, "Create template error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Item-level routes (before /:id to avoid routing conflicts) ───────────────

router.post("/items/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(items.map(({ id, orderIndex }) =>
      db.update(checklistItemsTable)
        .set({ orderIndex })
        .where(eq(checklistItemsTable.id, id))
    ));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder items error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/items/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    const { description, reason, codeReference, riskLevel, isRequired, category, orderIndex } = req.body;
    const updates: any = {};
    if (description !== undefined) updates.description = description;
    if (reason !== undefined) updates.reason = reason;
    if (codeReference !== undefined) updates.codeReference = codeReference;
    if (riskLevel !== undefined) updates.riskLevel = riskLevel;
    if (isRequired !== undefined) updates.isRequired = isRequired;
    if (category !== undefined) updates.category = category;
    if (orderIndex !== undefined) updates.orderIndex = orderIndex;

    const [item] = await db.update(checklistItemsTable)
      .set(updates)
      .where(eq(checklistItemsTable.id, itemId))
      .returning();

    if (!item) { res.status(404).json({ error: "not_found" }); return; }
    res.json(formatItem(item));
  } catch (err) {
    req.log.error({ err }, "Update item error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/items/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId);
    await db.delete(checklistItemsTable).where(eq(checklistItemsTable.id, itemId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete item error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Template by ID ────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const templates = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, id));
    const template = templates[0];
    if (!template) { res.status(404).json({ error: "not_found" }); return; }

    const items = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.templateId, id))
      .orderBy(checklistItemsTable.orderIndex);

    res.json({
      ...formatTemplate(template, items.length),
      items: items.map(formatItem),
    });
  } catch (err) {
    req.log.error({ err }, "Get template error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, sortOrder, folder, discipline, description, inspectionType } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (folder !== undefined) updates.folder = folder;
    if (discipline !== undefined) updates.discipline = discipline;
    if (description !== undefined) updates.description = description;
    if (inspectionType !== undefined) updates.inspectionType = inspectionType;

    const [template] = await db.update(checklistTemplatesTable)
      .set(updates)
      .where(eq(checklistTemplatesTable.id, id))
      .returning();

    if (!template) { res.status(404).json({ error: "not_found" }); return; }
    res.json(formatTemplate(template));
  } catch (err) {
    req.log.error({ err }, "Update template error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Add item to template
router.post("/:id/items", async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { description, reason, codeReference, riskLevel, isRequired, category } = req.body;

    const existing = await db.select({ maxOrder: sql<number>`coalesce(max(order_index), -1)::int` })
      .from(checklistItemsTable).where(eq(checklistItemsTable.templateId, templateId));
    const nextOrder = (existing[0]?.maxOrder ?? -1) + 1;

    const [item] = await db.insert(checklistItemsTable).values({
      templateId,
      orderIndex: nextOrder,
      category: category || "General",
      description: description || "New checklist item",
      reason: reason ?? null,
      codeReference: codeReference ?? null,
      riskLevel: riskLevel ?? "medium",
      isRequired: isRequired ?? true,
    }).returning();

    res.status(201).json(formatItem(item));
  } catch (err) {
    req.log.error({ err }, "Add item error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Copy template with all items
router.post("/:id/copy", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const templates = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, id));
    const source = templates[0];
    if (!source) { res.status(404).json({ error: "not_found" }); return; }

    const items = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.templateId, id))
      .orderBy(checklistItemsTable.orderIndex);

    const [copy] = await db.insert(checklistTemplatesTable).values({
      name: `${source.name} (Copy)`,
      inspectionType: source.inspectionType,
      description: source.description,
      folder: source.folder,
      discipline: source.discipline,
      sortOrder: (source.sortOrder ?? 0) + 1,
    }).returning();

    if (items.length > 0) {
      await db.insert(checklistItemsTable).values(
        items.map(i => ({
          templateId: copy.id,
          orderIndex: i.orderIndex,
          category: i.category,
          description: i.description,
          reason: i.reason,
          codeReference: i.codeReference,
          riskLevel: i.riskLevel,
          isRequired: i.isRequired,
        }))
      );
    }

    res.status(201).json(formatTemplate(copy, items.length));
  } catch (err) {
    req.log.error({ err }, "Copy template error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Reorder templates within folder
router.post("/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; sortOrder: number }[] };
    await Promise.all(items.map(({ id, sortOrder }) =>
      db.update(checklistTemplatesTable)
        .set({ sortOrder })
        .where(eq(checklistTemplatesTable.id, id))
    ));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reorder templates error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(checklistItemsTable).where(eq(checklistItemsTable.templateId, id));
    await db.delete(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete template error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
