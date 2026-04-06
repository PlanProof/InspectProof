import { pgTable, serial, text, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "cascade" }),
  inspectionType: text("inspection_type").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledEndDate: date("scheduled_end_date"),
  scheduledTime: text("scheduled_time"),
  completedDate: date("completed_date"),
  inspectorId: integer("inspector_id").references(() => usersTable.id, { onDelete: "set null" }),
  duration: integer("duration"),
  notes: text("notes"),
  weatherConditions: text("weather_conditions"),
  checklistTemplateId: integer("checklist_template_id"),
  shareToken: text("share_token"),
  shareTokenExpiry: timestamp("share_token_expiry"),
  signedOffAt: timestamp("signed_off_at"),
  signedOffById: integer("signed_off_by_id"),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;

export const inspectionRemindersTable = pgTable(
  "inspection_reminders",
  {
    id: serial("id").primaryKey(),
    inspectionId: integer("inspection_id")
      .notNull()
      .references(() => inspectionsTable.id, { onDelete: "cascade" }),
    reminderType: text("reminder_type").notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    inspectorId: integer("inspector_id").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("inspection_reminders_inspection_type_uidx").on(t.inspectionId, t.reminderType)],
);

export type InspectionReminder = typeof inspectionRemindersTable.$inferSelect;
