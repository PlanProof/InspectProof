import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { inspectionsTable } from "./inspections";

export const issuesTable = pgTable("issues", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  inspectionId: integer("inspection_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("medium"),
  category: text("category"),
  priority: text("priority"),
  photos: text("photos"),
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

export const issueCommentsTable = pgTable("issue_comments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").notNull(),
  userId: integer("user_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIssueSchema = createInsertSchema(issuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type Issue = typeof issuesTable.$inferSelect;

export const insertIssueCommentSchema = createInsertSchema(issueCommentsTable).omit({ id: true, createdAt: true });
export type InsertIssueComment = z.infer<typeof insertIssueCommentSchema>;
export type IssueComment = typeof issueCommentsTable.$inferSelect;
