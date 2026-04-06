import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectContractorsTable = pgTable("project_contractors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trade: text("trade").notNull().default(""),
  email: text("email"),
  company: text("company"),
  contactRole: text("contact_role"),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectContractorSchema = createInsertSchema(projectContractorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectContractor = z.infer<typeof insertProjectContractorSchema>;
export type ProjectContractor = typeof projectContractorsTable.$inferSelect;
