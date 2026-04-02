import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectContractorsTable = pgTable("project_contractors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  trade: text("trade").notNull().default(""),
  email: text("email"),
  company: text("company"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectContractorSchema = createInsertSchema(projectContractorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProjectContractor = z.infer<typeof insertProjectContractorSchema>;
export type ProjectContractor = typeof projectContractorsTable.$inferSelect;
