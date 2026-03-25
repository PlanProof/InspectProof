import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checklistTemplatesTable = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inspectionType: text("inspection_type").notNull(),
  description: text("description"),
  folder: text("folder").notNull().default("Class 1a"),
  discipline: text("discipline").notNull().default("Building Surveyor"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checklistItemsTable = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  orderIndex: integer("order_index").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  reason: text("reason"),
  codeReference: text("code_reference"),
  riskLevel: text("risk_level").notNull().default("medium"),
  isRequired: boolean("is_required").notNull().default(true),
});

export const checklistResultsTable = pgTable("checklist_results", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull(),
  checklistItemId: integer("checklist_item_id").notNull(),
  result: text("result").notNull().default("pending"),
  notes: text("notes"),
  photoUrls: text("photo_urls"),
  photoMarkups: text("photo_markups"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertChecklistTemplateSchema = createInsertSchema(checklistTemplatesTable).omit({ id: true, createdAt: true });
export type InsertChecklistTemplate = z.infer<typeof insertChecklistTemplateSchema>;
export type ChecklistTemplate = typeof checklistTemplatesTable.$inferSelect;

export const insertChecklistItemSchema = createInsertSchema(checklistItemsTable).omit({ id: true });
export type InsertChecklistItem = z.infer<typeof insertChecklistItemSchema>;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;

export const insertChecklistResultSchema = createInsertSchema(checklistResultsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChecklistResult = z.infer<typeof insertChecklistResultSchema>;
export type ChecklistResult = typeof checklistResultsTable.$inferSelect;
