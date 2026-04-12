import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const newsletterCampaignsTable = pgTable("newsletter_campaigns", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  previewText: text("preview_text"),
  sentById: integer("sent_by_id"),
  sentByEmail: text("sent_by_email"),
  recipientCount: integer("recipient_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type NewsletterCampaign = typeof newsletterCampaignsTable.$inferSelect;
export type InsertNewsletterCampaign = typeof newsletterCampaignsTable.$inferInsert;
