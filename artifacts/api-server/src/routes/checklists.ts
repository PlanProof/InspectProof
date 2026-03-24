import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, checklistTemplatesTable, checklistItemsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const templates = await db.select().from(checklistTemplatesTable)
      .orderBy(checklistTemplatesTable.name);

    const result = await Promise.all(templates.map(async (t) => {
      const [countRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(checklistItemsTable).where(eq(checklistItemsTable.templateId, t.id));
      return {
        id: t.id,
        name: t.name,
        inspectionType: t.inspectionType,
        description: t.description,
        folder: t.folder,
        itemCount: countRow.count,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
      };
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List templates error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, inspectionType, description, folder, items } = req.body;
    const [template] = await db.insert(checklistTemplatesTable).values({
      name, inspectionType, description, folder: folder ?? "Dwelling",
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

    res.status(201).json({
      id: template.id,
      name: template.name,
      inspectionType: template.inspectionType,
      description: template.description,
      itemCount: items?.length || 0,
      createdAt: template.createdAt instanceof Date ? template.createdAt.toISOString() : template.createdAt,
    });
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
      id: template.id,
      name: template.name,
      inspectionType: template.inspectionType,
      description: template.description,
      folder: template.folder,
      itemCount: items.length,
      createdAt: template.createdAt instanceof Date ? template.createdAt.toISOString() : template.createdAt,
      items: items.map(i => ({
        id: i.id,
        templateId: i.templateId,
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

export default router;
