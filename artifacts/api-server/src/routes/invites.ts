import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

function getSupabaseConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

router.post("/app-invite", async (req, res) => {
  const { email, userId } = req.body as { email?: string; userId?: number };

  if (!email) {
    res.status(400).json({ error: "bad_request", message: "email is required" });
    return;
  }

  const supabase = getSupabaseConfig();
  if (!supabase) {
    res.status(503).json({ error: "not_configured", message: "Supabase is not configured on this server" });
    return;
  }

  try {
    const inviteRes = await fetch(`${supabase.url}/auth/v1/admin/invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabase.serviceRoleKey}`,
        apikey: supabase.serviceRoleKey,
      },
      body: JSON.stringify({
        email,
        data: { invited_as: "inspector" },
      }),
    });

    const inviteBody = await inviteRes.json() as any;

    if (!inviteRes.ok) {
      req.log.warn({ status: inviteRes.status, body: inviteBody }, "Supabase invite failed");
      const msg = inviteBody?.msg || inviteBody?.message || "Invite failed";
      res.status(inviteRes.status).json({ error: "invite_failed", message: msg });
      return;
    }

    if (userId) {
      try {
        await db.update(usersTable)
          .set({ updatedAt: new Date() } as any)
          .where(eq(usersTable.id, userId));
      } catch (_) {}
    }

    req.log.info({ email }, "App invite sent via Supabase");
    res.json({ success: true, message: `Invite sent to ${email}` });
  } catch (err) {
    req.log.error({ err }, "Send app invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to send invite" });
  }
});

export default router;
