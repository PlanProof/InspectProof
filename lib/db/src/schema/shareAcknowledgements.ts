import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shareAcknowledgementsTable = pgTable("share_acknowledgements", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull(),
  shareToken: text("share_token").notNull(),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  signatureText: text("signature_text"),
  acknowledgedAt: timestamp("acknowledged_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractorShareTokensTable = pgTable("contractor_share_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  projectId: integer("project_id").notNull(),
  inspectionId: integer("inspection_id"),
  contractorName: text("contractor_name").notNull(),
  contractorEmail: text("contractor_email"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShareAcknowledgementSchema = createInsertSchema(shareAcknowledgementsTable).omit({ id: true, createdAt: true });
export type InsertShareAcknowledgement = z.infer<typeof insertShareAcknowledgementSchema>;
export type ShareAcknowledgement = typeof shareAcknowledgementsTable.$inferSelect;

export const insertContractorShareTokenSchema = createInsertSchema(contractorShareTokensTable).omit({ id: true, createdAt: true });
export type InsertContractorShareToken = z.infer<typeof insertContractorShareTokenSchema>;
export type ContractorShareToken = typeof contractorShareTokensTable.$inferSelect;
