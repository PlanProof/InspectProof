import { pgTable, serial, text, timestamp, date, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const orgContractorsTable = pgTable("org_contractors", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  name: text("name").notNull(),
  trade: text("trade").notNull().default(""),
  email: text("email"),
  company: text("company"),
  licenceNumber: text("licence_number"),
  registrationNumber: text("registration_number"),
  licenceExpiry: date("licence_expiry"),
  registrationExpiry: date("registration_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orgContractorProjectAssignmentsTable = pgTable(
  "org_contractor_project_assignments",
  {
    id: serial("id").primaryKey(),
    orgContractorId: integer("org_contractor_id").notNull().references(() => orgContractorsTable.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("oca_unique_assignment").on(t.orgContractorId, t.projectId)]
);

export const insertOrgContractorSchema = createInsertSchema(orgContractorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrgContractor = z.infer<typeof insertOrgContractorSchema>;
export type OrgContractor = typeof orgContractorsTable.$inferSelect;

export const insertOrgContractorProjectAssignmentSchema = createInsertSchema(orgContractorProjectAssignmentsTable).omit({ id: true, createdAt: true });
export type InsertOrgContractorProjectAssignment = z.infer<typeof insertOrgContractorProjectAssignmentSchema>;
export type OrgContractorProjectAssignment = typeof orgContractorProjectAssignmentsTable.$inferSelect;
