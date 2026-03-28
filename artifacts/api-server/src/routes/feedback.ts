import { Router, type IRouter } from "express";
import { db, feedbacksTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { optionalAuth } from "../middleware/auth";
import { sendFeedbackEmail } from "../lib/email";

const router: IRouter = Router();

router.post("/", optionalAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "bad_request", message: "Feedback message is required." });
      return;
    }

    const authUser = req.authUser;
    let senderName: string | null = null;
    let senderEmail: string | null = null;

    if (authUser) {
      senderEmail = authUser.email;
      const rows = await db.select().from(usersTable).where(eq(usersTable.id, authUser.id));
      if (rows[0]) {
        const u = rows[0];
        senderName = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
      }
    }

    const [feedback] = await db.insert(feedbacksTable).values({
      userId: authUser?.id ?? null,
      senderName,
      senderEmail,
      message: message.trim(),
      status: "pending",
    }).returning();

    req.log.info({ feedbackId: feedback.id, userId: authUser?.id }, "Feedback submitted");

    sendFeedbackEmail(
      { senderName, senderEmail, message: message.trim() },
      req.log
    ).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Thank you for your feedback! We'll review it shortly.",
      id: feedback.id,
    });
  } catch (err) {
    req.log.error({ err }, "Submit feedback error");
    res.status(500).json({ error: "internal_error", message: "Failed to submit feedback." });
  }
});

export default router;
