import { Router, type IRouter } from "express";
import { eq, ilike, or, sql, and, inArray } from "drizzle-orm";
import { db, projectsTable, inspectionsTable, issuesTable, documentsTable, activityLogsTable, usersTable, projectInspectionTypesTable, checklistTemplatesTable, checklistItemsTable, documentChecklistLinksTable, checklistResultsTable, notesTable, reportsTable, projectContractorsTable, internalStaffTable, orgContractorsTable, orgContractorProjectAssignmentsTable, inductionsTable, inductionAttendeesTable, userOrganisationsTable } from "@workspace/db";
import { sendContractorDefectReportEmail } from "../lib/email";
import { checkProjectQuota, getOrgMemberIds } from "../lib/quota";
import { optionalAuth, requireAuth, type AuthUser } from "../middleware/auth";
import { decodeSessionToken } from "../lib/session-token";

const router: IRouter = Router();

/** Returns the "root org admin" ID for the requesting user. */
function effectiveAdminId(user: AuthUser): number {
  if (user.isAdmin || user.isCompanyAdmin) return user.id;
  return user.adminUserId ? parseInt(user.adminUserId) : user.id;
}

/**
 * Returns true if the requesting user may access a resource created by createdById.
 * Platform admins bypass all checks. Company/team members are scoped to their org.
 */
async function canAccessProject(createdById: number | null, user: AuthUser): Promise<boolean> {
  if (user.isAdmin) return true;
  if (createdById == null) return false;
  const adminId = effectiveAdminId(user);
  if (createdById === user.id || createdById === adminId) return true;
  // Check cross-member: was the resource created by a colleague (same org)?
  const [creator] = await db
    .select({ adminUserId: usersTable.adminUserId })
    .from(usersTable)
    .where(eq(usersTable.id, createdById));
  return !!(creator?.adminUserId && parseInt(creator.adminUserId) === adminId);
}

function getUserIdFromRequest(req: any): number | null {
  const auth = req.headers?.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { userId, valid } = decodeSessionToken(auth.slice(7));
  return valid ? userId : null;
}

const TEST_PROJECT_NAME = "Test Project";

function formatProject(p: any, totalInspections = 0, openIssues = 0) {
  return {
    id: p.id,
    referenceNumber: p.referenceNumber,
    name: p.name,
    siteAddress: p.siteAddress,
    suburb: p.suburb,
    state: p.state,
    postcode: p.postcode,
    clientName: p.clientName,
    ownerName: p.ownerName,
    builderName: p.builderName,
    designerName: p.designerName,
    daNumber: p.daNumber,
    certificationNumber: p.certificationNumber,
    buildingClassification: p.buildingClassification,
    projectType: p.projectType,
    status: p.status,
    stage: p.stage,
    notes: p.notes,
    assignedCertifierId: p.assignedCertifierId,
    assignedInspectorId: p.assignedInspectorId,
    startDate: p.startDate,
    expectedCompletionDate: p.expectedCompletionDate,
    completedDate: p.completedDate,
    totalInspections,
    openIssues,
    orgId: p.orgAdminId ?? null,
    orgAdminId: p.orgAdminId ?? null,
    orgName: p.orgName ?? null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

/**
 * Returns the set of org admin IDs this user may access data for.
 * - Primary org (derived from adminUserId) is included unless suspended/revoked in user_organisations.
 * - Additional cross-org memberships are included only when status = "active".
 */
async function getAccessibleOrgAdminIds(user: AuthUser): Promise<Set<number>> {
  const primaryAdminId = user.isCompanyAdmin ? user.id : (user.adminUserId ? parseInt(user.adminUserId) : user.id);

  const allMemberships = await db
    .select({ orgAdminId: userOrganisationsTable.orgAdminId, status: userOrganisationsTable.status })
    .from(userOrganisationsTable)
    .where(eq(userOrganisationsTable.userId, user.id));

  const blockedOrgAdminIds = new Set(
    allMemberships.filter(m => m.status !== "active").map(m => m.orgAdminId),
  );
  const activeExtraOrgAdminIds = allMemberships
    .filter(m => m.status === "active")
    .map(m => m.orgAdminId);

  const accessible = new Set<number>(activeExtraOrgAdminIds);
  if (!blockedOrgAdminIds.has(primaryAdminId)) {
    accessible.add(primaryAdminId);
  }
  return accessible;
}

/** Build the full set of user IDs visible to a user across all their orgs */
async function getMultiOrgMemberIds(user: AuthUser): Promise<number[]> {
  if (user.isAdmin) return []; // admin handles differently
  const accessibleOrgAdminIds = await getAccessibleOrgAdminIds(user);
  const memberIds: number[] = [];
  for (const adminId of accessibleOrgAdminIds) {
    const ids = await getOrgMemberIds(adminId);
    memberIds.push(...ids);
  }
  memberIds.push(user.id);
  return [...new Set(memberIds)];
}

async function generateReferenceNumber(orgAdminId: number): Promise<string> {
  // Count existing projects within this org to find starting sequence point
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectsTable)
    .where(eq(projectsTable.orgAdminId, orgAdminId));

  // Try sequential numbers starting from count+1, checking uniqueness within this org
  let attempt = count + 1;
  while (attempt < count + 100) {
    const candidate = `PRJ-${attempt.toString().padStart(4, "0")}`;
    const [existing] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(
        eq(projectsTable.referenceNumber, candidate),
        eq(projectsTable.orgAdminId, orgAdminId),
      ));
    if (!existing) return candidate;
    attempt++;
  }
  // Fallback: use timestamp-based suffix to guarantee uniqueness
  return `PRJ-${Date.now().toString(36).toUpperCase()}`;
}

function formatDoc(d: any) {
  return {
    id: d.id,
    projectId: d.projectId,
    inspectionId: d.inspectionId ?? null,
    name: d.name,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    version: d.version,
    tags: d.tags || [],
    folder: d.folder || "General",
    fileUrl: d.fileUrl,
    includedInInspection: d.includedInInspection ?? true,
    uploadedById: d.uploadedById,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
  };
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { status, search, orgId } = req.query;
    let projects = await db.select().from(projectsTable).orderBy(sql`${projectsTable.updatedAt} DESC`);

    if (req.authUser) {
      if (req.authUser.isAdmin) {
        // Platform admin: full visibility — no filtering
        // orgId filter still applies for scoping view
        if (orgId) {
          const filterOrgAdminId = parseInt(orgId as string);
          if (!isNaN(filterOrgAdminId)) {
            projects = projects.filter(p => p.orgAdminId === filterOrgAdminId);
          }
        }
      } else {
        // Build the set of org admin IDs this user can access (respects suspend/revoke)
        const accessibleOrgAdminIds = await getAccessibleOrgAdminIds(req.authUser);

        // Filter projects by their owning org (orgAdminId), not by createdById
        projects = projects.filter(p => p.orgAdminId != null && accessibleOrgAdminIds.has(p.orgAdminId));

        // Optional orgId filter: narrow to a single org the user is authorised for
        if (orgId) {
          const filterOrgAdminId = parseInt(orgId as string);
          if (!isNaN(filterOrgAdminId) && accessibleOrgAdminIds.has(filterOrgAdminId)) {
            projects = projects.filter(p => p.orgAdminId === filterOrgAdminId);
          } else if (!isNaN(filterOrgAdminId)) {
            // Requested org not accessible — return nothing
            projects = [];
          }
        }
      }
    } else {
      // Unauthenticated — return nothing
      projects = [];
    }

    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    if (search) {
      const s = (search as string).toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.siteAddress.toLowerCase().includes(s) ||
        p.clientName.toLowerCase().includes(s) ||
        p.suburb.toLowerCase().includes(s)
      );
    }

    // Resolve orgName for each project from its orgAdminId
    const orgAdminIdSet = new Set(projects.map(p => p.orgAdminId).filter((id): id is number => id != null));
    const orgAdminMap: Record<number, string> = {};
    if (orgAdminIdSet.size > 0) {
      const orgAdmins = await db
        .select({ id: usersTable.id, companyName: usersTable.companyName, firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable)
        .where(inArray(usersTable.id, [...orgAdminIdSet]));
      for (const admin of orgAdmins) {
        orgAdminMap[admin.id] = admin.companyName ?? `${admin.firstName} ${admin.lastName}`.trim();
      }
    }

    const result = await Promise.all(projects.map(async (p) => {
      const [inspCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(inspectionsTable).where(eq(inspectionsTable.projectId, p.id));
      const [issueCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(issuesTable).where(sql`${issuesTable.projectId} = ${p.id} AND ${issuesTable.status} NOT IN ('closed', 'resolved')`);
      const projectWithOrg = { ...p, orgName: p.orgAdminId ? orgAdminMap[p.orgAdminId] ?? null : null };
      return formatProject(projectWithOrg, inspCount.count, issueCount.count);
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List projects error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, checkProjectQuota, async (req, res) => {
  try {
    const data = req.body;
    const createdById = req.authUser!.id;
    const adminId = effectiveAdminId(req.authUser!);
    const referenceNumber = data.referenceNumber?.trim() || await generateReferenceNumber(adminId);
    const [project] = await db.insert(projectsTable).values({
      referenceNumber,
      orgAdminId: adminId,
      name: data.name,
      siteAddress: data.siteAddress,
      suburb: data.suburb,
      state: data.state,
      postcode: data.postcode,
      clientName: data.clientName,
      ownerName: data.ownerName || null,
      builderName: data.builderName,
      designerName: data.designerName,
      daNumber: data.daNumber,
      certificationNumber: data.certificationNumber,
      buildingClassification: data.buildingClassification,
      projectType: data.projectType || "residential",
      status: "active",
      stage: "pre_construction",
      notes: data.notes || null,
      assignedCertifierId: data.assignedCertifierId,
      assignedInspectorId: data.assignedInspectorId,
      createdById,
      startDate: data.startDate,
      expectedCompletionDate: data.expectedCompletionDate,
    }).returning();

    await db.insert(activityLogsTable).values({
      entityType: "project",
      entityId: project.id,
      action: "created",
      description: `Project "${project.name}" created`,
      userId: createdById,
    });

    res.status(201).json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Create project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    const project = projects[0];
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const inspections = await db.select().from(inspectionsTable)
      .where(eq(inspectionsTable.projectId, id))
      .orderBy(sql`${inspectionsTable.scheduledDate} DESC`);

    const issues = await db.select().from(issuesTable)
      .where(eq(issuesTable.projectId, id))
      .orderBy(sql`${issuesTable.createdAt} DESC`);

    const documents = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.createdAt} DESC`);

    const openIssues = issues.filter(i => !['closed', 'resolved'].includes(i.status)).length;

    const formatInspection = (i: any) => ({
      id: i.id,
      projectId: i.projectId,
      projectName: project.name,
      inspectionType: i.inspectionType,
      status: i.status,
      scheduledDate: i.scheduledDate,
      scheduledTime: i.scheduledTime,
      completedDate: i.completedDate,
      inspectorId: i.inspectorId,
      inspectorName: null,
      duration: i.duration,
      notes: i.notes,
      weatherConditions: i.weatherConditions,
      checklistTemplateId: i.checklistTemplateId,
      passCount: 0, failCount: 0, naCount: 0,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    });

    const formatIssue = (i: any) => ({
      id: i.id,
      projectId: i.projectId,
      inspectionId: i.inspectionId,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      location: i.location,
      codeReference: i.codeReference,
      responsibleParty: i.responsibleParty,
      dueDate: i.dueDate,
      resolvedDate: i.resolvedDate,
      assignedToId: i.assignedToId,
      projectName: project.name,
      createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
      updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
    });

    res.json({
      ...formatProject(project, inspections.length, openIssues),
      inspections: inspections.map(formatInspection),
      recentIssues: issues.slice(0, 5).map(formatIssue),
      documents: documents.map(formatDoc),
    });
  } catch (err) {
    req.log.error({ err }, "Get project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessProject(existing.createdById, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    const [project] = await db.update(projectsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();

    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db.insert(activityLogsTable).values({
      entityType: "project",
      entityId: project.id,
      action: "updated",
      description: `Project "${project.name}" updated`,
      userId: req.authUser!.id,
    });

    res.json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Update project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessProject(existing.createdById, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }
    const allowed = ["status", "name", "siteAddress", "suburb", "state", "postcode", "clientName", "ownerName",
      "builderName", "designerName", "stage", "projectType", "daNumber", "certificationNumber",
      "buildingClassification", "startDate", "expectedCompletionDate", "notes", "referenceNumber",
      "assignedCertifierId", "assignedInspectorId"];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in req.body) data[key] = req.body[key];
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    const [project] = await db.update(projectsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectsTable.id, id))
      .returning();
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(formatProject(project, 0, 0));
  } catch (err) {
    req.log.error({ err }, "Patch project error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Archive (PATCH status → 'archived'): soft, reversible — child records kept intact.
// Delete (DELETE /:id): permanent. Primary mechanism is DB-level FK CASCADE (migrate.sql).
// If the direct delete fails with a FK violation (pre-migration DB without CASCADE
// constraints), falls back to manual child cleanup then retries.
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }

    try {
      // On a migrated DB with FK CASCADE constraints this cascades automatically.
      await db.delete(projectsTable).where(eq(projectsTable.id, id));
    } catch (deleteErr: unknown) {
      // FK violation (23503) means the DB lacks CASCADE constraints; clean up manually.
      const pgCode = (deleteErr as { code?: string })?.code;
      if (pgCode !== "23503") throw deleteErr;

      req.log.warn({ id }, "Project delete FK violation – manual child cleanup (pre-migration DB)");

      const inspections = await db.select({ id: inspectionsTable.id })
        .from(inspectionsTable).where(eq(inspectionsTable.projectId, id));
      const inspectionIds = inspections.map(i => i.id);

      if (inspectionIds.length > 0) {
        await db.delete(checklistResultsTable).where(inArray(checklistResultsTable.inspectionId, inspectionIds));
        await db.delete(notesTable).where(inArray(notesTable.inspectionId, inspectionIds));
        await db.delete(reportsTable).where(inArray(reportsTable.inspectionId, inspectionIds));
        await db.delete(issuesTable).where(inArray(issuesTable.inspectionId, inspectionIds));
      }

      await db.delete(inspectionsTable).where(eq(inspectionsTable.projectId, id));
      await db.delete(documentChecklistLinksTable).where(eq(documentChecklistLinksTable.projectId, id));
      await db.delete(documentsTable).where(eq(documentsTable.projectId, id));
      await db.delete(issuesTable).where(eq(issuesTable.projectId, id));
      await db.delete(projectInspectionTypesTable).where(eq(projectInspectionTypesTable.projectId, id));
      await db.delete(activityLogsTable).where(sql`${activityLogsTable.entityType} = 'project' AND ${activityLogsTable.entityId} = ${id}`);

      await db.delete(projectsTable).where(eq(projectsTable.id, id));
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete project error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id/activity", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) { res.status(404).json({ error: "not_found" }); return; }
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      res.status(403).json({ error: "forbidden" }); return;
    }

    // Gather all entity IDs relevant to this project:
    // - The project itself
    // - All inspections belonging to this project
    // - All issues belonging to this project
    const [projectInspections, projectIssues] = await Promise.all([
      db.select({ id: inspectionsTable.id }).from(inspectionsTable).where(eq(inspectionsTable.projectId, id)),
      db.select({ id: issuesTable.id }).from(issuesTable).where(eq(issuesTable.projectId, id)),
    ]);

    const inspectionIds = projectInspections.map(i => i.id);
    const issueIds = projectIssues.map(i => i.id);

    // Build a WHERE clause that includes all relevant activity logs
    const conditions = [
      sql`(${activityLogsTable.entityType} = 'project' AND ${activityLogsTable.entityId} = ${id})`,
    ];
    if (inspectionIds.length > 0) {
      conditions.push(sql`(${activityLogsTable.entityType} = 'inspection' AND ${activityLogsTable.entityId} IN (${sql.join(inspectionIds.map(iid => sql`${iid}`), sql`, `)}))`);
    }
    if (issueIds.length > 0) {
      conditions.push(sql`(${activityLogsTable.entityType} = 'issue' AND ${activityLogsTable.entityId} IN (${sql.join(issueIds.map(iid => sql`${iid}`), sql`, `)}))`);
    }

    const logs = await db.select().from(activityLogsTable)
      .where(sql`${sql.join(conditions, sql` OR `)}`)
      .orderBy(sql`${activityLogsTable.createdAt} DESC`)
      .limit(50);

    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    res.json(logs.map(l => ({
      id: l.id,
      entityType: l.entityType,
      entityId: l.entityId,
      action: l.action,
      description: l.description,
      userId: l.userId,
      userName: userMap[l.userId] || "Unknown User",
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Get project activity error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Documents ────────────────────────────────────────────────────────────────

router.get("/:id/documents", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
    if (!project) return res.status(404).json({ error: "not_found" });
    if (!await canAccessProject(project.createdById, req.authUser!)) return res.status(403).json({ error: "forbidden" });
    const docs = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.folder} ASC, ${documentsTable.name} ASC`);
    res.json(docs.map(formatDoc));
  } catch (err) {
    req.log.error({ err }, "List documents error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/documents", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, fileName, fileSize, mimeType, fileUrl, folder, includedInInspection, inspectionId } = req.body;
    const [doc] = await db.insert(documentsTable).values({
      projectId: id,
      name: name || fileName,
      category: "other",
      fileName: fileName,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      fileUrl: fileUrl || null,
      folder: folder || "General",
      includedInInspection: includedInInspection ?? true,
      uploadedById: 1,
      ...(inspectionId ? { inspectionId: Number(inspectionId) } : {}),
    }).returning();
    res.status(201).json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "Create document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/documents/:docId", requireAuth, async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const updates: any = { updatedAt: new Date() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.folder !== undefined) updates.folder = req.body.folder;
    if (req.body.includedInInspection !== undefined) updates.includedInInspection = req.body.includedInInspection;

    const [doc] = await db.update(documentsTable)
      .set(updates)
      .where(eq(documentsTable.id, docId))
      .returning();

    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(formatDoc(doc));
  } catch (err) {
    req.log.error({ err }, "Update document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id/documents/:docId", requireAuth, async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    await db.delete(documentsTable).where(eq(documentsTable.id, docId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete document error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/documents/folders", requireAuth, async (req, res) => {
  try {
    const { folderName } = req.body;
    if (!folderName?.trim()) {
      res.status(400).json({ error: "folder_name_required" });
      return;
    }
    res.json({ folderName: folderName.trim() });
  } catch (err) {
    req.log.error({ err }, "Create folder error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/documents/folders/:folderName", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const oldName = decodeURIComponent(req.params.folderName);
    const { newName } = req.body;
    if (!newName?.trim()) {
      res.status(400).json({ error: "new_name_required" });
      return;
    }
    await db.update(documentsTable)
      .set({ folder: newName.trim(), updatedAt: new Date() })
      .where(and(eq(documentsTable.projectId, id), eq(documentsTable.folder, oldName)));
    res.json({ success: true, folderName: newName.trim() });
  } catch (err) {
    req.log.error({ err }, "Rename folder error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Inspection Types ─────────────────────────────────────────────────────────

router.get("/:id/inspection-types", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const disciplineFilter = req.query.discipline as string | undefined;

    const all = await db.select({
      id: checklistTemplatesTable.id,
      name: checklistTemplatesTable.name,
      inspectionType: checklistTemplatesTable.inspectionType,
      folder: checklistTemplatesTable.folder,
      discipline: checklistTemplatesTable.discipline,
      itemCount: sql<number>`cast(count(${checklistItemsTable.id}) as int)`,
    }).from(checklistTemplatesTable)
      .leftJoin(checklistItemsTable, eq(checklistItemsTable.templateId, checklistTemplatesTable.id))
      .where(disciplineFilter ? eq(checklistTemplatesTable.discipline, disciplineFilter) : undefined)
      .groupBy(checklistTemplatesTable.id)
      .orderBy(sql`${checklistTemplatesTable.folder} ASC, ${checklistTemplatesTable.name} ASC`);

    const selected = await db.select().from(projectInspectionTypesTable)
      .where(eq(projectInspectionTypesTable.projectId, id));

    const selectedIds = new Set(selected.filter(s => s.isSelected).map(s => s.templateId));

    res.json(all.map(t => ({
      templateId: t.id,
      name: t.name,
      inspectionType: t.inspectionType,
      folder: t.folder,
      discipline: t.discipline ?? "Building Surveyor",
      itemCount: t.itemCount,
      isSelected: selectedIds.has(t.id),
    })));
  } catch (err) {
    req.log.error({ err }, "Get inspection types error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id/inspection-types", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { selectedTemplateIds } = req.body as { selectedTemplateIds: number[] };

    await db.delete(projectInspectionTypesTable)
      .where(eq(projectInspectionTypesTable.projectId, id));

    if (selectedTemplateIds?.length) {
      await db.insert(projectInspectionTypesTable).values(
        selectedTemplateIds.map((tid, i) => ({
          projectId: id,
          inspectionType: "template",
          isSelected: true,
          templateId: tid,
          sortOrder: i,
        }))
      );
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Update inspection types error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Checklist Items (for linking to documents) ────────────────────────────────

router.get("/:id/checklist-items", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const selected = await db.select().from(projectInspectionTypesTable)
      .where(and(eq(projectInspectionTypesTable.projectId, id), eq(projectInspectionTypesTable.isSelected, true)));

    if (!selected.length) {
      res.json([]);
      return;
    }

    const templateIds = selected.map(s => s.templateId).filter(Boolean) as number[];
    const allItems: any[] = [];

    for (const templateId of templateIds) {
      const template = await db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.id, templateId));
      if (!template[0]) continue;
      const items = await db.select().from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, templateId))
        .orderBy(checklistItemsTable.orderIndex);
      allItems.push({ templateId, templateName: template[0].name, inspectionType: template[0].inspectionType, items });
    }

    res.json(allItems);
  } catch (err) {
    req.log.error({ err }, "List checklist items error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Document ↔ Checklist Item Links ──────────────────────────────────────────

router.get("/:id/documents/:docId/checklist-links", requireAuth, async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const links = await db.select().from(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.documentId, docId));
    res.json(links.map(l => l.checklistItemId));
  } catch (err) {
    req.log.error({ err }, "Get checklist links error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id/documents/:docId/checklist-links", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    const { itemIds } = req.body as { itemIds: number[] };

    await db.delete(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.documentId, docId));

    if (itemIds?.length) {
      await db.insert(documentChecklistLinksTable).values(
        itemIds.map(itemId => ({ documentId: docId, checklistItemId: itemId, projectId: id }))
      );
    }

    res.json({ success: true, linkedCount: itemIds?.length ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Set checklist links error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Documents with linked checklist item ids (enriched list) ─────────────────

router.get("/:id/documents-with-links", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docs = await db.select().from(documentsTable)
      .where(eq(documentsTable.projectId, id))
      .orderBy(sql`${documentsTable.folder} ASC, ${documentsTable.name} ASC`);

    const links = await db.select().from(documentChecklistLinksTable)
      .where(eq(documentChecklistLinksTable.projectId, id));

    const linksByDoc: Record<number, number[]> = {};
    for (const l of links) {
      if (!linksByDoc[l.documentId]) linksByDoc[l.documentId] = [];
      linksByDoc[l.documentId].push(l.checklistItemId);
    }

    res.json(docs.map(d => ({
      ...formatDoc(d),
      linkedItemIds: linksByDoc[d.id] ?? [],
    })));
  } catch (err) {
    req.log.error({ err }, "List docs with links error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Project Contractors ───────────────────────────────────────

router.get("/:id/contractors", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: "bad_request" });
  try {
    const rows = await db.select().from(projectContractorsTable)
      .where(eq(projectContractorsTable.projectId, projectId))
      .orderBy(projectContractorsTable.name);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "List contractors error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/contractors", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  if (isNaN(projectId)) return res.status(400).json({ error: "bad_request" });
  const { name, trade, email, company, contactRole, phone, isPrimary } = req.body as {
    name?: string; trade?: string; email?: string; company?: string;
    contactRole?: string; phone?: string; isPrimary?: boolean;
  };
  if (!name?.trim()) return res.status(400).json({ error: "bad_request", message: "name is required" });

  // Duplicate email check
  if (email?.trim()) {
    const existing = await db.select({ id: projectContractorsTable.id })
      .from(projectContractorsTable)
      .where(and(eq(projectContractorsTable.projectId, projectId), eq(projectContractorsTable.email, email.trim())));
    if (existing.length > 0) {
      return res.status(409).json({ error: "duplicate_email", message: "A contact with this email already exists on this project" });
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      if (isPrimary) {
        await tx.update(projectContractorsTable)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(projectContractorsTable.projectId, projectId));
      }
      const [row] = await tx.insert(projectContractorsTable).values({
        projectId,
        name: name.trim(),
        trade: (trade ?? "").trim(),
        email: email?.trim() || null,
        company: company?.trim() || null,
        contactRole: contactRole?.trim() || null,
        phone: phone?.trim() || null,
        isPrimary: isPrimary ?? false,
      }).returning();
      return row;
    });
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Create contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id/contractors/:contractorId", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const contractorId = parseInt(req.params.contractorId);
  if (isNaN(projectId) || isNaN(contractorId)) return res.status(400).json({ error: "bad_request" });
  const { name, trade, email, company, contactRole, phone, isPrimary } = req.body as {
    name?: string; trade?: string; email?: string; company?: string;
    contactRole?: string; phone?: string; isPrimary?: boolean;
  };
  if (name !== undefined && !name.trim()) return res.status(400).json({ error: "bad_request", message: "name cannot be empty" });

  // Duplicate email check (exclude current contractor)
  if (email?.trim()) {
    const existing = await db.select({ id: projectContractorsTable.id })
      .from(projectContractorsTable)
      .where(and(eq(projectContractorsTable.projectId, projectId), eq(projectContractorsTable.email, email.trim())));
    if (existing.some(r => r.id !== contractorId)) {
      return res.status(409).json({ error: "duplicate_email", message: "A contact with this email already exists on this project" });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (trade !== undefined) updates.trade = trade.trim();
  if (email !== undefined) updates.email = email.trim() || null;
  if (company !== undefined) updates.company = company.trim() || null;
  if (contactRole !== undefined) updates.contactRole = contactRole.trim() || null;
  if (phone !== undefined) updates.phone = phone.trim() || null;
  if (isPrimary !== undefined) updates.isPrimary = isPrimary;
  try {
    const updated = await db.transaction(async (tx) => {
      // If setting as primary, atomically clear existing primary
      if (isPrimary) {
        await tx.update(projectContractorsTable)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(projectContractorsTable.projectId, projectId), sql`${projectContractorsTable.id} != ${contractorId}`));
      }
      const [row] = await tx.update(projectContractorsTable).set(updates)
        .where(and(eq(projectContractorsTable.id, contractorId), eq(projectContractorsTable.projectId, projectId)))
        .returning();
      return row;
    });
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Update contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id/contractors/:contractorId", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const contractorId = parseInt(req.params.contractorId);
  if (isNaN(projectId) || isNaN(contractorId)) return res.status(400).json({ error: "bad_request" });
  try {
    const [deleted] = await db.delete(projectContractorsTable)
      .where(and(eq(projectContractorsTable.id, contractorId), eq(projectContractorsTable.projectId, projectId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "not_found" });
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/contractors/:contractorId/send-defect-report", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const contractorId = parseInt(req.params.contractorId);
  if (isNaN(projectId) || isNaN(contractorId)) return res.status(400).json({ error: "bad_request" });

  const { inspectionId } = req.body as { inspectionId?: number };
  if (!inspectionId) return res.status(400).json({ error: "bad_request", message: "inspectionId is required" });

  try {
    const [contractor] = await db.select().from(projectContractorsTable)
      .where(and(eq(projectContractorsTable.id, contractorId), eq(projectContractorsTable.projectId, projectId)));
    if (!contractor) return res.status(404).json({ error: "not_found", message: "Contractor not found" });
    if (!contractor.email) return res.status(400).json({ error: "bad_request", message: "Contractor has no email address" });

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
    if (!inspection) return res.status(404).json({ error: "not_found", message: "Inspection not found" });

    // Get all checklist results for this inspection where tradeAllocated matches this contractor
    const results = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, inspectionId));

    // Get the checklist items for their names
    const itemIds = results.map(r => r.checklistItemId).filter(Boolean) as number[];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.id, itemIds))
      : [];
    const itemNameMap: Record<number, string> = {};
    for (const item of items) itemNameMap[item.id] = item.label ?? item.description ?? "Unknown Item";

    // Filter to defects assigned to this contractor (tradeAllocated contains contractor name)
    const contractorResults = results.filter(r => {
      const trade = (r.tradeAllocated ?? "").toLowerCase();
      const name = contractor.name.toLowerCase();
      return trade.includes(name) && (r.result === "fail" || r.defectStatus === "open" || r.defectStatus === "in_progress");
    });

    if (contractorResults.length === 0) {
      return res.status(400).json({ error: "no_defects", message: "No defects are currently assigned to this contractor" });
    }

    // Resolve sender name from auth
    const senderId = getUserIdFromRequest(req);
    let senderName = "InspectProof";
    if (senderId) {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));
      if (sender) senderName = `${sender.firstName} ${sender.lastName}`.trim();
    }

    const defects = contractorResults.map(r => ({
      itemName: r.checklistItemId ? (itemNameMap[r.checklistItemId] ?? "Unknown Item") : "Unknown Item",
      severity: r.severity,
      location: r.location,
      recommendedAction: r.recommendedAction,
      notes: r.notes,
    }));

    await sendContractorDefectReportEmail({
      toEmail: contractor.email,
      contractorName: contractor.name,
      trade: contractor.trade,
      projectName: project?.name ?? "Unknown Project",
      inspectionName: inspection.name ?? "Inspection",
      inspectionDate: inspection.scheduledDate ? String(inspection.scheduledDate) : null,
      senderName,
      defects,
    }, req.log);

    req.log.info({ contractorId, projectId, inspectionId, defects: defects.length }, "Defect report sent");
    res.json({ success: true, message: `Defect report sent to ${contractor.email} (${defects.length} item${defects.length !== 1 ? "s" : ""})` });
  } catch (err) {
    req.log.error({ err }, "Send defect report error");
    res.status(500).json({ error: "internal_error", message: "Failed to send defect report" });
  }
});

router.post("/:id/staff/:staffId/send-defect-report", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const staffId = parseInt(req.params.staffId);
  if (isNaN(projectId) || isNaN(staffId)) return res.status(400).json({ error: "bad_request" });

  const { inspectionId } = req.body as { inspectionId?: number };
  if (!inspectionId) return res.status(400).json({ error: "bad_request", message: "inspectionId is required" });

  try {
    const [staff] = await db.select().from(internalStaffTable).where(eq(internalStaffTable.id, staffId));
    if (!staff) return res.status(404).json({ error: "not_found", message: "Staff member not found" });
    if (!staff.email) return res.status(400).json({ error: "bad_request", message: "Staff member has no email address" });

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
    if (!inspection) return res.status(404).json({ error: "not_found", message: "Inspection not found" });

    const results = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, inspectionId));

    const itemIds = results.map(r => r.checklistItemId).filter(Boolean) as number[];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.id, itemIds))
      : [];
    const itemNameMap: Record<number, string> = {};
    for (const item of items) itemNameMap[item.id] = item.label ?? item.description ?? "Unknown Item";

    // Filter checklist results assigned to this staff member
    const staffResults = results.filter(r => {
      const trade = (r.tradeAllocated ?? "").toLowerCase();
      const name = staff.name.toLowerCase();
      return trade.includes(name) && (r.result === "fail" || r.defectStatus === "open" || r.defectStatus === "in_progress");
    });

    if (staffResults.length === 0) {
      return res.status(400).json({ error: "no_defects", message: "No defects are currently assigned to this staff member" });
    }

    const senderId = getUserIdFromRequest(req);
    let senderName = "InspectProof";
    if (senderId) {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));
      if (sender) senderName = `${sender.firstName} ${sender.lastName}`.trim();
    }

    const defects = staffResults.map(r => ({
      itemName: r.checklistItemId ? (itemNameMap[r.checklistItemId] ?? "Unknown Item") : "Unknown Item",
      severity: r.severity,
      location: r.location,
      recommendedAction: r.recommendedAction,
      notes: r.notes,
    }));

    await sendContractorDefectReportEmail({
      toEmail: staff.email,
      contractorName: staff.name,
      trade: staff.role ?? "Internal Staff",
      projectName: project?.name ?? "Unknown Project",
      inspectionName: inspection.name ?? "Inspection",
      inspectionDate: inspection.scheduledDate ? String(inspection.scheduledDate) : null,
      senderName,
      defects,
    }, req.log);

    req.log.info({ staffId, projectId, inspectionId, defects: defects.length }, "Staff defect report sent");
    res.json({ success: true, message: `Action items sent to ${staff.email} (${defects.length} item${defects.length !== 1 ? "s" : ""})` });
  } catch (err) {
    req.log.error({ err }, "Send staff defect report error");
    res.status(500).json({ error: "internal_error", message: "Failed to send action items" });
  }
});

router.post("/:id/org-contractors/:orgContractorId/send-defect-report", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const orgContractorId = parseInt(req.params.orgContractorId);
  if (isNaN(projectId) || isNaN(orgContractorId)) return res.status(400).json({ error: "bad_request" });

  const { inspectionId } = req.body as { inspectionId?: number };
  if (!inspectionId) return res.status(400).json({ error: "bad_request", message: "inspectionId is required" });

  try {
    const authUser = req.authUser!;
    const orgScope = authUser.companyName?.trim() || `user:${authUser.id}`;

    const [contractor] = await db.select().from(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, orgContractorId), eq(orgContractorsTable.companyName, orgScope)));
    if (!contractor) return res.status(404).json({ error: "not_found", message: "Org contractor not found" });
    if (!contractor.email) return res.status(400).json({ error: "bad_request", message: "Org contractor has no email address" });

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
    if (!inspection) return res.status(404).json({ error: "not_found", message: "Inspection not found" });

    const results = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, inspectionId));

    const itemIds = results.map(r => r.checklistItemId).filter(Boolean) as number[];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.id, itemIds))
      : [];
    const itemNameMap: Record<number, string> = {};
    for (const item of items) itemNameMap[item.id] = item.label ?? item.description ?? "Unknown Item";

    const contractorResults = results.filter(r => {
      const trade = (r.tradeAllocated ?? "").toLowerCase();
      const name = contractor.name.toLowerCase();
      return trade.includes(name) && (r.result === "fail" || r.defectStatus === "open" || r.defectStatus === "in_progress");
    });

    if (contractorResults.length === 0) {
      return res.status(400).json({ error: "no_defects", message: "No defects are currently assigned to this contractor" });
    }

    const senderId = getUserIdFromRequest(req);
    let senderName = "InspectProof";
    if (senderId) {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));
      if (sender) senderName = `${sender.firstName} ${sender.lastName}`.trim();
    }

    const defects = contractorResults.map(r => ({
      itemName: r.checklistItemId ? (itemNameMap[r.checklistItemId] ?? "Unknown Item") : "Unknown Item",
      severity: r.severity,
      location: r.location,
      recommendedAction: r.recommendedAction,
      notes: r.notes,
    }));

    await sendContractorDefectReportEmail({
      toEmail: contractor.email,
      contractorName: contractor.name,
      trade: contractor.trade,
      projectName: project?.name ?? "Unknown Project",
      inspectionName: inspection.name ?? "Inspection",
      inspectionDate: inspection.scheduledDate ? String(inspection.scheduledDate) : null,
      senderName,
      defects,
    }, req.log);

    req.log.info({ orgContractorId, projectId, inspectionId, defects: defects.length }, "Org contractor defect report sent");
    res.json({ success: true, message: `Defect report sent to ${contractor.email} (${defects.length} item${defects.length !== 1 ? "s" : ""})` });
  } catch (err) {
    req.log.error({ err }, "Send org contractor defect report error");
    res.status(500).json({ error: "internal_error", message: "Failed to send defect report" });
  }
});

// Send defect reports to ALL allocated trades in one call — one email per person, all defects collated
router.post("/:id/inspections/:inspectionId/send-all-defects", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id);
  const inspectionId = parseInt(req.params.inspectionId);
  if (isNaN(projectId) || isNaN(inspectionId)) return res.status(400).json({ error: "bad_request" });

  try {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    const [inspection] = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, inspectionId));
    if (!inspection) return res.status(404).json({ error: "not_found", message: "Inspection not found" });

    // All checklist results for this inspection that are defects
    const results = await db.select().from(checklistResultsTable)
      .where(eq(checklistResultsTable.inspectionId, inspectionId));
    const defectResults = results.filter(r =>
      r.result === "fail" || r.defectStatus === "open" || r.defectStatus === "in_progress"
    );
    if (defectResults.length === 0) {
      return res.status(400).json({ error: "no_defects", message: "No defects found for this inspection" });
    }

    // Resolve item names
    const itemIds = defectResults.map(r => r.checklistItemId).filter(Boolean) as number[];
    const items = itemIds.length > 0
      ? await db.select().from(checklistItemsTable).where(inArray(checklistItemsTable.id, itemIds))
      : [];
    const itemNameMap: Record<number, string> = {};
    for (const item of items) itemNameMap[item.id] = item.label ?? item.description ?? "Unknown Item";

    // Determine org scope for org-level contractor lookup
    const senderId2 = getUserIdFromRequest(req);
    let orgScope2: string | null = null;
    if (senderId2) {
      const [senderUser2] = await db.select().from(usersTable).where(eq(usersTable.id, senderId2));
      if (senderUser2) orgScope2 = senderUser2.companyName?.trim() || `user:${senderUser2.id}`;
    }

    // All potential recipients: contractors for this project + org-level contractors + internal staff (scoped to org)
    const [contractors, orgContractors, allStaff] = await Promise.all([
      db.select().from(projectContractorsTable).where(eq(projectContractorsTable.projectId, projectId)),
      orgScope2
        ? db.select().from(orgContractorsTable).where(eq(orgContractorsTable.companyName, orgScope2))
        : Promise.resolve([]),
      orgScope2
        ? db.select().from(internalStaffTable).where(eq(internalStaffTable.companyName, orgScope2))
        : Promise.resolve([]),
    ]);

    type PersonEntry = {
      email: string;
      name: string;
      trade: string;
      defects: { itemName: string; severity: string | null; location: string | null; recommendedAction: string | null; notes: string | null }[];
    };

    // Build map keyed by email so each person only gets ONE email no matter how many items they're on
    const personMap = new Map<string, PersonEntry>();

    for (const result of defectResults) {
      const tradeField = (result.tradeAllocated ?? "").toLowerCase();
      if (!tradeField) continue;

      const defect = {
        itemName: result.checklistItemId ? (itemNameMap[result.checklistItemId] ?? "Unknown Item") : "Unknown Item",
        severity: result.severity ?? null,
        location: result.location ?? null,
        recommendedAction: result.recommendedAction ?? null,
        notes: result.notes ?? null,
      };

      for (const c of contractors) {
        if (!c.email) continue;
        if (tradeField.includes(c.name.toLowerCase())) {
          const entry = personMap.get(c.email);
          if (entry) { entry.defects.push(defect); }
          else { personMap.set(c.email, { email: c.email, name: c.name, trade: c.trade ?? "Trade", defects: [defect] }); }
        }
      }
      for (const oc of orgContractors) {
        if (!oc.email) continue;
        if (tradeField.includes(oc.name.toLowerCase())) {
          const entry = personMap.get(oc.email);
          if (entry) { entry.defects.push(defect); }
          else { personMap.set(oc.email, { email: oc.email, name: oc.name, trade: oc.trade ?? "Trade", defects: [defect] }); }
        }
      }
      for (const s of allStaff) {
        if (!s.email) continue;
        if (tradeField.includes(s.name.toLowerCase())) {
          const entry = personMap.get(s.email);
          if (entry) { entry.defects.push(defect); }
          else { personMap.set(s.email, { email: s.email, name: s.name, trade: s.role ?? "Internal Staff", defects: [defect] }); }
        }
      }
    }

    if (personMap.size === 0) {
      return res.status(400).json({
        error: "no_recipients",
        message: "No recipients found — make sure defect items have trades allocated with matching email addresses.",
      });
    }

    // Resolve sender
    const senderId = getUserIdFromRequest(req);
    let senderName = "InspectProof";
    let senderCompany: string | null = null;
    if (senderId) {
      const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId));
      if (sender) {
        senderName = `${sender.firstName} ${sender.lastName}`.trim();
        senderCompany = sender.companyName ?? null;
      }
    }

    // Fire one email per unique person
    const sent: { name: string; email: string; count: number }[] = [];
    const failed: string[] = [];

    for (const person of personMap.values()) {
      try {
        await sendContractorDefectReportEmail({
          toEmail: person.email,
          contractorName: person.name,
          trade: person.trade,
          projectName: project?.name ?? "Unknown Project",
          inspectionName: inspection.name ?? "Inspection",
          inspectionDate: inspection.scheduledDate ? String(inspection.scheduledDate) : null,
          senderName,
          senderCompany: senderCompany ?? undefined,
          defects: person.defects,
        }, req.log);
        sent.push({ name: person.name, email: person.email, trade: person.trade, count: person.defects.length });
      } catch (err) {
        req.log.error({ err, email: person.email }, "Defect email send failed");
        failed.push(person.name);
      }
    }

    req.log.info({ projectId, inspectionId, sent: sent.length, failed: failed.length }, "Bulk defect emails done");

    const msgParts = sent.map(s => `${s.name} (${s.count} item${s.count !== 1 ? "s" : ""})`);
    res.json({
      success: true,
      sent,
      failed,
      message: sent.length === 0
        ? "No emails were sent."
        : sent.length === 1
          ? `Defect report sent to ${msgParts[0]}`
          : `Defect reports sent to ${sent.length} people: ${msgParts.join(", ")}`,
    });
  } catch (err) {
    req.log.error({ err }, "Send all defects error");
    res.status(500).json({ error: "internal_error", message: "Failed to send defect reports" });
  }
});

// ── Org Contractor Project Assignments ───────────────────────────────────────

function orgScope(authUser: { companyName?: string | null; id: number }): string {
  return authUser.companyName?.trim() || `user:${authUser.id}`;
}

router.get("/:id/org-contractor-assignments", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: "bad_request" });
  try {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) return res.status(404).json({ error: "not_found" });
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const rows = await db
      .select({ orgContractorId: orgContractorProjectAssignmentsTable.orgContractorId })
      .from(orgContractorProjectAssignmentsTable)
      .where(eq(orgContractorProjectAssignmentsTable.projectId, projectId));

    const orgContractorIds = rows.map(r => r.orgContractorId);

    // Compute is_inducted for each contractor: signed off on a completed induction
    const inductedSet = new Set<number>();
    if (orgContractorIds.length > 0) {
      const completedInductions = await db
        .select({ id: inductionsTable.id })
        .from(inductionsTable)
        .where(and(eq(inductionsTable.projectId, projectId), eq(inductionsTable.status, "completed")));
      if (completedInductions.length > 0) {
        const completedIds = completedInductions.map(i => i.id);
        const signedRows = await db
          .select({ orgContractorId: inductionAttendeesTable.orgContractorId })
          .from(inductionAttendeesTable)
          .where(
            and(
              inArray(inductionAttendeesTable.inductionId, completedIds),
              eq(inductionAttendeesTable.signedOff, true),
              sql`${inductionAttendeesTable.orgContractorId} IS NOT NULL`
            )
          );
        for (const r of signedRows) {
          if (r.orgContractorId !== null) inductedSet.add(r.orgContractorId);
        }
      }
    }

    // Return both plain array (backward compat) and enriched format based on Accept header
    const enriched = req.query.format === "enriched";
    if (enriched) {
      res.json(orgContractorIds.map(id => ({ id, isInducted: inductedSet.has(id) })));
    } else {
      res.json(orgContractorIds);
    }
  } catch (err) {
    req.log.error({ err }, "List org contractor assignments error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/org-contractor-assignments", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: "bad_request" });
  const { orgContractorId } = req.body as { orgContractorId?: number };
  if (!orgContractorId || isNaN(Number(orgContractorId))) {
    return res.status(400).json({ error: "bad_request", message: "orgContractorId is required" });
  }
  const orgContractorIdNum = Number(orgContractorId);
  try {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) return res.status(404).json({ error: "not_found" });
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Verify the org contractor belongs to the caller's org scope
    const scope = orgScope(req.authUser!);
    const [contractor] = await db
      .select({ id: orgContractorsTable.id })
      .from(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, orgContractorIdNum), eq(orgContractorsTable.companyName, scope)));
    if (!contractor) {
      return res.status(404).json({ error: "not_found", message: "Org contractor not found in your organisation" });
    }

    await db
      .insert(orgContractorProjectAssignmentsTable)
      .values({ orgContractorId: orgContractorIdNum, projectId })
      .onConflictDoNothing({
        target: [
          orgContractorProjectAssignmentsTable.orgContractorId,
          orgContractorProjectAssignmentsTable.projectId,
        ],
      });
    res.status(201).json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Assign org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id/org-contractor-assignments/:orgContractorId", requireAuth, async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const orgContractorId = parseInt(req.params.orgContractorId, 10);
  if (isNaN(projectId) || isNaN(orgContractorId)) return res.status(400).json({ error: "bad_request" });
  try {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) return res.status(404).json({ error: "not_found" });
    if (!await canAccessProject(project.createdById, req.authUser!)) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Verify the org contractor belongs to the caller's org scope
    const scope = orgScope(req.authUser!);
    const [contractor] = await db
      .select({ id: orgContractorsTable.id })
      .from(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, orgContractorId), eq(orgContractorsTable.companyName, scope)));
    if (!contractor) {
      return res.status(404).json({ error: "not_found", message: "Org contractor not found in your organisation" });
    }

    await db
      .delete(orgContractorProjectAssignmentsTable)
      .where(
        and(
          eq(orgContractorProjectAssignmentsTable.projectId, projectId),
          eq(orgContractorProjectAssignmentsTable.orgContractorId, orgContractorId)
        )
      );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Unassign org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
