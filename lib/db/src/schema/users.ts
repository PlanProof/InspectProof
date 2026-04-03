import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("inspector"),
  phone: text("phone"),
  avatar: text("avatar"),
  signatureUrl: text("signature_url"),
  profession: text("profession"),
  licenceNumber: text("licence_number"),
  companyName: text("company_name"),
  isActive: boolean("is_active").notNull().default(true),
  isAdmin: boolean("is_admin").notNull().default(false),
  plan: text("plan").notNull().default("free_trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planOverrideProjects: text("plan_override_projects"),
  planOverrideInspections: text("plan_override_inspections"),
  expoPushToken: text("expo_push_token"),
  notifyOnAssignment: boolean("notify_on_assignment").notNull().default(true),
  isCompanyAdmin: boolean("is_company_admin").notNull().default(false),
  userType: text("user_type").notNull().default("inspector"),
  permissions: text("permissions"),
  mobileOnly: boolean("mobile_only").notNull().default(false),
  adminUserId: text("admin_user_id"),
  requiresPasswordChange: boolean("requires_password_change").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invitationsTable = pgTable("invitations", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  companyName: text("company_name"),
  invitedById: text("invited_by_id").notNull(),
  role: text("role").notNull().default("inspector"),
  permissions: text("permissions"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
