import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const issuesTable = pgTable("issues", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  inspectionId: integer("inspection_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  location: text("location"),
  codeReference: text("code_reference"),
  responsibleParty: text("responsible_party"),
  dueDate: date("due_date"),
  resolvedDate: date("resolved_date"),
  assignedToId: integer("assigned_to_id"),
  closeoutNotes: text("closeout_notes"),
  closeoutPhotos: text("closeout_photos"),
  markupDocumentId: integer("markup_document_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertIssueSchema = createInsertSchema(issuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type Issue = typeof issuesTable.$inferSelect;
