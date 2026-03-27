import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  inspectionType: text("inspection_type").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  completedDate: date("completed_date"),
  inspectorId: integer("inspector_id"),
  duration: integer("duration"),
  notes: text("notes"),
  weatherConditions: text("weather_conditions"),
  checklistTemplateId: integer("checklist_template_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;
