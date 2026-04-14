import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_LIST_ID = process.env.BREVO_WAITLIST_LIST_ID
  ? parseInt(process.env.BREVO_WAITLIST_LIST_ID, 10)
  : null;

router.post("/waitlist", async (req, res) => {
  const { email, name, profession } = req.body ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  if (!BREVO_API_KEY) {
    logger.warn("BREVO_API_KEY not set — waitlist signup skipped");
    return res.status(200).json({ ok: true, message: "You're on the waitlist!" });
  }

  try {
    const contact: Record<string, unknown> = {
      email: email.trim().toLowerCase(),
      attributes: {
        FIRSTNAME: name ? String(name).split(" ")[0] : undefined,
        LASTNAME: name ? String(name).split(" ").slice(1).join(" ") || undefined : undefined,
        PROFESSION: profession ? String(profession) : undefined,
        WAITLIST_SOURCE: "landing_page",
      },
      updateEnabled: true,
    };

    if (BREVO_LIST_ID) {
      contact.listIds = [BREVO_LIST_ID];
    }

    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify(contact),
    });

    if (!brevoRes.ok) {
      const body = await brevoRes.json().catch(() => ({}));
      const msg = (body as any)?.message ?? "";
      if (brevoRes.status === 400 && msg.toLowerCase().includes("already")) {
        return res.status(200).json({ ok: true, message: "You're already on the waitlist!" });
      }
      logger.error({ status: brevoRes.status, body }, "Brevo contact creation failed");
      return res.status(502).json({ error: "Could not add you to the waitlist. Please try again." });
    }

    logger.info({ email }, "Waitlist signup added to Brevo");
    return res.status(200).json({ ok: true, message: "You're on the waitlist!" });
  } catch (err) {
    logger.error({ err }, "Waitlist signup error");
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

export default router;
