import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userCalendarIntegrationsTable = pgTable(
  "user_calendar_integrations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiry: timestamp("token_expiry"),
    calendarId: text("calendar_id").notNull().default("primary"),
    calendarName: text("calendar_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_calendar_integrations_user_provider_uidx").on(t.userId, t.provider)],
);

export type UserCalendarIntegration = typeof userCalendarIntegrationsTable.$inferSelect;
