import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, inductionsTable, inductionAttendeesTable, projectsTable, usersTable, documentsTable } from "@workspace/db";
import { requireAuth, type AuthUser } from "../middleware/auth";

const router: IRouter = Router();

// ── Auth helpers (mirror projects.ts pattern) ─────────────────────────────────

function effectiveAdminId(user: AuthUser): number {
  if (user.isAdmin || user.isCompanyAdmin) return user.id;
  return user.adminUserId ? parseInt(user.adminUserId) : user.id;
}

async function canAccessProject(createdById: number, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  const adminId = effectiveAdminId(user);
  if (createdById === user.id || createdById === adminId) return true;
  const [creator] = await db
    .select({ adminUserId: usersTable.adminUserId })
    .from(usersTable)
    .where(eq(usersTable.id, createdById));
  return !!(creator?.adminUserId && parseInt(creator.adminUserId) === adminId);
}

/**
 * Fetch the project and verify the caller has access.
 * Returns the project row or null.
 */
async function getAuthorizedProject(projectId: number, user: AuthUser) {
  const [project] = await db
    .select({ id: projectsTable.id, createdById: projectsTable.createdById })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const ok = await canAccessProject(project.createdById, user);
  return ok ? project : null;
}

/**
 * Fetch the induction, verify it belongs to a project the caller owns.
 * Returns the induction row or null.
 */
async function getAuthorizedInduction(inductionId: number, user: AuthUser) {
  const [induction] = await db
    .select()
    .from(inductionsTable)
    .where(eq(inductionsTable.id, inductionId));
  if (!induction) return null;
  const project = await getAuthorizedProject(induction.projectId, user);
  return project ? induction : null;
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatInduction(ind: typeof inductionsTable.$inferSelect, attendees: ReturnType<typeof formatAttendee>[] = []) {
  return {
    id: ind.id,
    projectId: ind.projectId,
    title: ind.title,
    scheduledDate: ind.scheduledDate,
    scheduledTime: ind.scheduledTime,
    location: ind.location,
    conductedById: ind.conductedById,
    conductedByName: ind.conductedByName,
    status: ind.status,
    notes: ind.notes,
    checklistData: ind.checklistData ?? null,
    completedAt: ind.completedAt instanceof Date ? ind.completedAt.toISOString() : ind.completedAt,
    attendees,
    attendeeCount: attendees.length,
    createdAt: ind.createdAt instanceof Date ? ind.createdAt.toISOString() : ind.createdAt,
    updatedAt: ind.updatedAt instanceof Date ? ind.updatedAt.toISOString() : ind.updatedAt,
  };
}

function formatAttendee(att: typeof inductionAttendeesTable.$inferSelect) {
  return {
    id: att.id,
    inductionId: att.inductionId,
    orgContractorId: att.orgContractorId,
    internalStaffId: att.internalStaffId,
    attendeeType: att.attendeeType,
    contractorName: att.contractorName,
    contractorEmail: att.contractorEmail,
    contractorTrade: att.contractorTrade,
    attended: att.attended,
    signedOff: att.signedOff,
    signatureData: att.signatureData,
    acknowledgedAt: att.acknowledgedAt instanceof Date ? att.acknowledgedAt.toISOString() : att.acknowledgedAt,
    createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : att.createdAt,
  };
}

async function loadInductionWithAttendees(inductionId: number) {
  const [induction] = await db.select().from(inductionsTable).where(eq(inductionsTable.id, inductionId));
  if (!induction) return null;
  const attendees = await db
    .select()
    .from(inductionAttendeesTable)
    .where(eq(inductionAttendeesTable.inductionId, inductionId));
  return formatInduction(induction, attendees.map(formatAttendee));
}

// ── List inductions for a project ────────────────────────────────────────────
router.get("/projects/:projectId/inductions", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "bad_request" }); return; }

  const project = await getAuthorizedProject(projectId, req.authUser!);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }

  try {
    const inductions = await db
      .select()
      .from(inductionsTable)
      .where(eq(inductionsTable.projectId, projectId))
      .orderBy(sql`${inductionsTable.scheduledDate} DESC`);

    if (inductions.length === 0) { res.json([]); return; }

    const inductionIds = inductions.map(i => i.id);
    const attendees = await db
      .select()
      .from(inductionAttendeesTable)
      .where(inArray(inductionAttendeesTable.inductionId, inductionIds));

    const attendeesByInduction: Record<number, ReturnType<typeof formatAttendee>[]> = {};
    for (const att of attendees) {
      if (!attendeesByInduction[att.inductionId]) attendeesByInduction[att.inductionId] = [];
      attendeesByInduction[att.inductionId].push(formatAttendee(att));
    }

    res.json(inductions.map(ind => formatInduction(ind, attendeesByInduction[ind.id] ?? [])));
  } catch (err) {
    req.log.error({ err }, "List inductions error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Create induction ─────────────────────────────────────────────────────────
router.post("/projects/:projectId/inductions", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "bad_request" }); return; }

  const project = await getAuthorizedProject(projectId, req.authUser!);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }

  const { title, scheduledDate, scheduledTime, location, conductedById, conductedByName, attendees } = req.body as {
    title?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    location?: string;
    conductedById?: number;
    conductedByName?: string;
    attendees?: Array<{
      orgContractorId?: number;
      internalStaffId?: number;
      attendeeType?: string;
      contractorName: string;
      contractorEmail?: string;
      contractorTrade?: string;
    }>;
  };

  if (!scheduledDate?.trim()) {
    res.status(400).json({ error: "bad_request", message: "scheduledDate is required" });
    return;
  }

  try {
    const [induction] = await db.insert(inductionsTable).values({
      projectId,
      title: title?.trim() || "Site Induction",
      scheduledDate: scheduledDate.trim(),
      scheduledTime: scheduledTime?.trim() || null,
      location: location?.trim() || null,
      conductedById: conductedById ?? null,
      conductedByName: conductedByName?.trim() || null,
      status: "scheduled",
    }).returning();

    const insertedAttendees: ReturnType<typeof formatAttendee>[] = [];
    if (Array.isArray(attendees) && attendees.length > 0) {
      const rows = attendees
        .filter(a => a.contractorName?.trim())
        .map(a => ({
          inductionId: induction.id,
          orgContractorId: a.orgContractorId ?? null,
          internalStaffId: a.internalStaffId ?? null,
          attendeeType: a.attendeeType === "staff" ? "staff" : "contractor",
          contractorName: a.contractorName.trim(),
          contractorEmail: a.contractorEmail?.trim() || null,
          contractorTrade: a.contractorTrade?.trim() || null,
          attended: false,
          signedOff: false,
        }));
      if (rows.length > 0) {
        const created = await db.insert(inductionAttendeesTable).values(rows).returning();
        insertedAttendees.push(...created.map(formatAttendee));
      }
    }

    res.status(201).json(formatInduction(induction, insertedAttendees));
  } catch (err) {
    req.log.error({ err }, "Create induction error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Get single induction ──────────────────────────────────────────────────────
router.get("/inductions/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

  try {
    const induction = await getAuthorizedInduction(id, req.authUser!);
    if (!induction) { res.status(404).json({ error: "not_found" }); return; }

    const result = await loadInductionWithAttendees(id);
    if (!result) { res.status(404).json({ error: "not_found" }); return; }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Get induction error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Update induction (status, notes, checklist data, etc.) ───────────────────
router.patch("/inductions/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

  try {
    const existing = await getAuthorizedInduction(id, req.authUser!);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }

    const { title, scheduledDate, scheduledTime, location, conductedById, conductedByName, status, notes, checklistData } = req.body as {
      title?: string; scheduledDate?: string; scheduledTime?: string; location?: string;
      conductedById?: number | null; conductedByName?: string; status?: string; notes?: string;
      checklistData?: Record<string, unknown> | null;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (scheduledDate !== undefined) updates.scheduledDate = scheduledDate;
    if (scheduledTime !== undefined) updates.scheduledTime = scheduledTime?.trim() || null;
    if (location !== undefined) updates.location = location?.trim() || null;
    if (conductedById !== undefined) updates.conductedById = conductedById;
    if (conductedByName !== undefined) updates.conductedByName = conductedByName?.trim() || null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (checklistData !== undefined) updates.checklistData = checklistData;
    if (status !== undefined) {
      const validStatuses = ["scheduled", "in_progress", "completed", "cancelled"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "bad_request", message: "Invalid status" });
        return;
      }
      updates.status = status;
      if (status === "completed") updates.completedAt = new Date();
    }

    const [updated] = await db.update(inductionsTable).set(updates).where(eq(inductionsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }

    const result = await loadInductionWithAttendees(id);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Update induction error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Delete induction ──────────────────────────────────────────────────────────
router.delete("/inductions/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "bad_request" }); return; }

  try {
    const existing = await getAuthorizedInduction(id, req.authUser!);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }

    await db.delete(inductionAttendeesTable).where(eq(inductionAttendeesTable.inductionId, id));
    await db.delete(inductionsTable).where(eq(inductionsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete induction error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Add attendee ──────────────────────────────────────────────────────────────
router.post("/inductions/:id/attendees", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  if (isNaN(inductionId)) { res.status(400).json({ error: "bad_request" }); return; }

  const existing = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }

  const { orgContractorId, internalStaffId, attendeeType, contractorName, contractorEmail, contractorTrade } = req.body as {
    orgContractorId?: number;
    internalStaffId?: number;
    attendeeType?: string;
    contractorName?: string;
    contractorEmail?: string;
    contractorTrade?: string;
  };
  if (!contractorName?.trim()) {
    res.status(400).json({ error: "bad_request", message: "contractorName is required" });
    return;
  }
  try {
    const [att] = await db.insert(inductionAttendeesTable).values({
      inductionId,
      orgContractorId: orgContractorId ?? null,
      internalStaffId: internalStaffId ?? null,
      attendeeType: attendeeType === "staff" ? "staff" : "contractor",
      contractorName: contractorName.trim(),
      contractorEmail: contractorEmail?.trim() || null,
      contractorTrade: contractorTrade?.trim() || null,
      attended: false,
      signedOff: false,
    }).returning();
    res.status(201).json(formatAttendee(att));
  } catch (err) {
    req.log.error({ err }, "Add attendee error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Remove attendee ───────────────────────────────────────────────────────────
router.delete("/inductions/:id/attendees/:attendeeId", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  const attendeeId = parseInt(req.params.attendeeId, 10);
  if (isNaN(inductionId) || isNaN(attendeeId)) { res.status(400).json({ error: "bad_request" }); return; }

  const existing = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }

  try {
    await db.delete(inductionAttendeesTable).where(
      and(
        eq(inductionAttendeesTable.id, attendeeId),
        eq(inductionAttendeesTable.inductionId, inductionId)
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Remove attendee error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Patch attendee sign-off ───────────────────────────────────────────────────
router.patch("/inductions/:id/attendees/:attendeeId", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  const attendeeId = parseInt(req.params.attendeeId, 10);
  if (isNaN(inductionId) || isNaN(attendeeId)) { res.status(400).json({ error: "bad_request" }); return; }

  const existing = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!existing) { res.status(404).json({ error: "not_found" }); return; }

  const { attended, signedOff, signatureData } = req.body as {
    attended?: boolean; signedOff?: boolean; signatureData?: string;
  };
  try {
    const updates: Record<string, unknown> = {};
    if (attended !== undefined) updates.attended = attended;
    if (signedOff !== undefined) {
      updates.signedOff = signedOff;
      if (signedOff) updates.acknowledgedAt = new Date();
    }
    if (signatureData !== undefined) updates.signatureData = signatureData;

    const [updated] = await db
      .update(inductionAttendeesTable)
      .set(updates)
      .where(
        and(
          eq(inductionAttendeesTable.id, attendeeId),
          eq(inductionAttendeesTable.inductionId, inductionId)
        )
      )
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    res.json(formatAttendee(updated));
  } catch (err) {
    req.log.error({ err }, "Update attendee error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Induction Attachments (documents linked to an induction) ─────────────────

router.get("/inductions/:id/attachments", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  if (isNaN(inductionId)) { res.status(400).json({ error: "bad_request" }); return; }

  const induction = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!induction) { res.status(404).json({ error: "not_found" }); return; }

  try {
    const docs = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.inductionId, inductionId))
      .orderBy(sql`${documentsTable.createdAt} DESC`);
    res.json(docs.map(d => ({
      id: d.id,
      name: d.name,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "List induction attachments error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/inductions/:id/attachments", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  if (isNaN(inductionId)) { res.status(400).json({ error: "bad_request" }); return; }

  const induction = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!induction) { res.status(404).json({ error: "not_found" }); return; }

  const { name, fileName, fileUrl, fileSize, mimeType } = req.body as {
    name?: string; fileName?: string; fileUrl?: string; fileSize?: number; mimeType?: string;
  };
  if (!fileName?.trim()) {
    res.status(400).json({ error: "bad_request", message: "fileName is required" });
    return;
  }
  try {
    const [doc] = await db.insert(documentsTable).values({
      projectId: induction.projectId,
      inductionId,
      name: name?.trim() || fileName!.trim(),
      category: "induction",
      fileName: fileName!.trim(),
      fileUrl: fileUrl?.trim() || null,
      fileSize: fileSize ?? null,
      mimeType: mimeType?.trim() || null,
      uploadedById: req.authUser!.id,
      folder: "Inductions",
    }).returning();
    res.status(201).json({
      id: doc.id,
      name: doc.name,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create induction attachment error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/inductions/:id/attachments/:docId", requireAuth, async (req, res) => {
  const inductionId = parseInt(req.params.id, 10);
  const docId = parseInt(req.params.docId, 10);
  if (isNaN(inductionId) || isNaN(docId)) { res.status(400).json({ error: "bad_request" }); return; }

  const induction = await getAuthorizedInduction(inductionId, req.authUser!);
  if (!induction) { res.status(404).json({ error: "not_found" }); return; }

  try {
    await db.delete(documentsTable).where(
      and(eq(documentsTable.id, docId), eq(documentsTable.inductionId, inductionId))
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete induction attachment error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Contractor induction status for a project ─────────────────────────────────
// Returns { [orgContractorId]: true } for all contractors who completed any induction on the project
router.get("/projects/:projectId/inductions/contractor-status", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) { res.status(400).json({ error: "bad_request" }); return; }

  const project = await getAuthorizedProject(projectId, req.authUser!);
  if (!project) { res.status(404).json({ error: "not_found" }); return; }

  try {
    const completedInductions = await db
      .select({ id: inductionsTable.id })
      .from(inductionsTable)
      .where(and(eq(inductionsTable.projectId, projectId), eq(inductionsTable.status, "completed")));

    const completedIds = completedInductions.map(i => i.id);
    if (completedIds.length === 0) { res.json({}); return; }

    const signedOffAttendees = await db
      .select({ orgContractorId: inductionAttendeesTable.orgContractorId })
      .from(inductionAttendeesTable)
      .where(
        and(
          inArray(inductionAttendeesTable.inductionId, completedIds),
          eq(inductionAttendeesTable.signedOff, true),
          sql`${inductionAttendeesTable.orgContractorId} IS NOT NULL`
        )
      );

    const inductedContractorIds: Record<number, boolean> = {};
    for (const row of signedOffAttendees) {
      if (row.orgContractorId !== null) {
        inductedContractorIds[row.orgContractorId] = true;
      }
    }
    res.json(inductedContractorIds);
  } catch (err) {
    req.log.error({ err }, "Contractor induction status error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
