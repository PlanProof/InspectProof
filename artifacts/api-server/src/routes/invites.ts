import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { sendAppInviteEmail } from "../lib/email";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.post("/app-invite", requireAuth, async (req, res) => {
  const { email, name } = req.body as { email?: string; name?: string };

  if (!email) {
    res.status(400).json({ error: "bad_request", message: "email is required" });
    return;
  }

  try {
    const inviterRows = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    const inviter = inviterRows[0];
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`.trim()
      : "Your team";

    await sendAppInviteEmail(
      { toEmail: email, inviteeName: name?.trim() || null, inviterName },
      req.log
    );

    req.log.info({ email, invitedBy: req.authUser!.id }, "App invite email sent");
    res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    req.log.error({ err }, "Send app invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to send invite" });
  }
});

export default router;
