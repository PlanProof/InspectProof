import { pgTable, serial, text, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  referenceNumber: text("reference_number"),
  orgAdminId: integer("org_admin_id"),
  name: text("name").notNull(),
  siteAddress: text("site_address").notNull(),
  suburb: text("suburb").notNull(),
  state: text("state").notNull(),
  postcode: text("postcode").notNull(),
  clientName: text("client_name").notNull(),
  ownerName: text("owner_name"),
  builderName: text("builder_name"),
  designerName: text("designer_name"),
  daNumber: text("da_number"),
  certificationNumber: text("certification_number"),
  buildingClassification: text("building_classification").notNull(),
  projectType: text("project_type").notNull().default("residential"),
  status: text("status").notNull().default("active"),
  stage: text("stage").notNull().default("pre_construction"),
  notes: text("notes"),
  assignedCertifierId: integer("assigned_certifier_id"),
  assignedInspectorId: integer("assigned_inspector_id"),
  createdById: integer("created_by_id"),
  startDate: date("start_date"),
  expectedCompletionDate: date("expected_completion_date"),
  completedDate: date("completed_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Unique reference number per org: two different orgs can each have PRJ-0001,
  // but within a single org the reference number must be unique (NULLs are excluded).
  refNumPerOrgIdx: uniqueIndex("projects_ref_num_per_org_idx")
    .on(table.referenceNumber, table.orgAdminId)
    .where(sql`${table.referenceNumber} IS NOT NULL AND ${table.orgAdminId} IS NOT NULL`),
}));

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
