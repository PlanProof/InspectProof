import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const internalStaffTable = pgTable("internal_staff", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  email: text("email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInternalStaffSchema = createInsertSchema(internalStaffTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInternalStaff = z.infer<typeof insertInternalStaffSchema>;
export type InternalStaff = typeof internalStaffTable.$inferSelect;
