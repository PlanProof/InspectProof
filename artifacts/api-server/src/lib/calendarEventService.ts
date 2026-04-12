import { db, inspectionsTable, projectsTable, usersTable, userCalendarIntegrationsTable } from "@workspace/db";
import { formatInspectionType } from "./inspectionTypes";
import { eq, and } from "drizzle-orm";
import type { Logger } from "pino";
import { google } from "googleapis";
import { Client } from "@microsoft/microsoft-graph-client";

const APP_BASE_URL = process.env.APP_BASE_URL || "https://inspectproof.com.au";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";

const MS_CLIENT_ID = process.env.MS_CALENDAR_CLIENT_ID || "";
const MS_CLIENT_SECRET = process.env.MS_CALENDAR_CLIENT_SECRET || "";
const MS_TENANT_ID = process.env.MS_CALENDAR_TENANT_ID || "common";

function buildGoogleOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  const redirectUri = `${APP_BASE_URL}/api/integrations/calendar/google/callback`;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

async function getGoogleCalendarClient(integration: { accessToken: string; refreshToken: string | null; tokenExpiry: Date | null }) {
  const oAuth2 = buildGoogleOAuth2Client();
  if (!oAuth2) return null;

  oAuth2.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken ?? undefined,
    expiry_date: integration.tokenExpiry ? integration.tokenExpiry.getTime() : undefined,
  });

  return google.calendar({ version: "v3", auth: oAuth2 });
}

async function refreshGoogleTokenIfNeeded(
  userId: number,
  integration: { id: number; accessToken: string; refreshToken: string | null; tokenExpiry: Date | null },
  log: Logger,
): Promise<{ accessToken: string; refreshToken: string | null; tokenExpiry: Date | null } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  const now = Date.now();
  const expiry = integration.tokenExpiry ? integration.tokenExpiry.getTime() : 0;
  if (expiry - now > 5 * 60 * 1000) {
    return integration;
  }
  if (!integration.refreshToken) return null;

  try {
    const oAuth2 = buildGoogleOAuth2Client();
    if (!oAuth2) return null;
    oAuth2.setCredentials({ refresh_token: integration.refreshToken });
    const { credentials } = await oAuth2.refreshAccessToken();

    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null;
    const newToken = credentials.access_token ?? integration.accessToken;

    await db.update(userCalendarIntegrationsTable)
      .set({ accessToken: newToken, tokenExpiry: newExpiry, updatedAt: new Date() })
      .where(eq(userCalendarIntegrationsTable.id, integration.id));

    return { accessToken: newToken, refreshToken: integration.refreshToken, tokenExpiry: newExpiry };
  } catch (err) {
    log.error({ err }, "Failed to refresh Google token");
    return null;
  }
}

async function getMsAccessToken(
  userId: number,
  integration: { id: number; accessToken: string; refreshToken: string | null; tokenExpiry: Date | null },
  log: Logger,
): Promise<string | null> {
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) return null;

  const now = Date.now();
  const expiry = integration.tokenExpiry ? integration.tokenExpiry.getTime() : 0;
  if (expiry - now > 5 * 60 * 1000) return integration.accessToken;
  if (!integration.refreshToken) return null;

  try {
    const tokenUrl = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: integration.refreshToken,
      grant_type: "refresh_token",
      scope: "Calendars.ReadWrite offline_access",
    });

    const resp = await fetch(tokenUrl, { method: "POST", body: params });
    if (!resp.ok) throw new Error("MS token refresh failed");
    const data: any = await resp.json();

    const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    const newToken = data.access_token;
    const newRefresh = data.refresh_token ?? integration.refreshToken;

    await db.update(userCalendarIntegrationsTable)
      .set({ accessToken: newToken, refreshToken: newRefresh, tokenExpiry: newExpiry, updatedAt: new Date() })
      .where(eq(userCalendarIntegrationsTable.id, integration.id));

    return newToken;
  } catch (err) {
    log.error({ err }, "Failed to refresh Microsoft token");
    return null;
  }
}

interface EventDetails {
  inspectionId: number;
  inspectionType: string;
  projectName: string;
  projectAddress: string;
  scheduledDate: string;
  scheduledTime: string | null;
  calendarId: string;
}

function buildEventBody(details: EventDetails): { summary: string; description: string; startDateTime: string; endDateTime: string } {
  const typeLabel = formatInspectionType(details.inspectionType);
  const summary = `${typeLabel} — ${details.projectName}`;
  const deepLink = `${APP_BASE_URL}/inspections/${details.inspectionId}`;
  const description = [
    `Inspection Type: ${typeLabel}`,
    `Project: ${details.projectName}`,
    details.projectAddress ? `Address: ${details.projectAddress}` : null,
    ``,
    `View in InspectProof: ${deepLink}`,
  ].filter(l => l !== null).join("\n");

  let startIso: string;
  let endIso: string;
  const [year, month, day] = details.scheduledDate.split("-").map(Number);

  if (details.scheduledTime) {
    const [hour, min] = details.scheduledTime.split(":").map(Number);
    const start = new Date(year, month - 1, day, hour, min);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    startIso = start.toISOString();
    endIso = end.toISOString();
  } else {
    startIso = `${details.scheduledDate}T00:00:00`;
    endIso = `${details.scheduledDate}T00:00:00`;
  }

  return { summary, description, startDateTime: startIso, endDateTime: endIso };
}

async function getInspectionDetails(inspectionId: number): Promise<EventDetails | null> {
  const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
  if (!inspection || !inspection.scheduledDate) return null;

  const [project] = inspection.projectId
    ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId))
    : [];

  return {
    inspectionId,
    inspectionType: inspection.inspectionType,
    projectName: project?.name ?? "Standalone",
    projectAddress: [project?.siteAddress, project?.suburb, project?.state].filter(Boolean).join(", "),
    scheduledDate: inspection.scheduledDate,
    scheduledTime: inspection.scheduledTime ?? null,
    calendarId: "primary",
  };
}

async function getUserCalendarIntegration(userId: number, provider: string) {
  const [integration] = await db.select()
    .from(userCalendarIntegrationsTable)
    .where(and(
      eq(userCalendarIntegrationsTable.userId, userId),
      eq(userCalendarIntegrationsTable.provider, provider),
    ));
  return integration ?? null;
}

export async function createCalendarEvent(inspectionId: number, inspectorId: number, log: Logger): Promise<void> {
  const details = await getInspectionDetails(inspectionId);
  if (!details) return;

  const createdEventIds: string[] = [];

  const googleInt = await getUserCalendarIntegration(inspectorId, "google");
  if (googleInt) {
    try {
      const refreshed = await refreshGoogleTokenIfNeeded(inspectorId, googleInt, log);
      if (refreshed) {
        const client = await getGoogleCalendarClient(refreshed);
        if (client) {
          const ev = buildEventBody({ ...details, calendarId: googleInt.calendarId });
          const isAllDay = !details.scheduledTime;
          const event: any = {
            summary: ev.summary,
            description: ev.description,
          };
          if (isAllDay) {
            event.start = { date: details.scheduledDate };
            event.end = { date: details.scheduledDate };
          } else {
            event.start = { dateTime: ev.startDateTime };
            event.end = { dateTime: ev.endDateTime };
          }
          const resp = await client.events.insert({ calendarId: googleInt.calendarId, requestBody: event });
          if (resp.data.id) {
            createdEventIds.push(`google:${resp.data.id}`);
          }
        }
      }
    } catch (err) {
      log.error({ err, inspectionId }, "Failed to create Google Calendar event");
    }
  }

  const msInt = await getUserCalendarIntegration(inspectorId, "microsoft");
  if (msInt) {
    try {
      const accessToken = await getMsAccessToken(inspectorId, msInt, log);
      if (accessToken) {
        const ev = buildEventBody({ ...details, calendarId: msInt.calendarId });
        const isAllDay = !details.scheduledTime;
        const event: any = {
          subject: ev.summary,
          body: { contentType: "text", content: ev.description },
          isAllDay,
        };
        if (isAllDay) {
          event.start = { dateTime: `${details.scheduledDate}T00:00:00`, timeZone: "UTC" };
          event.end = { dateTime: `${details.scheduledDate}T00:00:00`, timeZone: "UTC" };
        } else {
          event.start = { dateTime: ev.startDateTime, timeZone: "UTC" };
          event.end = { dateTime: ev.endDateTime, timeZone: "UTC" };
        }
        const client = Client.initWithMiddleware({
          authProvider: { getAccessToken: async () => accessToken },
        });
        const calPath = msInt.calendarId && msInt.calendarId !== "primary"
          ? `/me/calendars/${msInt.calendarId}/events`
          : "/me/events";
        const resp = await client.api(calPath).post(event);
        if (resp.id) {
          createdEventIds.push(`microsoft:${resp.id}`);
        }
      }
    } catch (err) {
      log.error({ err, inspectionId }, "Failed to create Microsoft Calendar event");
    }
  }

  if (createdEventIds.length > 0) {
    await db.update(inspectionsTable)
      .set({ calendarEventId: createdEventIds.join(","), updatedAt: new Date() })
      .where(eq(inspectionsTable.id, inspectionId));
  }
}

export async function updateCalendarEvent(inspectionId: number, inspectorId: number, log: Logger): Promise<void> {
  const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
  if (!inspection) return;

  const storedIds = inspection.calendarEventId ?? "";
  if (!storedIds) {
    await createCalendarEvent(inspectionId, inspectorId, log);
    return;
  }

  const details = await getInspectionDetails(inspectionId);
  if (!details) return;

  const entries = storedIds.split(",").filter(Boolean);
  const updatedIds: string[] = [];

  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    const provider = entry.slice(0, colonIdx);
    const eventId = entry.slice(colonIdx + 1);

    if (provider === "google") {
      const googleInt = await getUserCalendarIntegration(inspectorId, "google");
      if (!googleInt) { updatedIds.push(entry); continue; }
      try {
        const refreshed = await refreshGoogleTokenIfNeeded(inspectorId, googleInt, log);
        if (refreshed) {
          const client = await getGoogleCalendarClient(refreshed);
          if (client) {
            const ev = buildEventBody(details);
            const isAllDay = !details.scheduledTime;
            const event: any = { summary: ev.summary, description: ev.description };
            if (isAllDay) {
              event.start = { date: details.scheduledDate };
              event.end = { date: details.scheduledDate };
            } else {
              event.start = { dateTime: ev.startDateTime };
              event.end = { dateTime: ev.endDateTime };
            }
            await client.events.update({ calendarId: googleInt.calendarId, eventId, requestBody: event });
            updatedIds.push(entry);
          }
        }
      } catch (err) {
        log.error({ err, inspectionId, eventId }, "Failed to update Google Calendar event");
        updatedIds.push(entry);
      }
    } else if (provider === "microsoft") {
      const msInt = await getUserCalendarIntegration(inspectorId, "microsoft");
      if (!msInt) { updatedIds.push(entry); continue; }
      try {
        const accessToken = await getMsAccessToken(inspectorId, msInt, log);
        if (accessToken) {
          const ev = buildEventBody(details);
          const isAllDay = !details.scheduledTime;
          const event: any = {
            subject: ev.summary,
            body: { contentType: "text", content: ev.description },
            isAllDay,
          };
          if (isAllDay) {
            event.start = { dateTime: `${details.scheduledDate}T00:00:00`, timeZone: "UTC" };
            event.end = { dateTime: `${details.scheduledDate}T00:00:00`, timeZone: "UTC" };
          } else {
            event.start = { dateTime: ev.startDateTime, timeZone: "UTC" };
            event.end = { dateTime: ev.endDateTime, timeZone: "UTC" };
          }
          const client = Client.initWithMiddleware({
            authProvider: { getAccessToken: async () => accessToken },
          });
          await client.api(`/me/events/${eventId}`).patch(event);
          updatedIds.push(entry);
        }
      } catch (err) {
        log.error({ err, inspectionId, eventId }, "Failed to update Microsoft Calendar event");
        updatedIds.push(entry);
      }
    }
  }

  await db.update(inspectionsTable)
    .set({ calendarEventId: updatedIds.join(",") || null, updatedAt: new Date() })
    .where(eq(inspectionsTable.id, inspectionId));
}

export async function deleteCalendarEvent(inspectionId: number, inspectorId: number, log: Logger): Promise<void> {
  const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
  if (!inspection?.calendarEventId) return;

  const entries = inspection.calendarEventId.split(",").filter(Boolean);

  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    const provider = entry.slice(0, colonIdx);
    const eventId = entry.slice(colonIdx + 1);

    if (provider === "google") {
      const googleInt = await getUserCalendarIntegration(inspectorId, "google");
      if (!googleInt) continue;
      try {
        const refreshed = await refreshGoogleTokenIfNeeded(inspectorId, googleInt, log);
        if (refreshed) {
          const client = await getGoogleCalendarClient(refreshed);
          if (client) {
            await client.events.delete({ calendarId: googleInt.calendarId, eventId });
          }
        }
      } catch (err) {
        log.error({ err, inspectionId, eventId }, "Failed to delete Google Calendar event");
      }
    } else if (provider === "microsoft") {
      const msInt = await getUserCalendarIntegration(inspectorId, "microsoft");
      if (!msInt) continue;
      try {
        const accessToken = await getMsAccessToken(inspectorId, msInt, log);
        if (accessToken) {
          const client = Client.initWithMiddleware({
            authProvider: { getAccessToken: async () => accessToken },
          });
          await client.api(`/me/events/${eventId}`).delete();
        }
      } catch (err) {
        log.error({ err, inspectionId, eventId }, "Failed to delete Microsoft Calendar event");
      }
    }
  }

  await db.update(inspectionsTable)
    .set({ calendarEventId: null, updatedAt: new Date() })
    .where(eq(inspectionsTable.id, inspectionId));
}
