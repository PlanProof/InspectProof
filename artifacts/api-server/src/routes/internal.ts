import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, inspectionsTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { sendInspectionReminderEmail } from "../lib/email";

const router: IRouter = Router();

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_SECRET) {
    res.status(503).json({ error: "Internal endpoints not configured (INTERNAL_API_SECRET not set)" });
    return;
  }
  const provided = req.headers["x-internal-secret"];
  if (provided !== INTERNAL_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const REMINDER_DAYS_BEFORE = parseInt(process.env.INSPECTION_REMINDER_DAYS_BEFORE ?? "1", 10);

router.post("/internal/send-inspection-reminders", requireInternalSecret, async (req, res) => {
  try {
    const daysAhead = REMINDER_DAYS_BEFORE;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    const scheduledInspections = await db
      .select()
      .from(inspectionsTable)
      .where(
        and(
          eq(inspectionsTable.scheduledDate, targetDateStr),
          sql`${inspectionsTable.status} IN ('scheduled', 'in_progress')`
        )
      );

    const results: Array<{ inspectionId: number; email: string; status: "sent" | "skipped" | "failed" }> = [];

    for (const inspection of scheduledInspections) {
      if (!inspection.inspectorId) {
        results.push({ inspectionId: inspection.id, email: "", status: "skipped" });
        continue;
      }

      const [inspector] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, inspection.inspectorId));

      if (!inspector?.email) {
        results.push({ inspectionId: inspection.id, email: "", status: "skipped" });
        continue;
      }

      const project = inspection.projectId
        ? (await db.select().from(projectsTable).where(eq(projectsTable.id, inspection.projectId)))[0]
        : null;

      const sent = await sendInspectionReminderEmail({
        inspectorName: `${inspector.firstName} ${inspector.lastName}`.trim(),
        inspectorEmail: inspector.email,
        inspectionType: inspection.inspectionType,
        projectName: project?.name ?? "Unknown Project",
        projectAddress: [project?.siteAddress, project?.suburb, project?.state].filter(Boolean).join(", ") || "—",
        scheduledDate: inspection.scheduledDate,
        scheduledTime: inspection.scheduledTime ?? null,
        inspectionId: inspection.id,
        daysUntil: daysAhead,
      }, req.log);
      results.push({ inspectionId: inspection.id, email: inspector.email, status: sent ? "sent" : "failed" });
    }

    const sentCount = results.filter(r => r.status === "sent").length;
    const failedCount = results.filter(r => r.status === "failed").length;
    const skippedCount = results.filter(r => r.status === "skipped").length;
    req.log.info({ targetDate: targetDateStr, total: scheduledInspections.length, sent: sentCount, failed: failedCount, skipped: skippedCount }, "Inspection reminders processed");

    res.json({
      success: true,
      targetDate: targetDateStr,
      daysAhead,
      total: scheduledInspections.length,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      results,
    });
  } catch (err) {
    req.log.error({ err }, "Send inspection reminders error");
    res.status(500).json({ error: "internal_error", message: "Failed to send inspection reminders" });
  }
});

export default router;
