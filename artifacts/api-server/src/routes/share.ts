import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, inspectionsTable, projectsTable, checklistResultsTable, checklistItemsTable, issuesTable, usersTable } from "@workspace/db";
import crypto from "crypto";

const router: IRouter = Router();

router.post("/inspections/:id/share", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const token = crypto.randomBytes(24).toString("hex");
    const [updated] = await db.update(inspectionsTable)
      .set({ shareToken: token, updatedAt: new Date() } as any)
      .where(eq(inspectionsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ shareToken: token });
  } catch (err) {
    req.log.error({ err }, "Generate share token error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/inspections/:id/share", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.update(inspectionsTable)
      .set({ shareToken: null, updatedAt: new Date() } as any)
      .where(eq(inspectionsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/inspections/:id/sign-off", async (req, res) => {
  try {
    const inspId = parseInt(req.params.id);
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const decoded = Buffer.from(auth.slice(7), "base64").toString();
    const [userId] = decoded.split(":").map(Number);

    const [updated] = await db.update(inspectionsTable)
      .set({
        status: "completed",
        completedDate: new Date().toISOString().slice(0, 10),
        signedOffAt: new Date(),
        signedOffById: userId,
        updatedAt: new Date(),
      } as any)
      .where(eq(inspectionsTable.id, inspId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ ok: true, signedOffAt: (updated as any).signedOffAt });
  } catch (err) {
    req.log.error({ err }, "Sign-off error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const inspections = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.shareToken as any, token));
    const insp = inspections[0];
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, insp.projectId!));
    const project = projects[0];

    let inspectorName: string | null = null;
    if (insp.inspectorId) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, insp.inspectorId));
      if (users[0]) inspectorName = `${users[0].firstName} ${users[0].lastName}`;
    }

    const results = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, insp.id));

    const itemIds = [...new Set(results.map(r => r.checklistItemId))];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable)
      : [];

    const itemMap: Record<number, any> = {};
    for (const item of items) {
      itemMap[item.id] = item;
    }

    const passCount = results.filter(r => r.result === "pass").length;
    const failCount = results.filter(r => r.result === "fail").length;
    const naCount = results.filter(r => r.result === "na").length;

    const issues = await db.select().from(issuesTable)
      .where(eq(issuesTable.inspectionId, insp.id));

    res.json({
      inspection: {
        id: insp.id,
        inspectionType: insp.inspectionType,
        status: insp.status,
        scheduledDate: insp.scheduledDate,
        completedDate: insp.completedDate,
        inspectorName,
        weatherConditions: insp.weatherConditions,
        notes: insp.notes,
        signedOffAt: (insp as any).signedOffAt,
        passCount,
        failCount,
        naCount,
        totalItems: results.length,
      },
      project: project ? {
        name: project.name,
        siteAddress: project.siteAddress,
        suburb: project.suburb,
        state: project.state,
        clientName: project.clientName,
        builderName: project.builderName,
      } : null,
      issues: issues.map(i => ({
        title: i.title,
        description: i.description,
        severity: i.severity,
        status: i.status,
        location: i.location,
        dueDate: i.dueDate,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Share view error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
