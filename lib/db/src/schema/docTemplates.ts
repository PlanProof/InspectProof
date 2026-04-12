import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const docTemplatesTable = pgTable("doc_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  content: text("content"),
  linkedChecklistIds: text("linked_checklist_ids").default("[]"),
  backgroundImage: text("background_image"),
  discipline: text("discipline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DocTemplate = typeof docTemplatesTable.$inferSelect;
