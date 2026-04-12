import { Router, type IRouter } from "express";
import express from "express";
import { eq, and, notInArray } from "drizzle-orm";
import {
  db,
  inspectionsTable,
  projectsTable,
  checklistResultsTable,
  checklistItemsTable,
  issuesTable,
  usersTable,
  activityLogsTable,
  shareAcknowledgementsTable,
  contractorShareTokensTable,
  reportsTable,
} from "@workspace/db";
import crypto from "crypto";
import { requireAuth, isInspectorOnly, type AuthUser } from "../middleware/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

const SYSTEM_USER_ID = 1;

/**
 * Returns true if the caller may access an inspection.
 * Mirrors the canAccessInspection() function in inspections.ts exactly.
 */
async function canAccessInspection(inspection: { projectId: number | null; inspectorId?: number | null }, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  if (isInspectorOnly(user)) return inspection.inspectorId === user.id;
  if (!inspection.projectId) return false;
  const [project] = await db.select({ createdById: projectsTable.createdById }).from(projectsTable).where(eq(projectsTable.id, inspection.projectId));
  if (!project) return false;
  const adminId = user.isCompanyAdmin ? user.id : (user.adminUserId ? parseInt(user.adminUserId) : user.id);
  if (project.createdById === user.id || project.createdById === adminId) return true;
  const [creator] = await db.select({ adminUserId: usersTable.adminUserId }).from(usersTable).where(eq(usersTable.id, project.createdById));
  return !!(creator?.adminUserId && parseInt(creator.adminUserId) === adminId);
}

function isTokenExpired(expiry: Date | null): boolean {
  if (!expiry) return false;
  return new Date() > expiry;
}

// ─── Client Share Token ───────────────────────────────────────────────────────

router.post("/inspections/:id/share", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;
    const { expiryDays } = req.body;

    const [insp] = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      inspectorId: inspectionsTable.inspectorId,
    }).from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    if (!(await canAccessInspection(insp, caller))) {
      res.status(403).json({ error: "forbidden", message: "Access denied." });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    let expiry: Date | null = null;
    if (expiryDays && !isNaN(parseInt(expiryDays))) {
      expiry = new Date();
      expiry.setDate(expiry.getDate() + parseInt(expiryDays));
    }

    const [updated] = await db.update(inspectionsTable)
      .set({ shareToken: token, shareTokenExpiry: expiry, updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ shareToken: token, shareTokenExpiry: expiry });
  } catch (err) {
    req.log.error({ err }, "Generate share token error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/inspections/:id/share", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;

    const [insp] = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      inspectorId: inspectionsTable.inspectorId,
    }).from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    if (!(await canAccessInspection(insp, caller))) {
      res.status(403).json({ error: "forbidden", message: "Access denied." });
      return;
    }

    await db.update(inspectionsTable)
      .set({ shareToken: null, shareTokenExpiry: null, updatedAt: new Date() })
      .where(eq(inspectionsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Revoke share token error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/inspections/:id/sign-off", requireAuth, async (req, res) => {
  try {
    const inspId = parseInt(req.params.id);
    if (isNaN(inspId)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;

    const [insp] = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      inspectorId: inspectionsTable.inspectorId,
    }).from(inspectionsTable).where(eq(inspectionsTable.id, inspId));
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    if (!(await canAccessInspection(insp, caller))) {
      res.status(403).json({ error: "forbidden", message: "Access denied." });
      return;
    }

    // Block sign-off if any issues/defects are still unresolved
    const RESOLVED_STATUSES = ["closed", "resolved", "rejected"];
    const openIssues = await db.select({ id: issuesTable.id })
      .from(issuesTable)
      .where(
        and(
          eq(issuesTable.inspectionId, inspId),
          notInArray(issuesTable.status, RESOLVED_STATUSES)
        )
      );
    if (openIssues.length > 0) {
      res.status(422).json({
        error: "unresolved_issues",
        message: `${openIssues.length} issue${openIssues.length !== 1 ? "s" : ""} must be resolved before signing off.`,
        count: openIssues.length,
      });
      return;
    }

    const [updated] = await db.update(inspectionsTable)
      .set({
        status: "completed",
        completedDate: new Date().toISOString().slice(0, 10),
        signedOffAt: new Date(),
        signedOffById: caller.id,
        updatedAt: new Date(),
      })
      .where(eq(inspectionsTable.id, inspId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ ok: true, signedOffAt: updated.signedOffAt });
  } catch (err) {
    req.log.error({ err }, "Sign-off error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Get share view data ──────────────────────────────────────────────────────

router.get("/share/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [insp] = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.shareToken, token));

    if (!insp) {
      res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
      return;
    }

    if (isTokenExpired(insp.shareTokenExpiry)) {
      res.status(410).json({ error: "link_expired", message: "This link has expired." });
      return;
    }

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

    // Check if acknowledged
    const acknowledgements = await db.select().from(shareAcknowledgementsTable)
      .where(eq(shareAcknowledgementsTable.inspectionId, insp.id));
    const latestAck = acknowledgements.sort((a, b) =>
      new Date(b.acknowledgedAt).getTime() - new Date(a.acknowledgedAt).getTime()
    )[0] ?? null;

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
        signedOffAt: insp.signedOffAt,
        shareTokenExpiry: insp.shareTokenExpiry,
        passCount,
        failCount,
        naCount,
        totalItems: results.length,
      },
      project: project ? {
        id: project.id,
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
      acknowledgement: latestAck ? {
        clientName: latestAck.clientName,
        clientEmail: latestAck.clientEmail,
        signatureText: latestAck.signatureText,
        acknowledgedAt: latestAck.acknowledgedAt,
      } : null,
    });
  } catch (err) {
    req.log.error({ err }, "Share view error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Client Acknowledgement ───────────────────────────────────────────────────

router.post("/share/:token/acknowledge", async (req, res) => {
  try {
    const { token } = req.params;
    const { clientName, clientEmail, signatureText } = req.body;

    if (!clientName || !clientEmail) {
      res.status(400).json({ error: "bad_request", message: "clientName and clientEmail are required" });
      return;
    }
    if (!signatureText || !signatureText.trim()) {
      res.status(400).json({ error: "bad_request", message: "A typed signature is required to acknowledge" });
      return;
    }

    const [insp] = await db.select({
      id: inspectionsTable.id,
      shareToken: inspectionsTable.shareToken,
      shareTokenExpiry: inspectionsTable.shareTokenExpiry,
    }).from(inspectionsTable)
      .where(eq(inspectionsTable.shareToken, token));

    if (!insp) {
      res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
      return;
    }

    if (isTokenExpired(insp.shareTokenExpiry)) {
      res.status(410).json({ error: "link_expired", message: "This link has expired." });
      return;
    }

    const [ack] = await db.insert(shareAcknowledgementsTable).values({
      inspectionId: insp.id,
      shareToken: token,
      clientName,
      clientEmail,
      signatureText: signatureText.trim(),
      acknowledgedAt: new Date(),
    }).returning();

    // Activity log
    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: insp.id,
      action: "client_acknowledged",
      description: `Client "${clientName}" (${clientEmail}) acknowledged and signed the inspection report`,
      userId: SYSTEM_USER_ID,
    });

    res.json({
      ok: true,
      acknowledgedAt: ack.acknowledgedAt,
      clientName: ack.clientName,
      clientEmail: ack.clientEmail,
      signatureText: ack.signatureText,
    });
  } catch (err) {
    req.log.error({ err }, "Acknowledge error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── PDF Download via share token (public, no auth needed) ───────────────────

router.get("/share/:token/pdf", async (req, res) => {
  try {
    const { token } = req.params;
    const [insp] = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.shareToken, token));

    if (!insp) {
      res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
      return;
    }

    if (isTokenExpired(insp.shareTokenExpiry)) {
      res.status(410).json({ error: "link_expired", message: "This link has expired." });
      return;
    }

    // Fetch latest acknowledgement to embed in the report
    const acks = await db.select().from(shareAcknowledgementsTable)
      .where(eq(shareAcknowledgementsTable.inspectionId, insp.id));
    const latestAck = acks.sort((a, b) =>
      new Date(b.acknowledgedAt).getTime() - new Date(a.acknowledgedAt).getTime()
    )[0] ?? null;

    const ackBlock = latestAck
      ? `
────────────────────────────────────────────────────────
CLIENT ACKNOWLEDGEMENT
────────────────────────────────────────────────────────
Acknowledged By:      ${latestAck.clientName}
Email:                ${latestAck.clientEmail}
Signature:            ${latestAck.signatureText || "—"}
Acknowledged At:      ${new Date(latestAck.acknowledgedAt).toLocaleString("en-AU")}
`
      : "";

    // Find or generate a report for this inspection, then redirect to PDF download
    const existing = await db.select().from(reportsTable)
      .where(eq(reportsTable.inspectionId, insp.id));

    let reportId: number;
    if (existing.length > 0 && !latestAck) {
      // Use existing report if no new acknowledgement to embed
      reportId = existing[0].id;
    } else {
      // Generate/regenerate a summary report with acknowledgement info embedded
      const checklistRows = await db.select({ result: checklistResultsTable, item: checklistItemsTable })
        .from(checklistResultsTable)
        .innerJoin(checklistItemsTable, eq(checklistResultsTable.checklistItemId, checklistItemsTable.id))
        .where(eq(checklistResultsTable.inspectionId, insp.id));

      const checklistResults = checklistRows.map(r => ({
        result: r.result.result, notes: r.result.notes, severity: r.result.severity,
        location: r.result.location, tradeAllocated: r.result.tradeAllocated,
        recommendedAction: r.result.recommendedAction, photoCount: 0,
        category: r.item.category, description: r.item.description,
        codeReference: r.item.codeReference, riskLevel: r.item.riskLevel,
      }));

      const passItems = checklistResults.filter(r => r.result === "pass");
      const failItems = checklistResults.filter(r => r.result === "fail");
      const naItems = checklistResults.filter(r => r.result === "na");
      const total = checklistResults.length;

      const [project] = insp.projectId
        ? await db.select().from(projectsTable).where(eq(projectsTable.id, insp.projectId))
        : [null];

      let inspectorName = "—";
      if (insp.inspectorId) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, insp.inspectorId));
        if (u) inspectorName = `${u.firstName} ${u.lastName}`;
      }

      const inspType = (insp.inspectionType || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const title = `Inspection Summary — ${inspType}${project ? ` — ${project.name}` : ""}`;
      const siteAddress = project
        ? [project.siteAddress, project.suburb, project.state].filter(Boolean).join(", ")
        : "—";

      const content = `INSPECTION SUMMARY
==================

Project Name:         ${project?.name || "—"}
Site Address:         ${siteAddress}
Inspection Type:      ${inspType}
Inspector Name:       ${inspectorName}
Inspection Date:      ${insp.scheduledDate || "—"}
Status:               ${insp.status || "—"}

────────────────────────────────────────────────────────
CHECKLIST RESULTS
────────────────────────────────────────────────────────
Total Items:          ${total}
Pass:                 ${passItems.length}
Fail:                 ${failItems.length}
N/A:                  ${naItems.length}

${insp.notes ? `────────────────────────────────────────────────────────\nINSPECTOR NOTES\n────────────────────────────────────────────────────────\n${insp.notes}\n` : ""}${ackBlock}
This report was generated by InspectProof.
`;

      // Upsert: update existing or insert new
      let upsertId: number;
      if (existing.length > 0) {
        const [upd] = await db.update(reportsTable)
          .set({ content, updatedAt: new Date() })
          .where(eq(reportsTable.id, existing[0].id))
          .returning();
        upsertId = upd.id;
      } else {
        const [inserted] = await db.insert(reportsTable).values({
          projectId: project?.id ?? null,
          inspectionId: insp.id,
          title,
          reportType: "summary",
          status: "draft",
          content,
          generatedById: SYSTEM_USER_ID,
        }).returning();
        upsertId = inserted.id;
      }
      reportId = upsertId;
    }

    // Redirect to the existing PDF download endpoint
    res.redirect(`/api/reports/${reportId}/pdf`);
  } catch (err) {
    req.log.error({ err }, "Share PDF error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Contractor Share Tokens ──────────────────────────────────────────────────

router.post("/inspections/:id/contractor-share", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;
    const { contractorName, contractorEmail, expiryDays } = req.body;

    if (!contractorName) {
      res.status(400).json({ error: "bad_request", message: "contractorName is required" });
      return;
    }

    const [insp] = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      inspectorId: inspectionsTable.inspectorId,
    }).from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    if (!(await canAccessInspection(insp, caller))) {
      res.status(403).json({ error: "forbidden", message: "Access denied." });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    let expiresAt: Date | null = null;
    if (expiryDays && !isNaN(parseInt(expiryDays))) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays));
    }

    const [cst] = await db.insert(contractorShareTokensTable).values({
      token,
      projectId: insp.projectId!,
      inspectionId: id,
      contractorName,
      contractorEmail: contractorEmail || null,
      expiresAt,
      createdById: caller.id,
    }).returning();

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: id,
      action: "contractor_share_created",
      description: `Contractor share link created for "${contractorName}"${contractorEmail ? ` (${contractorEmail})` : ""}`,
      userId: caller.id,
    });

    res.json({
      id: cst.id,
      token: cst.token,
      contractorName: cst.contractorName,
      contractorEmail: cst.contractorEmail,
      expiresAt: cst.expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create contractor share token error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/inspections/:id/contractor-shares", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;

    const [insp] = await db.select({
      id: inspectionsTable.id,
      projectId: inspectionsTable.projectId,
      inspectorId: inspectionsTable.inspectorId,
    }).from(inspectionsTable).where(eq(inspectionsTable.id, id));
    if (!insp) { res.status(404).json({ error: "not_found" }); return; }

    if (!(await canAccessInspection(insp, caller))) {
      res.status(403).json({ error: "forbidden", message: "Access denied." });
      return;
    }

    const tokens = await db.select().from(contractorShareTokensTable)
      .where(eq(contractorShareTokensTable.inspectionId, id));

    res.json(tokens.map(t => ({
      id: t.id,
      token: t.token,
      contractorName: t.contractorName,
      contractorEmail: t.contractorEmail,
      expiresAt: t.expiresAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
      isExpired: isTokenExpired(t.expiresAt),
      isRevoked: !!t.revokedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List contractor share tokens error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/contractor-shares/:tokenId", requireAuth, async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId)) { res.status(400).json({ error: "bad_request" }); return; }

    const caller = req.authUser!;

    const [cst] = await db.select().from(contractorShareTokensTable)
      .where(eq(contractorShareTokensTable.id, tokenId));
    if (!cst) { res.status(404).json({ error: "not_found" }); return; }

    // Verify access via the linked inspection
    if (cst.inspectionId) {
      const [insp] = await db.select({
        id: inspectionsTable.id,
        projectId: inspectionsTable.projectId,
        inspectorId: inspectionsTable.inspectorId,
      }).from(inspectionsTable).where(eq(inspectionsTable.id, cst.inspectionId));
      if (insp && !(await canAccessInspection(insp, caller))) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }

    await db.update(contractorShareTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(contractorShareTokensTable.id, tokenId));

    await db.insert(activityLogsTable).values({
      entityType: "inspection",
      entityId: cst.inspectionId ?? 0,
      action: "contractor_share_revoked",
      description: `Contractor share link for "${cst.contractorName}" revoked`,
      userId: caller.id,
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Revoke contractor share token error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Contractor Portal ────────────────────────────────────────────────────────

router.get("/contractor-share/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [cst] = await db.select().from(contractorShareTokensTable)
      .where(eq(contractorShareTokensTable.token, token));

    if (!cst) {
      res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
      return;
    }

    if (cst.revokedAt) {
      res.status(410).json({ error: "link_revoked", message: "This link has been revoked." });
      return;
    }

    if (isTokenExpired(cst.expiresAt)) {
      res.status(410).json({ error: "link_expired", message: "This link has expired." });
      return;
    }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, cst.projectId));

    // Only return issues assigned to this contractor via responsibleParty
    const allIssues = cst.inspectionId
      ? await db.select().from(issuesTable)
          .where(eq(issuesTable.inspectionId, cst.inspectionId))
      : await db.select().from(issuesTable)
          .where(eq(issuesTable.projectId, cst.projectId));

    const filteredIssues = allIssues.filter(i =>
      i.responsibleParty?.toLowerCase().includes(cst.contractorName.toLowerCase())
    );

    res.json({
      contractor: {
        name: cst.contractorName,
        email: cst.contractorEmail,
      },
      project: project ? {
        name: project.name,
        siteAddress: project.siteAddress,
        suburb: project.suburb,
        state: project.state,
      } : null,
      issues: filteredIssues.map(i => ({
        id: i.id,
        title: i.title,
        description: i.description,
        severity: i.severity,
        status: i.status,
        location: i.location,
        dueDate: i.dueDate,
        responsibleParty: i.responsibleParty,
        closeoutNotes: i.closeoutNotes,
        closeoutPhotos: i.closeoutPhotos,
      })),
      expiresAt: cst.expiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Contractor share view error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/contractor-share/:token/issues/:issueId/complete", async (req, res) => {
  try {
    const { token, issueId } = req.params;
    const { notes, photoUrl } = req.body;

    const [cst] = await db.select().from(contractorShareTokensTable)
      .where(eq(contractorShareTokensTable.token, token));

    if (!cst) {
      res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
      return;
    }

    if (cst.revokedAt) {
      res.status(410).json({ error: "link_revoked", message: "This link has been revoked." });
      return;
    }

    if (isTokenExpired(cst.expiresAt)) {
      res.status(410).json({ error: "link_expired", message: "This link has expired." });
      return;
    }

    const issueIdNum = parseInt(issueId);
    const [issue] = await db.select().from(issuesTable).where(eq(issuesTable.id, issueIdNum));
    if (!issue) { res.status(404).json({ error: "not_found" }); return; }

    // Verify the issue belongs to this contractor's project/inspection AND is assigned to them
    const belongsToProject = issue.projectId === cst.projectId;
    const belongsToInspection = !cst.inspectionId || issue.inspectionId === cst.inspectionId;
    const assignedToContractor = issue.responsibleParty?.toLowerCase().includes(cst.contractorName.toLowerCase());
    if (!belongsToProject || !belongsToInspection || !assignedToContractor) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const existingPhotos: string[] = issue.closeoutPhotos ? JSON.parse(issue.closeoutPhotos) : [];
    if (photoUrl) existingPhotos.push(photoUrl);

    const [updated] = await db.update(issuesTable)
      .set({
        status: "work_completed",
        closeoutNotes: notes || issue.closeoutNotes,
        closeoutPhotos: JSON.stringify(existingPhotos),
        updatedAt: new Date(),
      })
      .where(eq(issuesTable.id, issueIdNum))
      .returning();

    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: issueIdNum,
      action: "contractor_completed",
      description: `Contractor "${cst.contractorName}"${cst.contractorEmail ? ` <${cst.contractorEmail}>` : ""} marked issue "${issue.title}" as work completed — awaiting inspection`,
      userId: SYSTEM_USER_ID,
    });

    res.json({
      ok: true,
      status: updated.status,
      closeoutNotes: updated.closeoutNotes,
      closeoutPhotos: updated.closeoutPhotos,
    });
  } catch (err) {
    req.log.error({ err }, "Contractor complete issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Contractor Evidence Upload (public, token-gated) ────────────────────────

router.post(
  "/contractor-share/:token/upload",
  express.raw({ type: "*/*", limit: "20mb" }),
  async (req, res) => {
    try {
      const { token } = req.params;

      const [cst] = await db.select().from(contractorShareTokensTable)
        .where(eq(contractorShareTokensTable.token, token));

      if (!cst) {
        res.status(410).json({ error: "link_inactive", message: "This link is no longer active." });
        return;
      }
      if (cst.revokedAt) {
        res.status(410).json({ error: "link_revoked", message: "This link has been revoked." });
        return;
      }
      if (isTokenExpired(cst.expiresAt)) {
        res.status(410).json({ error: "link_expired", message: "This link has expired." });
        return;
      }

      const buffer = req.body as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({ error: "empty_body" });
        return;
      }

      const declaredCt = (
        (req.headers["x-file-content-type"] as string) ||
        req.headers["content-type"] ||
        "application/octet-stream"
      ).split(";")[0].trim();

      if (!declaredCt.startsWith("image/")) {
        res.status(415).json({ error: "images_only", message: "Only image uploads are accepted." });
        return;
      }

      const storage = new ObjectStorageService();
      const objectPath = await storage.uploadFile(buffer, declaredCt);

      res.json({ objectPath });
    } catch (err) {
      req.log.error({ err }, "Contractor evidence upload error");
      res.status(500).json({ error: "internal_error" });
    }
  }
);

export default router;
