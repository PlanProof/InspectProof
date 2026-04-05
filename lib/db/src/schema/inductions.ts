import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { orgContractorsTable } from "./orgContractors";
import { internalStaffTable } from "./internalStaff";

export const inductionsTable = pgTable("inductions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Site Induction"),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  location: text("location"),
  conductedById: integer("conducted_by_id"),
  conductedByName: text("conducted_by_name"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  checklistData: jsonb("checklist_data"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inductionAttendeesTable = pgTable("induction_attendees", {
  id: serial("id").primaryKey(),
  inductionId: integer("induction_id").notNull().references(() => inductionsTable.id, { onDelete: "cascade" }),
  orgContractorId: integer("org_contractor_id").references(() => orgContractorsTable.id, { onDelete: "set null" }),
  internalStaffId: integer("internal_staff_id").references(() => internalStaffTable.id, { onDelete: "set null" }),
  attendeeType: text("attendee_type").notNull().default("contractor"),
  contractorName: text("contractor_name").notNull(),
  contractorEmail: text("contractor_email"),
  contractorTrade: text("contractor_trade"),
  attended: boolean("attended").notNull().default(false),
  signedOff: boolean("signed_off").notNull().default(false),
  signatureData: text("signature_data"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInductionSchema = createInsertSchema(inductionsTable).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export type InsertInduction = z.infer<typeof insertInductionSchema>;
export type Induction = typeof inductionsTable.$inferSelect;

export const insertInductionAttendeeSchema = createInsertSchema(inductionAttendeesTable).omit({ id: true, createdAt: true });
export type InsertInductionAttendee = z.infer<typeof insertInductionAttendeeSchema>;
export type InductionAttendee = typeof inductionAttendeesTable.$inferSelect;
