import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  version: text("version"),
  tags: text("tags").array().notNull().default([]),
  uploadedById: integer("uploaded_by_id").notNull(),
  folder: text("folder").notNull().default("General"),
  fileUrl: text("file_url"),
  includedInInspection: boolean("included_in_inspection").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;

export const documentChecklistLinksTable = pgTable("document_checklist_links", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  checklistItemId: integer("checklist_item_id").notNull(),
  projectId: integer("project_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [unique("doc_item_unique").on(t.documentId, t.checklistItemId)]);

export const projectInspectionTypesTable = pgTable("project_inspection_types", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  inspectionType: text("inspection_type").notNull(),
  isSelected: boolean("is_selected").notNull().default(false),
  templateId: integer("template_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectInspectionTypeSchema = createInsertSchema(projectInspectionTypesTable).omit({ id: true, createdAt: true });
export type InsertProjectInspectionType = z.infer<typeof insertProjectInspectionTypeSchema>;
export type ProjectInspectionType = typeof projectInspectionTypesTable.$inferSelect;
