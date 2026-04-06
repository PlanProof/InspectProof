import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"),
  resendMessageId: text("resend_message_id"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type EmailLog = typeof emailLogsTable.$inferSelect;
export type InsertEmailLog = typeof emailLogsTable.$inferInsert;
