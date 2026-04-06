import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { inspectionsTable } from "./inspections";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  inspectionId: integer("inspection_id").references(() => inspectionsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  reportType: text("report_type").notNull().default("inspection_certificate"),
  status: text("status").notNull().default("draft"),
  content: text("content"),
  sentTo: text("sent_to"),
  sentAt: timestamp("sent_at"),
  submittedAt: timestamp("submitted_at"),
  generatedById: integer("generated_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reportOptions: jsonb("report_options"),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true, createdAt: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
