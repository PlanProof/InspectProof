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

router.get("/", async (req, res) => {
  try {
    const { discipline } = req.query;
    let query = db.select().from(checklistTemplatesTable);
    const templates = discipline
      ? await query.where(eq(checklistTemplatesTable.discipline, discipline as string))
          .orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.sortOrder} ASC`)
      : await query.orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.sortOrder} ASC`);

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
          codeReference: item.codeReference,
          riskLevel: item.riskLevel,
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

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const templates = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, id));
    const template = templates[0];
    if (!template) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const items = await db.select().from(checklistItemsTable)
      .where(eq(checklistItemsTable.templateId, id))
      .orderBy(checklistItemsTable.orderIndex);

    res.json({
      ...formatTemplate(template, items.length),
      items: items.map(i => ({
        id: i.id,
        orderIndex: i.orderIndex,
        category: i.category,
        description: i.description,
        codeReference: i.codeReference,
        riskLevel: i.riskLevel,
        isRequired: i.isRequired,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Get template error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, sortOrder, folder, discipline, description } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (folder !== undefined) updates.folder = folder;
    if (discipline !== undefined) updates.discipline = discipline;
    if (description !== undefined) updates.description = description;

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

// Copy a template (duplicate it with all its items)
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

// Reorder templates within a folder — accepts [{id, sortOrder}] array
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
