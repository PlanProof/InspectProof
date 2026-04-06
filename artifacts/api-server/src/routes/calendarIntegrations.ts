import { Router, type IRouter } from "express";
import { db, userCalendarIntegrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { decodeSessionToken } from "../lib/session-token";
import { google } from "googleapis";
import { Client } from "@microsoft/microsoft-graph-client";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";
const WEB_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = `${APP_BASE_URL}/api/integrations/calendar/google/callback`;
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];

const MS_CLIENT_ID = process.env.MS_CALENDAR_CLIENT_ID || "";
const MS_CLIENT_SECRET = process.env.MS_CALENDAR_CLIENT_SECRET || "";
const MS_TENANT_ID = process.env.MS_CALENDAR_TENANT_ID || "common";
const MS_REDIRECT_URI = `${APP_BASE_URL}/api/integrations/calendar/microsoft/callback`;

const router: IRouter = Router();

function buildGoogleOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

router.get("/integrations/calendar/status", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const integrations = await db.select({
      provider: userCalendarIntegrationsTable.provider,
      calendarId: userCalendarIntegrationsTable.calendarId,
      calendarName: userCalendarIntegrationsTable.calendarName,
      createdAt: userCalendarIntegrationsTable.createdAt,
    })
      .from(userCalendarIntegrationsTable)
      .where(eq(userCalendarIntegrationsTable.userId, userId));

    const googleInt = integrations.find(i => i.provider === "google") ?? null;
    const msInt = integrations.find(i => i.provider === "microsoft") ?? null;

    res.json({
      google: googleInt ? {
        connected: true,
        calendarId: googleInt.calendarId,
        calendarName: googleInt.calendarName,
        connectedAt: googleInt.createdAt,
      } : { connected: false },
      microsoft: msInt ? {
        connected: true,
        calendarId: msInt.calendarId,
        calendarName: msInt.calendarName,
        connectedAt: msInt.createdAt,
      } : { connected: false },
      googleAvailable: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
      microsoftAvailable: !!(MS_CLIENT_ID && MS_CLIENT_SECRET),
    });
  } catch (err) {
    req.log.error({ err }, "Calendar status error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/integrations/calendar/google/connect", async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: "google_calendar_not_configured" });
    return;
  }

  const oAuth2 = buildGoogleOAuth2Client();
  if (!oAuth2) { res.status(503).json({ error: "google_calendar_not_configured" }); return; }

  let userId: number | null = null;

  if (req.authUser) {
    userId = req.authUser.id;
  } else if (req.query.token) {
    const { userId: uid, valid } = decodeSessionToken(req.query.token as string);
    if (valid) userId = uid;
  }

  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

  const authUrl = oAuth2.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    state,
  });

  res.redirect(authUrl);
});

router.get("/integrations/calendar/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ error }, "Google OAuth error");
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=google_oauth_denied`);
  }

  if (!code || !state) {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=google_oauth_invalid`);
  }

  let userId: number;
  try {
    const decoded = JSON.parse(Buffer.from(state as string, "base64url").toString());
    userId = decoded.userId;
    if (!userId) throw new Error("no userId");
  } catch {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=google_oauth_invalid`);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=google_not_configured`);
  }

  try {
    const oAuth2 = buildGoogleOAuth2Client();
    if (!oAuth2) throw new Error("no oAuth2");

    const { tokens } = await oAuth2.getToken(code as string);
    oAuth2.setCredentials(tokens);

    const calClient = google.calendar({ version: "v3", auth: oAuth2 });
    let calendarName = "Google Calendar";
    let calendarId = "primary";
    try {
      const calList = await calClient.calendarList.get({ calendarId: "primary" });
      calendarName = calList.data.summary ?? "Google Calendar";
      calendarId = calList.data.id ?? "primary";
    } catch {}

    await db.insert(userCalendarIntegrationsTable)
      .values({
        userId,
        provider: "google",
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarId,
        calendarName,
      })
      .onConflictDoUpdate({
        target: [userCalendarIntegrationsTable.userId, userCalendarIntegrationsTable.provider],
        set: {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          calendarId,
          calendarName,
          updatedAt: new Date(),
        },
      });

    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&success=google_connected`);
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback error");
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=google_oauth_failed`);
  }
});

router.post("/integrations/calendar/google/disconnect", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    await db.delete(userCalendarIntegrationsTable)
      .where(and(
        eq(userCalendarIntegrationsTable.userId, userId),
        eq(userCalendarIntegrationsTable.provider, "google"),
      ));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Google disconnect error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/integrations/calendar/microsoft/connect", async (req, res) => {
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    res.status(503).json({ error: "microsoft_calendar_not_configured" });
    return;
  }

  let userId: number | null = null;
  if (req.authUser) {
    userId = req.authUser.id;
  } else if (req.query.token) {
    const { userId: uid, valid } = decodeSessionToken(req.query.token as string);
    if (valid) userId = uid;
  }

  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    scope: "Calendars.ReadWrite offline_access",
    response_mode: "query",
    state,
  });

  const authUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  res.redirect(authUrl);
});

router.get("/integrations/calendar/microsoft/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    req.log.warn({ error }, "Microsoft OAuth error");
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=microsoft_oauth_denied`);
  }

  if (!code || !state) {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=microsoft_oauth_invalid`);
  }

  let userId: number;
  try {
    const decoded = JSON.parse(Buffer.from(state as string, "base64url").toString());
    userId = decoded.userId;
    if (!userId) throw new Error("no userId");
  } catch {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=microsoft_oauth_invalid`);
  }

  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=microsoft_not_configured`);
  }

  try {
    const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      code: code as string,
      redirect_uri: MS_REDIRECT_URI,
      grant_type: "authorization_code",
      scope: "Calendars.ReadWrite offline_access",
    });

    const tokenResp = await fetch(tokenUrl, { method: "POST", body: params });
    if (!tokenResp.ok) throw new Error("MS token exchange failed");
    const tokens: any = await tokenResp.json();

    const accessToken: string = tokens.access_token;
    const refreshToken: string | null = tokens.refresh_token ?? null;
    const tokenExpiry = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    let calendarName = "Outlook Calendar";
    let calendarId = "primary";
    try {
      const graphClient = Client.initWithMiddleware({
        authProvider: { getAccessToken: async () => accessToken },
      });
      const defaultCal = await graphClient.api("/me/calendar").get();
      calendarName = defaultCal.name ?? "Outlook Calendar";
      calendarId = defaultCal.id ?? "primary";
    } catch {}

    await db.insert(userCalendarIntegrationsTable)
      .values({
        userId,
        provider: "microsoft",
        accessToken,
        refreshToken,
        tokenExpiry,
        calendarId,
        calendarName,
      })
      .onConflictDoUpdate({
        target: [userCalendarIntegrationsTable.userId, userCalendarIntegrationsTable.provider],
        set: {
          accessToken,
          refreshToken,
          tokenExpiry,
          calendarId,
          calendarName,
          updatedAt: new Date(),
        },
      });

    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&success=microsoft_connected`);
  } catch (err) {
    req.log.error({ err }, "Microsoft OAuth callback error");
    return res.redirect(`${WEB_BASE_URL}/settings?tab=integrations&error=microsoft_oauth_failed`);
  }
});

router.post("/integrations/calendar/microsoft/disconnect", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    await db.delete(userCalendarIntegrationsTable)
      .where(and(
        eq(userCalendarIntegrationsTable.userId, userId),
        eq(userCalendarIntegrationsTable.provider, "microsoft"),
      ));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Microsoft disconnect error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
