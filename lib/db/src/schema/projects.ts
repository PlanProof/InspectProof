import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  siteAddress: text("site_address").notNull(),
  suburb: text("suburb").notNull(),
  state: text("state").notNull(),
  postcode: text("postcode").notNull(),
  clientName: text("client_name").notNull(),
  builderName: text("builder_name"),
  designerName: text("designer_name"),
  daNumber: text("da_number"),
  certificationNumber: text("certification_number"),
  buildingClassification: text("building_classification").notNull(),
  projectType: text("project_type").notNull().default("residential"),
  status: text("status").notNull().default("active"),
  stage: text("stage").notNull().default("pre_construction"),
  assignedCertifierId: integer("assigned_certifier_id"),
  assignedInspectorId: integer("assigned_inspector_id"),
  createdById: integer("created_by_id"),
  startDate: date("start_date"),
  expectedCompletionDate: date("expected_completion_date"),
  completedDate: date("completed_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
