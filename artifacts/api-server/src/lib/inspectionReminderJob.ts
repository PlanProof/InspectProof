import cron from "node-cron";
import { pool, db, inspectionsTable, usersTable, projectsTable, activityLogsTable } from "@workspace/db";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { logger } from "./logger";
import { sendInspectionReminderEmail } from "./email";
import { sendExpoPush } from "./expoPush";

interface OrgReminderSettings {
  inspectionRemindersEnabled: boolean;
  inspectionReminderLeadDays: number[];
}

const DEFAULT_LEAD_DAYS = [1, 3];
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;

function isQuietHours(timezone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour");
    const hour = hourPart ? parseInt(hourPart.value, 10) : new Date().getUTCHours();
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  } catch {
    const hour = new Date().getUTCHours();
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  }
}

function parsePrefs(notificationPrefs: string | null): Record<string, unknown> {
  if (!notificationPrefs) return {};
  try {
    return JSON.parse(notificationPrefs) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getUserTimezone(notificationPrefs: string | null): string {
  const prefs = parsePrefs(notificationPrefs);
  return typeof prefs.timezone === "string" && prefs.timezone.length > 0
    ? prefs.timezone
    : "Australia/Sydney";
}

/**
 * Resolves the canonical (primary) company admin record for an org.
 * Uses the inspector's adminUserId chain to find the org-level company admin,
 * then looks up the oldest active company admin with the same companyName to ensure
 * a single consistent settings source regardless of which admin is signed in.
 */
async function getPrimaryOrgAdmin(inspectorId: number): Promise<{ adminId: number; companyName: string | null }> {
  const [inspector] = await db
    .select({ isCompanyAdmin: usersTable.isCompanyAdmin, adminUserId: usersTable.adminUserId, companyName: usersTable.companyName })
    .from(usersTable)
    .where(eq(usersTable.id, inspectorId));
  if (!inspector) return { adminId: inspectorId, companyName: null };

  let directAdminId = inspectorId;
  if (!inspector.isCompanyAdmin && inspector.adminUserId) {
    const parsed = parseInt(inspector.adminUserId, 10);
    if (!isNaN(parsed)) directAdminId = parsed;
  } else if (inspector.isCompanyAdmin) {
    directAdminId = inspectorId;
  }

  // If the resolved admin has a companyName, find the oldest (lowest id) active company admin
  // with that companyName as the canonical org settings record.
  const [resolvedAdmin] = await db
    .select({ companyName: usersTable.companyName })
    .from(usersTable)
    .where(eq(usersTable.id, directAdminId));

  const companyName = resolvedAdmin?.companyName ?? inspector.companyName ?? null;
  if (!companyName) return { adminId: directAdminId, companyName: null };

  const [primaryAdmin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.companyName, companyName), eq(usersTable.isCompanyAdmin, true), eq(usersTable.isActive, true)))
    .orderBy(usersTable.id);

  return { adminId: primaryAdmin?.id ?? directAdminId, companyName };
}

async function getOrgReminderSettings(adminId: number): Promise<OrgReminderSettings> {
  try {
    const [user] = await db
      .select({ notificationPrefs: usersTable.notificationPrefs })
      .from(usersTable)
      .where(eq(usersTable.id, adminId));
    const prefs = parsePrefs(user?.notificationPrefs ?? null);
    const leadDays = Array.isArray(prefs.inspectionReminderLeadDays)
      ? (prefs.inspectionReminderLeadDays as unknown[])
          .filter((d): d is number => typeof d === "number" && d > 0)
      : DEFAULT_LEAD_DAYS;
    return {
      inspectionRemindersEnabled: prefs.inspectionRemindersEnabled !== false,
      inspectionReminderLeadDays: leadDays.length > 0 ? leadDays : DEFAULT_LEAD_DAYS,
    };
  } catch {
    return { inspectionRemindersEnabled: true, inspectionReminderLeadDays: DEFAULT_LEAD_DAYS };
  }
}

/**
 * Atomically reserves a reminder slot before sending.
 * Returns true if this process/instance owns the send (row inserted),
 * false if another instance already claimed it (conflict).
 */
async function tryReserveReminder(
  inspectionId: number,
  reminderType: string,
  inspectorId: number | null,
): Promise<boolean> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO inspection_reminders (inspection_id, reminder_type, inspector_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (inspection_id, reminder_type) DO NOTHING
     RETURNING id`,
    [inspectionId, reminderType, inspectorId],
  );
  return result.rows.length > 0;
}

interface AdminContact {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  expoPushToken: string | null;
  notificationPrefs: string | null;
}

async function getOrgAdmins(companyName: string | null, adminId: number): Promise<AdminContact[]> {
  if (companyName) {
    const admins = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        expoPushToken: usersTable.expoPushToken,
        notificationPrefs: usersTable.notificationPrefs,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyName, companyName),
          eq(usersTable.isCompanyAdmin, true),
          eq(usersTable.isActive, true),
        )
      );
    if (admins.length > 0) return admins;
  }

  const [fallback] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      expoPushToken: usersTable.expoPushToken,
      notificationPrefs: usersTable.notificationPrefs,
    })
    .from(usersTable)
    .where(eq(usersTable.id, adminId));
  return fallback ? [fallback] : [];
}

async function dispatchEmailAndPush(opts: {
  recipient: { id: number; email: string; firstName: string; lastName: string; expoPushToken: string | null; notificationPrefs: string | null };
  emailOpts: Parameters<typeof sendInspectionReminderEmail>[0];
  pushTitle: string;
  pushBody: string;
  pushData: Record<string, unknown>;
  inspectionId: number;
  inspectorId: number;
  description: string;
}): Promise<void> {
  const { recipient, emailOpts, pushTitle, pushBody, pushData, inspectionId, inspectorId, description } = opts;

  await sendInspectionReminderEmail({ ...emailOpts, inspectorName: `${recipient.firstName} ${recipient.lastName}`.trim(), inspectorEmail: recipient.email }, logger).catch(() => {});

  const recipientTimezone = getUserTimezone(recipient.notificationPrefs);
  if (!isQuietHours(recipientTimezone) && recipient.expoPushToken) {
    await sendExpoPush(recipient.expoPushToken, pushTitle, pushBody, pushData, logger).catch(() => {});
  }

  await db.insert(activityLogsTable).values({
    entityType: "inspection",
    entityId: inspectionId,
    action: "reminder_sent",
    description,
    userId: inspectorId,
  });
}

export async function runInspectionReminderJob(): Promise<void> {
  logger.info("Running inspection reminder job");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allScheduled = await db
      .select()
      .from(inspectionsTable)
      .where(
        and(
          ne(inspectionsTable.status, "completed"),
          ne(inspectionsTable.status, "cancelled"),
          isNotNull(inspectionsTable.scheduledDate),
          isNotNull(inspectionsTable.inspectorId),
        )
      );

    logger.info({ count: allScheduled.length }, "Checking scheduled inspections for reminders");

    for (const inspection of allScheduled) {
      if (!inspection.scheduledDate || !inspection.inspectorId) continue;

      const [inspector] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, inspection.inspectorId));
      if (!inspector) continue;

      const { adminId, companyName } = await getPrimaryOrgAdmin(inspection.inspectorId);
      const orgSettings = await getOrgReminderSettings(adminId);
      if (!orgSettings.inspectionRemindersEnabled) continue;

      const [project] = inspection.projectId
        ? await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId))
        : [];

      const scheduledDate = new Date(inspection.scheduledDate + "T00:00:00");
      scheduledDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const typeLabel = (inspection.inspectionType || "Inspection")
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      const projectName = project?.name ?? "Unknown Project";
      const projectAddress = project
        ? [project.siteAddress, project.suburb, project.state].filter(Boolean).join(", ")
        : "";
      const inspectorName = `${inspector.firstName} ${inspector.lastName}`.trim();

      if (diffDays >= 0) {
        for (const leadDay of orgSettings.inspectionReminderLeadDays) {
          if (diffDays !== leadDay) continue;

          const reminderType = `upcoming_${leadDay}d`;

          // Reserve atomically before sending — concurrent instances see the conflict and skip
          const reserved = await tryReserveReminder(inspection.id, reminderType, inspection.inspectorId);
          if (!reserved) break;

          logger.info({ inspectionId: inspection.id, leadDay }, "Sending upcoming inspection reminder");

          await pool.query(`UPDATE inspections SET reminder_sent_at = now() WHERE id = $1`, [inspection.id]);

          const baseEmailOpts: Parameters<typeof sendInspectionReminderEmail>[0] = {
            inspectorName,
            inspectorEmail: inspector.email,
            inspectionType: inspection.inspectionType,
            projectName,
            projectAddress,
            scheduledDate: inspection.scheduledDate,
            scheduledTime: inspection.scheduledTime ?? null,
            inspectionId: inspection.id,
            reminderType: "upcoming",
            daysUntil: leadDay,
          };

          await dispatchEmailAndPush({
            recipient: { id: inspector.id, email: inspector.email, firstName: inspector.firstName, lastName: inspector.lastName, expoPushToken: inspector.expoPushToken, notificationPrefs: inspector.notificationPrefs },
            emailOpts: baseEmailOpts,
            pushTitle: `Inspection in ${leadDay} day${leadDay === 1 ? "" : "s"}`,
            pushBody: `${typeLabel} — ${projectName}`,
            pushData: { inspectionId: inspection.id, type: "upcoming_reminder" },
            inspectionId: inspection.id,
            inspectorId: inspection.inspectorId!,
            description: `Upcoming reminder sent to ${inspectorName} (${leadDay} day${leadDay === 1 ? "" : "s"} before scheduled date)`,
          });

          break;
        }
      } else {
        const reminderType = "overdue";
        const daysOverdue = Math.abs(diffDays);

        const reserved = await tryReserveReminder(inspection.id, reminderType, inspection.inspectorId);
        if (!reserved) continue;

        logger.info({ inspectionId: inspection.id, daysOverdue }, "Sending overdue inspection reminder");

        await pool.query(`UPDATE inspections SET reminder_sent_at = now() WHERE id = $1`, [inspection.id]);

        const overdueBaseOpts: Parameters<typeof sendInspectionReminderEmail>[0] = {
          inspectorName,
          inspectorEmail: inspector.email,
          inspectionType: inspection.inspectionType,
          projectName,
          projectAddress,
          scheduledDate: inspection.scheduledDate,
          scheduledTime: inspection.scheduledTime ?? null,
          inspectionId: inspection.id,
          reminderType: "overdue",
          daysOverdue,
        };

        // Notify inspector
        await dispatchEmailAndPush({
          recipient: { id: inspector.id, email: inspector.email, firstName: inspector.firstName, lastName: inspector.lastName, expoPushToken: inspector.expoPushToken, notificationPrefs: inspector.notificationPrefs },
          emailOpts: overdueBaseOpts,
          pushTitle: "Overdue Inspection",
          pushBody: `${typeLabel} — ${projectName} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue)`,
          pushData: { inspectionId: inspection.id, type: "overdue_reminder" },
          inspectionId: inspection.id,
          inspectorId: inspection.inspectorId!,
          description: `Overdue alert sent to inspector ${inspectorName} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue)`,
        });

        // Notify all org admins
        const orgAdmins = await getOrgAdmins(companyName, adminId);
        for (const admin of orgAdmins) {
          if (admin.id === inspection.inspectorId) continue;

          await dispatchEmailAndPush({
            recipient: admin,
            emailOpts: {
              ...overdueBaseOpts,
              reminderType: "overdue_admin",
              assignedInspectorName: inspectorName,
            },
            pushTitle: "Overdue Inspection Alert",
            pushBody: `${typeLabel} — ${projectName} assigned to ${inspectorName} (${daysOverdue}d overdue)`,
            pushData: { inspectionId: inspection.id, type: "overdue_admin_reminder" },
            inspectionId: inspection.id,
            inspectorId: inspection.inspectorId!,
            description: `Overdue alert sent to admin ${admin.firstName} ${admin.lastName} for inspection assigned to ${inspectorName} (${daysOverdue}d overdue)`,
          });
        }
      }
    }

    logger.info("Inspection reminder job completed");
  } catch (err) {
    logger.error({ err }, "Inspection reminder job failed");
  }
}

export function startInspectionReminderCron(): void {
  cron.schedule(
    "0 7 * * *",
    () => {
      runInspectionReminderJob().catch((err: unknown) =>
        logger.error({ err }, "Inspection reminder cron failed")
      );
    },
    { timezone: "Australia/Sydney" }
  );
  logger.info("Inspection reminder cron scheduled (daily 7am AEST)");
}
