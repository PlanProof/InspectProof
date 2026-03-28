import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const feedbacksTable = pgTable("feedbacks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Feedback = typeof feedbacksTable.$inferSelect;
