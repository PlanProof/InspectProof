import { Router, type IRouter } from "express";
import { db, usersTable, newsletterCampaignsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { sendNewsletterBatch } from "../lib/email";
import crypto from "crypto";

const router: IRouter = Router();

const UNSUBSCRIBE_SECRET = process.env.JWT_SECRET || "inspectproof-unsubscribe-secret";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";

function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.authUser?.isSuperAdmin) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

export function signUnsubscribeToken(userId: number, email: string): string {
  const payload = `${userId}:${email}:${Date.now()}`;
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", UNSUBSCRIBE_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { userId: number; email: string } | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;
    const expected = crypto.createHmac("sha256", UNSUBSCRIBE_SECRET).update(encoded).digest("base64url");
    if (expected !== sig) return null;
    const payload = Buffer.from(encoded, "base64url").toString();
    const [userIdStr, email] = payload.split(":");
    const userId = parseInt(userIdStr, 10);
    if (!userId || !email) return null;
    return { userId, email };
  } catch {
    return null;
  }
}

router.get("/admin/newsletters/stats", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [{ value: subscriberCount }] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(and(
        eq(usersTable.marketingEmailOptIn, true),
        eq(usersTable.isLocked, false),
      ));

    const campaigns = await db
      .select()
      .from(newsletterCampaignsTable)
      .orderBy(newsletterCampaignsTable.createdAt)
      .limit(5);

    res.json({ subscriberCount: Number(subscriberCount), recentCampaigns: campaigns });
  } catch (err) {
    req.log.error({ err }, "Newsletter stats error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/admin/newsletters/campaigns", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const campaigns = await db
      .select()
      .from(newsletterCampaignsTable)
      .orderBy(newsletterCampaignsTable.createdAt);

    res.json({ campaigns });
  } catch (err) {
    req.log.error({ err }, "Newsletter campaigns error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/admin/newsletters/send", requireAuth, requireSuperAdmin, async (req, res) => {
  const { subject, bodyHtml, previewText } = req.body as {
    subject?: string;
    bodyHtml?: string;
    previewText?: string;
  };

  if (!subject?.trim() || !bodyHtml?.trim()) {
    return res.status(400).json({ error: "bad_request", message: "subject and bodyHtml are required" });
  }

  try {
    const [campaign] = await db.insert(newsletterCampaignsTable).values({
      subject: subject.trim(),
      bodyHtml: bodyHtml.trim(),
      previewText: previewText?.trim() ?? null,
      sentById: req.authUser!.id,
      sentByEmail: req.authUser!.email,
      status: "sending",
    }).returning();

    const subscribers = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(usersTable)
      .where(and(
        eq(usersTable.marketingEmailOptIn, true),
        eq(usersTable.isLocked, false),
      ));

    if (subscribers.length === 0) {
      await db.update(newsletterCampaignsTable)
        .set({ status: "sent", recipientCount: 0, successCount: 0, failureCount: 0, sentAt: new Date(), updatedAt: new Date() })
        .where(eq(newsletterCampaignsTable.id, campaign.id));
      return res.json({ success: true, campaignId: campaign.id, recipientCount: 0 });
    }

    const recipientsWithTokens = subscribers.map(s => ({
      ...s,
      unsubscribeUrl: `${APP_BASE_URL}/api/newsletter/unsubscribe?token=${signUnsubscribeToken(s.id, s.email)}`,
    }));

    const { successCount, failureCount } = await sendNewsletterBatch({
      subject: subject.trim(),
      bodyHtml: bodyHtml.trim(),
      previewText: previewText?.trim(),
      recipients: recipientsWithTokens,
    }, req.log);

    await db.update(newsletterCampaignsTable)
      .set({
        status: "sent",
        recipientCount: subscribers.length,
        successCount,
        failureCount,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(newsletterCampaignsTable.id, campaign.id));

    res.json({ success: true, campaignId: campaign.id, recipientCount: subscribers.length, successCount, failureCount });
  } catch (err) {
    req.log.error({ err }, "Newsletter send error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/newsletter/unsubscribe", async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) {
    return res.status(400).send("Invalid unsubscribe link.");
  }

  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return res.status(400).send("This unsubscribe link is invalid or has expired.");
  }

  try {
    await db.update(usersTable)
      .set({
        marketingEmailOptIn: false,
        marketingEmailOptInAt: null,
        marketingEmailSource: null,
        marketingEmailScope: null,
        updatedAt: new Date(),
      })
      .where(and(eq(usersTable.id, parsed.userId), eq(usersTable.email, parsed.email)));

    const APP_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";
    res.redirect(`${APP_URL}?unsubscribed=1`);
  } catch (err) {
    req.log.error({ err }, "Unsubscribe error");
    res.status(500).send("Something went wrong. Please try again or contact support.");
  }
});

export default router;
