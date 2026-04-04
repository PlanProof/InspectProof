import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orgContractorsTable = pgTable("org_contractors", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  name: text("name").notNull(),
  trade: text("trade").notNull().default(""),
  email: text("email"),
  company: text("company"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrgContractorSchema = createInsertSchema(orgContractorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrgContractor = z.infer<typeof insertOrgContractorSchema>;
export type OrgContractor = typeof orgContractorsTable.$inferSelect;
