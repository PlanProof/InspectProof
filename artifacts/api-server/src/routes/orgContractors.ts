import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, orgContractorsTable, orgContractorProjectAssignmentsTable, projectsTable, checklistResultsTable, checklistItemsTable, inspectionsTable, tradeCategoriesTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function scopeKey(authUser: { companyName?: string | null; id: number }): string {
  return authUser.companyName?.trim() || `user:${authUser.id}`;
}

router.get("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  try {
    const contractors = await db
      .select()
      .from(orgContractorsTable)
      .where(eq(orgContractorsTable.companyName, scope))
      .orderBy(orgContractorsTable.name);

    const contractorIds = contractors.map(c => c.id);
    if (contractorIds.length === 0) {
      res.json(contractors.map(c => ({ ...c, totalProjects: 0, activeProjects: 0 })));
      return;
    }

    const assignments = await db
      .select({
        orgContractorId: orgContractorProjectAssignmentsTable.orgContractorId,
        projectStatus: projectsTable.status,
      })
      .from(orgContractorProjectAssignmentsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, orgContractorProjectAssignmentsTable.projectId))
      .where(inArray(orgContractorProjectAssignmentsTable.orgContractorId, contractorIds));

    const statsByContractor: Record<number, { total: number; active: number }> = {};
    for (const a of assignments) {
      if (!statsByContractor[a.orgContractorId]) {
        statsByContractor[a.orgContractorId] = { total: 0, active: 0 };
      }
      statsByContractor[a.orgContractorId].total++;
      if (a.projectStatus === "active" || a.projectStatus === "in_progress") {
        statsByContractor[a.orgContractorId].active++;
      }
    }

    res.json(contractors.map(c => ({
      ...c,
      totalProjects: statsByContractor[c.id]?.total ?? 0,
      activeProjects: statsByContractor[c.id]?.active ?? 0,
    })));
  } catch (err) {
    req.log.error({ err }, "List org contractors error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const { name, trade, tradeCategoryId, email, company, licenceNumber, registrationNumber, licenceExpiry, registrationExpiry } = req.body as {
    name?: string; trade?: string; tradeCategoryId?: number | null; email?: string; company?: string;
    licenceNumber?: string; registrationNumber?: string; licenceExpiry?: string; registrationExpiry?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    // Validate tradeCategoryId belongs to this org
    let resolvedCategoryId: number | null = tradeCategoryId ?? null;
    if (resolvedCategoryId !== null) {
      const [cat] = await db
        .select({ id: tradeCategoriesTable.id })
        .from(tradeCategoriesTable)
        .where(and(eq(tradeCategoriesTable.id, resolvedCategoryId), eq(tradeCategoriesTable.companyName, scope)));
      if (!cat) {
        res.status(400).json({ error: "bad_request", message: "Invalid trade category" });
        return;
      }
    }
    const [created] = await db
      .insert(orgContractorsTable)
      .values({
        companyName: scope,
        name: name.trim(),
        trade: (trade ?? "").trim(),
        tradeCategoryId: resolvedCategoryId,
        email: email?.trim() || null,
        company: company?.trim() || null,
        licenceNumber: licenceNumber?.trim() || null,
        registrationNumber: registrationNumber?.trim() || null,
        licenceExpiry: licenceExpiry || null,
        registrationExpiry: registrationExpiry || null,
      })
      .returning();
    res.status(201).json({ ...created, totalProjects: 0, activeProjects: 0 });
  } catch (err) {
    req.log.error({ err }, "Create org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const contractorId = parseInt(req.params.id, 10);
  if (isNaN(contractorId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid contractor id" });
    return;
  }
  const { name, trade, tradeCategoryId, email, company, licenceNumber, registrationNumber, licenceExpiry, registrationExpiry } = req.body as {
    name?: string; trade?: string; tradeCategoryId?: number | null; email?: string; company?: string;
    licenceNumber?: string; registrationNumber?: string; licenceExpiry?: string; registrationExpiry?: string;
  };
  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: "bad_request", message: "name cannot be empty" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (trade !== undefined) updates.trade = trade.trim();
  if (email !== undefined) updates.email = email.trim() || null;
  if (company !== undefined) updates.company = company.trim() || null;
  if (licenceNumber !== undefined) updates.licenceNumber = licenceNumber.trim() || null;
  if (registrationNumber !== undefined) updates.registrationNumber = registrationNumber.trim() || null;
  if (licenceExpiry !== undefined) updates.licenceExpiry = licenceExpiry || null;
  if (registrationExpiry !== undefined) updates.registrationExpiry = registrationExpiry || null;
  try {
    // Validate tradeCategoryId belongs to this org scope
    if ("tradeCategoryId" in req.body) {
      const catId = tradeCategoryId ?? null;
      if (catId !== null) {
        const [cat] = await db
          .select({ id: tradeCategoriesTable.id })
          .from(tradeCategoriesTable)
          .where(and(eq(tradeCategoriesTable.id, catId), eq(tradeCategoriesTable.companyName, scope)));
        if (!cat) {
          res.status(400).json({ error: "bad_request", message: "Invalid trade category" });
          return;
        }
      }
      updates.tradeCategoryId = catId;
    }
    const [updated] = await db
      .update(orgContractorsTable)
      .set(updates)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const assignments = await db
      .select({ projectStatus: projectsTable.status })
      .from(orgContractorProjectAssignmentsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, orgContractorProjectAssignmentsTable.projectId))
      .where(eq(orgContractorProjectAssignmentsTable.orgContractorId, contractorId));

    const totalProjects = assignments.length;
    const activeProjects = assignments.filter(a => a.projectStatus === "active" || a.projectStatus === "in_progress").length;

    res.json({ ...updated, totalProjects, activeProjects });
  } catch (err) {
    req.log.error({ err }, "Update org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const contractorId = parseInt(req.params.id, 10);
  if (isNaN(contractorId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid contractor id" });
    return;
  }
  try {
    // Verify ownership FIRST before touching any rows
    const [existing] = await db
      .select({ id: orgContractorsTable.id })
      .from(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)));
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Now safe to delete assignments, then the contractor
    await db.delete(orgContractorProjectAssignmentsTable)
      .where(eq(orgContractorProjectAssignmentsTable.orgContractorId, contractorId));
    await db
      .delete(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/performance", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const contractorId = parseInt(req.params.id, 10);
  if (isNaN(contractorId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid contractor id" });
    return;
  }
  try {
    // Verify contractor belongs to this org
    const [contractor] = await db
      .select()
      .from(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)));
    if (!contractor) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const nameMatch = contractor.name.toLowerCase();
    const tradeMatch = contractor.trade?.toLowerCase() || "";

    const assignedProjectRows = await db
      .select({ projectId: orgContractorProjectAssignmentsTable.projectId })
      .from(orgContractorProjectAssignmentsTable)
      .where(eq(orgContractorProjectAssignmentsTable.orgContractorId, contractorId));

    const assignedProjectIds = assignedProjectRows.map(r => r.projectId);

    if (assignedProjectIds.length === 0) {
      res.json([]);
      return;
    }

    const [inspections, projects] = await Promise.all([
      db
        .select({ id: inspectionsTable.id, projectId: inspectionsTable.projectId, scheduledDate: inspectionsTable.scheduledDate })
        .from(inspectionsTable)
        .where(inArray(inspectionsTable.projectId, assignedProjectIds)),
      db
        .select({ id: projectsTable.id, name: projectsTable.name })
        .from(projectsTable)
        .where(inArray(projectsTable.id, assignedProjectIds)),
    ]);

    if (inspections.length === 0) {
      res.json([]);
      return;
    }

    const inspectionIds = inspections.map(i => i.id);

    const projectNameMap: Record<number, string> = {};
    for (const p of projects) projectNameMap[p.id] = p.name;

    const inspectionProjectMap: Record<number, { projectId: number; scheduledDate: unknown }> = {};
    for (const i of inspections) {
      if (i.projectId != null) {
        inspectionProjectMap[i.id] = { projectId: i.projectId, scheduledDate: i.scheduledDate };
      }
    }

    const allResults = await db
      .select()
      .from(checklistResultsTable)
      .where(inArray(checklistResultsTable.inspectionId, inspectionIds));

    const matched = allResults.filter(r => {
      const trade = (r.tradeAllocated ?? "").toLowerCase();
      const isDefect = r.result === "fail" || r.defectStatus === "open" || r.defectStatus === "in_progress";
      const matchesContractor = trade.includes(nameMatch) || (tradeMatch && trade.includes(tradeMatch));
      return isDefect && matchesContractor;
    });

    if (matched.length === 0) {
      res.json([]);
      return;
    }

    const itemIds = matched.map(r => r.checklistItemId).filter(Boolean) as number[];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.id, itemIds))
      : [];
    const itemMap: Record<number, string> = {};
    for (const item of items) {
      itemMap[item.id] = item.description ?? "Unknown";
    }

    const defects = matched.map(r => {
      const inspInfo = inspectionProjectMap[r.inspectionId];
      const projName = inspInfo ? (projectNameMap[inspInfo.projectId] ?? "Unknown Project") : "Unknown Project";
      const dateRaised = inspInfo?.scheduledDate
        ? (inspInfo.scheduledDate instanceof Date ? inspInfo.scheduledDate.toISOString() : String(inspInfo.scheduledDate))
        : (r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt));
      return {
        id: r.id,
        defectDescription: r.checklistItemId ? (itemMap[r.checklistItemId] ?? "Unknown Item") : "Unknown Item",
        notes: r.notes,
        severity: r.severity,
        location: r.location,
        status: r.defectStatus ?? r.result ?? "open",
        projectName: projName,
        projectId: inspInfo?.projectId,
        dateRaised,
        tradeAllocated: r.tradeAllocated,
      };
    });

    res.json(defects);
  } catch (err) {
    req.log.error({ err }, "Org contractor performance error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Trade Categories ──────────────────────────────────────────────────────────

router.get("/trade-categories", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  try {
    const categories = await db
      .select()
      .from(tradeCategoriesTable)
      .where(eq(tradeCategoriesTable.companyName, scope))
      .orderBy(tradeCategoriesTable.name);
    res.json(categories);
  } catch (err) {
    req.log.error({ err }, "List trade categories error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/trade-categories", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    const [created] = await db
      .insert(tradeCategoriesTable)
      .values({ companyName: scope, name: name.trim() })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Create trade category error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/trade-categories/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const categoryId = parseInt(req.params.id, 10);
  if (isNaN(categoryId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid category id" });
    return;
  }
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    const [updated] = await db
      .update(tradeCategoriesTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(and(eq(tradeCategoriesTable.id, categoryId), eq(tradeCategoriesTable.companyName, scope)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Update trade category error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/trade-categories/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const categoryId = parseInt(req.params.id, 10);
  if (isNaN(categoryId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid category id" });
    return;
  }
  try {
    const [existing] = await db
      .select({ id: tradeCategoriesTable.id })
      .from(tradeCategoriesTable)
      .where(and(eq(tradeCategoriesTable.id, categoryId), eq(tradeCategoriesTable.companyName, scope)));
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await db
      .delete(tradeCategoriesTable)
      .where(and(eq(tradeCategoriesTable.id, categoryId), eq(tradeCategoriesTable.companyName, scope)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete trade category error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
