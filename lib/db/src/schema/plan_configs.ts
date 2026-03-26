import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const planConfigsTable = pgTable("plan_configs", {
  id:                     serial("id").primaryKey(),
  planKey:                text("plan_key").notNull().unique(),
  label:                  text("label").notNull(),
  description:            text("description"),
  features:               text("features").notNull().default("[]"),
  maxProjects:            text("max_projects"),
  maxInspectionsMonthly:  text("max_inspections_monthly"),
  maxInspectionsTotal:    text("max_inspections_total"),
  maxTeamMembers:         text("max_team_members"),
  isPopular:              boolean("is_popular").notNull().default(false),
  isBestValue:            boolean("is_best_value").notNull().default(false),
  sortOrder:              text("sort_order").notNull().default("0"),
  updatedAt:              timestamp("updated_at").notNull().defaultNow(),
});

export type PlanConfig = typeof planConfigsTable.$inferSelect;
