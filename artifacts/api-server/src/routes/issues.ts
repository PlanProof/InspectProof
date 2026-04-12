import { Router, type IRouter } from "express";
import { eq, sql, lt, and, ne, desc, inArray } from "drizzle-orm";
import { db, issuesTable, issueCommentsTable, projectsTable, activityLogsTable, usersTable, inspectionsTable, checklistTemplatesTable, userOrganisationsTable } from "@workspace/db";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { getOrgMemberIds } from "../lib/quota";
import { sendEmail } from "../lib/email";
import { decodeSessionToken } from "../lib/session-token";

const router: IRouter = Router();

function getUserIdFromRequest(req: any): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const { userId, valid } = decodeSessionToken(auth.slice(7));
  return valid ? userId : null;
}

async function canUserAccessIssue(userId: number, isAdmin: boolean, issueProjectId: number | null): Promise<boolean> {
  if (isAdmin) return true;
  if (!issueProjectId) return true; // standalone issue accessible to all authenticated users
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name, createdById: projectsTable.createdById })
    .from(projectsTable).where(eq(projectsTable.id, issueProjectId));
  const project = projects[0];
  if (!project) return false;
  return project.createdById === userId || project.name === "Test Project";
}

async function formatIssue(i: any) {
  let pName = "No Project";
  if (i.projectId) {
    const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, i.projectId));
    pName = projects[0]?.name || "Unknown";
  }

  let assigneeName: string | null = null;
  if (i.assignedToId) {
    const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.id, i.assignedToId));
    if (users[0]) assigneeName = `${users[0].firstName} ${users[0].lastName}`.trim();
  }

  let inspectionType: string | null = null;
  let inspectionScheduledDate: string | null = null;
  let inspectionTemplateName: string | null = null;
  if (i.inspectionId) {
    const rows = await db
      .select({
        inspectionType: inspectionsTable.inspectionType,
        scheduledDate: inspectionsTable.scheduledDate,
        checklistTemplateId: inspectionsTable.checklistTemplateId,
      })
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, i.inspectionId));
    if (rows[0]) {
      inspectionType = rows[0].inspectionType ?? null;
      inspectionScheduledDate = rows[0].scheduledDate instanceof Date
        ? rows[0].scheduledDate.toISOString()
        : (rows[0].scheduledDate ?? null);
      if (rows[0].checklistTemplateId) {
        const tmpl = await db
          .select({ name: checklistTemplatesTable.name })
          .from(checklistTemplatesTable)
          .where(eq(checklistTemplatesTable.id, rows[0].checklistTemplateId));
        inspectionTemplateName = tmpl[0]?.name ?? null;
      }
    }
  }

  // Strip internal [auto:NNN] tracking markers from descriptions before returning
  const cleanDesc = (i.description ?? "").replace(/^\[auto:\d+\]\s*/, "");

  return {
    id: i.id,
    projectId: i.projectId,
    inspectionId: i.inspectionId,
    inspectionType,
    inspectionScheduledDate,
    inspectionTemplateName,
    title: i.title,
    description: cleanDesc,
    severity: i.severity,
    category: i.category ?? null,
    priority: i.priority ?? null,
    photos: i.photos ?? null,
    status: i.status,
    location: i.location,
    codeReference: i.codeReference,
    responsibleParty: i.responsibleParty,
    dueDate: i.dueDate,
    resolvedDate: i.resolvedDate,
    assignedToId: i.assignedToId,
    assigneeName,
    closeoutNotes: i.closeoutNotes ?? null,
    closeoutPhotos: i.closeoutPhotos ?? null,
    markupDocumentId: i.markupDocumentId ?? null,
    projectName: pName,
    createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
    updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt,
  };
}

async function sendAssignmentNotification(issue: any, assignedUserId: number, log: any, isReassignment = false) {
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, assignedUserId));
    const user = users[0];
    if (!user?.email) return;
    const subject = isReassignment
      ? `Issue Reassigned to You: ${issue.title}`
      : `Issue Assigned to You: ${issue.title}`;
    const html = `<p>Hi ${user.firstName},</p>
<p>${isReassignment ? "An issue has been reassigned to you" : "A new issue has been assigned to you"}:</p>
<table style="border-collapse:collapse;width:100%;max-width:600px">
  <tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Issue</td><td style="padding:8px">${issue.title}</td></tr>
  <tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Status</td><td style="padding:8px">${issue.status}</td></tr>
  ${issue.severity ? `<tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Severity</td><td style="padding:8px">${issue.severity}</td></tr>` : ""}
  ${issue.priority ? `<tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Priority</td><td style="padding:8px">${issue.priority}</td></tr>` : ""}
  ${issue.dueDate ? `<tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Due Date</td><td style="padding:8px">${issue.dueDate}</td></tr>` : ""}
  ${issue.description ? `<tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Description</td><td style="padding:8px">${issue.description}</td></tr>` : ""}
</table>
<p>Please log in to InspectProof to view the full details.</p>
<p style="color:#888;font-size:12px">InspectProof – a product of PlanProof Technologies Pty Ltd</p>`;
    await sendEmail({ to: user.email, subject, html });
  } catch (err) {
    log?.error?.({ err }, "Failed to send assignment notification");
  }
}

async function sendStatusChangeNotification(issue: any, newStatus: string, log: any) {
  try {
    const recipientId = issue.assignedToId || null;
    let recipientEmail: string | null = null;
    let recipientName: string | null = null;

    if (recipientId) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, recipientId));
      recipientEmail = users[0]?.email ?? null;
      recipientName = users[0]?.firstName ?? null;
    }

    if (!recipientEmail) return;

    const statusLabel = newStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const subject = `Issue Status Updated: ${issue.title}`;
    const html = `<p>Hi ${recipientName || "there"},</p>
<p>The status of the following issue has been updated to <strong>${statusLabel}</strong>:</p>
<table style="border-collapse:collapse;width:100%;max-width:600px">
  <tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Issue</td><td style="padding:8px">${issue.title}</td></tr>
  <tr><td style="padding:8px;font-weight:bold;background:#f8fafc">New Status</td><td style="padding:8px">${statusLabel}</td></tr>
  ${issue.dueDate ? `<tr><td style="padding:8px;font-weight:bold;background:#f8fafc">Due Date</td><td style="padding:8px">${issue.dueDate}</td></tr>` : ""}
</table>
<p>Please log in to InspectProof to view the full details.</p>
<p style="color:#888;font-size:12px">InspectProof – a product of PlanProof Technologies Pty Ltd</p>`;
    await sendEmail({ to: recipientEmail, subject, html });
  } catch (err) {
    log?.error?.({ err }, "Failed to send status change notification");
  }
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, inspectionId, status, severity, category } = req.query;
    let issues = await db.select().from(issuesTable)
      .orderBy(sql`${issuesTable.createdAt} DESC`);

    if (req.authUser) {
      if (!req.authUser.isAdmin) {
        // Non-platform-admins: scope to projects belonging to their accessible orgs
        // (matched by orgAdminId, consistent with the projects list route).
        const primaryAdminId = req.authUser.isCompanyAdmin
          ? req.authUser.id
          : (req.authUser.adminUserId ? parseInt(req.authUser.adminUserId) : req.authUser.id);

        // Collect all org admin IDs this user is an active member of
        const memberships = await db
          .select({ orgAdminId: userOrganisationsTable.orgAdminId, status: userOrganisationsTable.status })
          .from(userOrganisationsTable)
          .where(eq(userOrganisationsTable.userId, req.authUser.id));
        const blockedOrgAdminIds = new Set(
          memberships.filter(m => m.status !== "active").map(m => m.orgAdminId),
        );
        const accessibleOrgAdminIds = new Set<number>(
          memberships.filter(m => m.status === "active").map(m => m.orgAdminId),
        );
        if (!blockedOrgAdminIds.has(primaryAdminId)) {
          accessibleOrgAdminIds.add(primaryAdminId);
        }

        const allProjects = await db
          .select({ id: projectsTable.id, orgAdminId: projectsTable.orgAdminId })
          .from(projectsTable);
        const accessibleProjectIds = new Set(
          allProjects
            .filter(p => p.orgAdminId != null && accessibleOrgAdminIds.has(p.orgAdminId))
            .map(p => p.id),
        );
        // Only include issues tied to accessible projects (exclude null-project issues for non-admins)
        issues = issues.filter(i => i.projectId != null && accessibleProjectIds.has(i.projectId));
      }
      // Platform admins (isAdmin=true) see all issues — no filter applied
    } else {
      issues = [];
    }

    if (projectId) issues = issues.filter(i => i.projectId === parseInt(projectId as string));
    if (inspectionId) issues = issues.filter(i => i.inspectionId === parseInt(inspectionId as string));
    if (status) issues = issues.filter(i => i.status === status);
    if (severity) issues = issues.filter(i => i.severity === severity);
    if (category) issues = issues.filter(i => i.category === category);

    const result = await Promise.all(issues.map(formatIssue));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List issues error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    if (!data.title || !data.severity) {
      res.status(400).json({ error: "bad_request", message: "title and severity are required" });
      return;
    }
    const requestingUserId = getUserIdFromRequest(req);
    const [issue] = await db.insert(issuesTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      title: data.title,
      description: data.description || "",
      severity: data.severity,
      category: data.category || null,
      priority: data.priority || null,
      photos: data.photos ? (typeof data.photos === "string" ? data.photos : JSON.stringify(data.photos)) : null,
      status: data.status || "open",
      location: data.location,
      codeReference: data.codeReference,
      responsibleParty: data.responsibleParty,
      dueDate: data.dueDate,
      assignedToId: data.assignedToId,
    }).returning();

    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: issue.id,
      action: "created",
      description: `Issue "${issue.title}" created (${issue.severity} severity)`,
      userId: requestingUserId ?? 1,
    });

    if (issue.assignedToId) {
      await sendAssignmentNotification(issue, issue.assignedToId, req.log, false);
    }

    const formatted = await formatIssue(issue);
    res.status(201).json(formatted);
  } catch (err) {
    req.log.error({ err }, "Create issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const issues = await db.select().from(issuesTable).where(eq(issuesTable.id, id));
    if (!issues[0]) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(await formatIssue(issues[0]));
  } catch (err) {
    req.log.error({ err }, "Get issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;
    const requestingUserId = getUserIdFromRequest(req);

    const existingIssues = await db.select().from(issuesTable).where(eq(issuesTable.id, id));
    const existing = existingIssues[0];
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const updateData: any = { updatedAt: new Date() };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.photos !== undefined) {
      updateData.photos = typeof data.photos === "string" ? data.photos : JSON.stringify(data.photos);
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.codeReference !== undefined) updateData.codeReference = data.codeReference;
    if (data.responsibleParty !== undefined) updateData.responsibleParty = data.responsibleParty;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
    if (data.closeoutNotes !== undefined) updateData.closeoutNotes = data.closeoutNotes;
    if (data.closeoutPhotos !== undefined) updateData.closeoutPhotos = data.closeoutPhotos;

    // Auto-set resolvedDate when closing
    const closedStatuses = ["closed", "resolved"];
    if (data.status && closedStatuses.includes(data.status) && !existing.resolvedDate) {
      updateData.resolvedDate = new Date().toISOString().slice(0, 10);
    }

    const [issue] = await db.update(issuesTable)
      .set(updateData)
      .where(eq(issuesTable.id, id))
      .returning();

    if (!issue) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Determine activity action and description
    let action = "updated";
    let description = `Issue "${issue.title}" updated`;

    if (data.status && data.status !== existing.status) {
      const statusLabel = data.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      if (data.status === "closed" || data.status === "resolved") {
        action = "closed";
        description = `Issue "${issue.title}" closed out${data.closeoutNotes ? " with notes" : ""}`;
      } else if (data.status === "rejected") {
        action = "rejected";
        description = `Issue "${issue.title}" rejected${data.closeoutNotes ? ": " + data.closeoutNotes.slice(0, 80) : ""}`;
      } else {
        action = "status_changed";
        description = `Issue "${issue.title}" status changed to ${statusLabel}`;
      }
      // Send status-change notification
      await sendStatusChangeNotification(issue, data.status, req.log);
    } else if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
      action = "assigned";
      description = `Issue "${issue.title}" assigned`;
      if (data.assignedToId) {
        await sendAssignmentNotification(issue, data.assignedToId, req.log, !!existing.assignedToId);
      }
    } else {
      description = `Issue "${issue.title}" updated`;
    }

    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: id,
      action,
      description,
      userId: requestingUserId ?? 1,
    });

    res.json(await formatIssue(issue));
  } catch (err) {
    req.log.error({ err }, "Update issue error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Comments endpoints
router.get("/:id/comments", optionalAuth, async (req, res) => {
  try {
    if (!req.authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const issueId = parseInt(req.params.id);
    if (isNaN(issueId)) {
      res.status(400).json({ error: "bad_request", message: "invalid issue id" });
      return;
    }

    // Verify the issue exists and the user has access to it
    const [issue] = await db.select({ id: issuesTable.id, projectId: issuesTable.projectId })
      .from(issuesTable).where(eq(issuesTable.id, issueId));
    if (!issue) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const hasAccess = await canUserAccessIssue(req.authUser.id, req.authUser.isAdmin ?? false, issue.projectId);
    if (!hasAccess) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const comments = await db.select().from(issueCommentsTable)
      .where(eq(issueCommentsTable.issueId, issueId))
      .orderBy(desc(issueCommentsTable.createdAt));

    const userIds = [...new Set(comments.map(c => c.userId))];
    let userMap: Record<number, { name: string; email: string }> = {};
    if (userIds.length > 0) {
      const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable);
      for (const u of users) {
        userMap[u.id] = { name: `${u.firstName} ${u.lastName}`.trim(), email: u.email };
      }
    }

    // Also fetch activity logs for this issue (excluding "commented" to avoid duplicating comment feed items)
    const activityLogs = await db.select().from(activityLogsTable)
      .where(and(
        eq(activityLogsTable.entityType, "issue"),
        eq(activityLogsTable.entityId, issueId),
        ne(activityLogsTable.action, "commented")
      ))
      .orderBy(desc(activityLogsTable.createdAt));

    const allUserIds = [...new Set([...activityLogs.map(l => l.userId)])];
    if (allUserIds.length > 0) {
      const users = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
        .from(usersTable);
      for (const u of users) {
        userMap[u.id] = { name: `${u.firstName} ${u.lastName}`.trim(), email: u.email };
      }
    }

    const commentItems = comments.map(c => ({
      id: `comment-${c.id}`,
      type: "comment" as const,
      body: c.body,
      userId: c.userId,
      userName: userMap[c.userId]?.name ?? "Unknown",
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    }));

    const activityItems = activityLogs.map(l => ({
      id: `activity-${l.id}`,
      type: "activity" as const,
      action: l.action,
      description: l.description,
      userId: l.userId,
      userName: userMap[l.userId]?.name ?? "System",
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    }));

    const combined = [...commentItems, ...activityItems].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(combined);
  } catch (err) {
    req.log.error({ err }, "List issue comments error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/:id/comments", optionalAuth, async (req, res) => {
  try {
    if (!req.authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const issueId = parseInt(req.params.id);
    if (isNaN(issueId)) {
      res.status(400).json({ error: "bad_request", message: "invalid issue id" });
      return;
    }

    // Verify the issue exists and the user has access to it
    const [issueCheck] = await db.select({ id: issuesTable.id, projectId: issuesTable.projectId })
      .from(issuesTable).where(eq(issuesTable.id, issueId));
    if (!issueCheck) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const hasCommentAccess = await canUserAccessIssue(req.authUser.id, req.authUser.isAdmin ?? false, issueCheck.projectId);
    if (!hasCommentAccess) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const { body } = req.body;
    if (!body?.trim()) {
      res.status(400).json({ error: "bad_request", message: "body is required" });
      return;
    }

    const [comment] = await db.insert(issueCommentsTable).values({
      issueId,
      userId: req.authUser.id,
      body: body.trim(),
    }).returning();

    // Log as activity too
    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: issueId,
      action: "commented",
      description: body.trim().slice(0, 200),
      userId: req.authUser.id,
    });

    res.status(201).json({
      id: `comment-${comment.id}`,
      type: "comment",
      body: comment.body,
      userId: comment.userId,
      userName: `${req.authUser.firstName || ""} ${req.authUser.lastName || ""}`.trim() || "You",
      createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create issue comment error");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PATCH /api/issues/bulk
 * Bulk update issues by ID array or filter.
 * Body: { ids?: number[], filterAll?: boolean, patch: { status?, assignedToId?, archived? }, action?: string }
 */
router.patch("/bulk", requireAuth, async (req, res) => {
  try {
    const { ids, filterAll, patch, action, filters } = req.body;

    if (!patch || typeof patch !== "object") {
      res.status(400).json({ error: "bad_request", message: "patch payload is required" });
      return;
    }

    const requestingUserId = req.authUser!.id;

    // Resolve which issue IDs to operate on
    let targetIds: number[] = [];

    if (filterAll) {
      // Select all matching current filters
      let query = db.select({ id: issuesTable.id }).from(issuesTable);
      let issueList = await query;

      // Scope to accessible projects for non-admins
      if (!req.authUser!.isAdmin) {
        const allProjects = await db.select({ id: projectsTable.id, createdById: projectsTable.createdById }).from(projectsTable);
        const accessibleIds = new Set(allProjects.filter(p => p.createdById === requestingUserId).map(p => p.id));
        issueList = issueList.filter(i => accessibleIds.has((i as any).projectId ?? 0));
      }

      // Apply optional filters from the request
      if (filters?.status) issueList = issueList.filter((i: any) => i.status === filters.status);
      if (filters?.severity) issueList = issueList.filter((i: any) => i.severity === filters.severity);
      if (filters?.projectId) issueList = issueList.filter((i: any) => i.projectId === filters.projectId);

      targetIds = issueList.map(i => i.id);
    } else if (Array.isArray(ids) && ids.length > 0) {
      targetIds = ids.map(Number).filter(Boolean);
    }

    if (targetIds.length === 0) {
      res.status(400).json({ error: "bad_request", message: "No issues selected" });
      return;
    }

    // Build update payload
    const updateData: any = { updatedAt: new Date() };
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.assignedToId !== undefined) updateData.assignedToId = patch.assignedToId;
    if (patch.archived !== undefined) updateData.status = "archived";

    // Auto-set resolvedDate if bulk-resolving
    if (patch.status === "resolved") {
      updateData.resolvedDate = new Date().toISOString().slice(0, 10);
    }

    // Execute the bulk update
    await db.update(issuesTable)
      .set(updateData)
      .where(inArray(issuesTable.id, targetIds));

    // Determine what actually happened for the activity log description
    let actionLabel = action || "updated";
    let descriptionText = "";

    if (patch.status === "archived" || patch.archived) {
      actionLabel = "archived";
      descriptionText = `Admin bulk-archived ${targetIds.length} issue${targetIds.length !== 1 ? "s" : ""}`;
    } else if (patch.status) {
      actionLabel = "bulk_status_change";
      descriptionText = `Admin bulk-changed ${targetIds.length} issue${targetIds.length !== 1 ? "s" : ""} to "${patch.status}"`;
    } else if (patch.assignedToId !== undefined) {
      // Fetch assignee name for the log
      let assigneeName = "unassigned";
      if (patch.assignedToId) {
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, patch.assignedToId));
        if (user) assigneeName = `${user.firstName} ${user.lastName}`.trim();
      }
      actionLabel = "bulk_assign";
      descriptionText = `Admin bulk-assigned ${targetIds.length} issue${targetIds.length !== 1 ? "s" : ""} to ${assigneeName}`;
    } else {
      descriptionText = `Admin bulk-updated ${targetIds.length} issue${targetIds.length !== 1 ? "s" : ""}`;
    }

    // Write a single batched activity log entry
    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: 0,
      action: actionLabel,
      description: descriptionText,
      userId: requestingUserId,
    });

    res.json({ success: true, updatedCount: targetIds.length, description: descriptionText });
  } catch (err) {
    req.log.error({ err }, "Bulk update issues error");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /api/issues/bulk-remind
 * Send overdue reminders for a specific set of issue IDs.
 */
router.post("/bulk-remind", requireAuth, async (req, res) => {
  try {
    if (!req.authUser?.isAdmin && !req.authUser?.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "bad_request", message: "ids array is required" });
      return;
    }

    const targetIds = ids.map(Number).filter(Boolean);
    const selectedIssues = await db.select().from(issuesTable).where(inArray(issuesTable.id, targetIds));

    let sent = 0;
    for (const issue of selectedIssues) {
      if (!issue.assignedToId) continue;
      const users = await db.select().from(usersTable).where(eq(usersTable.id, issue.assignedToId));
      const user = users[0];
      if (!user?.email) continue;
      try {
        await sendEmail({
          to: user.email,
          subject: `Overdue Issue Reminder: ${issue.title}`,
          html: `<p>Hi ${user.firstName},</p>
<p>This is a reminder that the following issue is overdue:</p>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:8px;font-weight:bold">Issue</td><td style="padding:8px">${issue.title}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Description</td><td style="padding:8px">${issue.description}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Due Date</td><td style="padding:8px">${issue.dueDate}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Severity</td><td style="padding:8px">${issue.severity}</td></tr>
  ${issue.location ? `<tr><td style="padding:8px;font-weight:bold">Location</td><td style="padding:8px">${issue.location}</td></tr>` : ""}
</table>
<p>Please action this as soon as possible.</p>
<p style="color:#888;font-size:12px">InspectProof – a product of PlanProof Technologies Pty Ltd</p>`,
        });
        sent++;
      } catch {
      }
    }

    // Write a batched activity log
    await db.insert(activityLogsTable).values({
      entityType: "issue",
      entityId: 0,
      action: "bulk_remind",
      description: `Admin bulk-sent overdue reminders for ${targetIds.length} issue${targetIds.length !== 1 ? "s" : ""} (${sent} emails sent)`,
      userId: req.authUser!.id,
    });

    res.json({ success: true, remindersSent: sent, issueCount: targetIds.length });
  } catch (err) {
    req.log.error({ err }, "Bulk remind error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/send-overdue-reminders", optionalAuth, async (req, res) => {
  try {
    if (!req.authUser?.isAdmin && !req.authUser?.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const overdueIssues = await db.select().from(issuesTable)
      .where(and(
        lt(issuesTable.dueDate, today),
        ne(issuesTable.status, "closed"),
        ne(issuesTable.status, "resolved"),
        ne(issuesTable.status, "rejected"),
      ));

    let sent = 0;
    for (const issue of overdueIssues) {
      if (!issue.assignedToId) continue;
      const users = await db.select().from(usersTable).where(eq(usersTable.id, issue.assignedToId));
      const user = users[0];
      if (!user?.email) continue;
      try {
        await sendEmail({
          to: user.email,
          subject: `Overdue Issue Reminder: ${issue.title}`,
          html: `<p>Hi ${user.firstName},</p>
<p>This is a reminder that the following issue is overdue:</p>
<table style="border-collapse:collapse;width:100%">
  <tr><td style="padding:8px;font-weight:bold">Issue</td><td style="padding:8px">${issue.title}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Description</td><td style="padding:8px">${issue.description}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Due Date</td><td style="padding:8px">${issue.dueDate}</td></tr>
  <tr><td style="padding:8px;font-weight:bold">Severity</td><td style="padding:8px">${issue.severity}</td></tr>
  ${issue.location ? `<tr><td style="padding:8px;font-weight:bold">Location</td><td style="padding:8px">${issue.location}</td></tr>` : ""}
</table>
<p>Please action this as soon as possible.</p>
<p style="color:#888;font-size:12px">InspectProof – a product of PlanProof Technologies Pty Ltd</p>`,
        });
        sent++;
      } catch {
      }
    }

    res.json({ overdueCount: overdueIssues.length, remindersSent: sent });
  } catch (err) {
    req.log.error({ err }, "Overdue reminders error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
