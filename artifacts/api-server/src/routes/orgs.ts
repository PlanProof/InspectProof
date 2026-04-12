import { Router, type IRouter } from "express";
import { eq, and, or, count, sql, ne, gt } from "drizzle-orm";
import { db, usersTable, userOrganisationsTable, invitationsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";
import { validatePermissions, parsePermissions } from "../lib/permissions";

const router: IRouter = Router();

// ── GET /api/user/organisations — list all orgs for the current user ──────────

router.get("/user/organisations", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const memberships = await db
      .select({
        id: userOrganisationsTable.id,
        orgAdminId: userOrganisationsTable.orgAdminId,
        role: userOrganisationsTable.role,
        permissions: userOrganisationsTable.permissions,
        status: userOrganisationsTable.status,
        joinedAt: userOrganisationsTable.joinedAt,
        createdAt: userOrganisationsTable.createdAt,
        orgName: usersTable.companyName,
        orgAdminFirstName: usersTable.firstName,
        orgAdminLastName: usersTable.lastName,
        orgAdminEmail: usersTable.email,
      })
      .from(userOrganisationsTable)
      .innerJoin(usersTable, eq(userOrganisationsTable.orgAdminId, usersTable.id))
      .where(and(
        eq(userOrganisationsTable.userId, userId),
        ne(userOrganisationsTable.status, "revoked"),
      ));

    res.json({
      organisations: memberships.map(m => ({
        id: m.id,
        orgId: m.orgAdminId,
        orgAdminId: m.orgAdminId,
        orgName: m.orgName ?? `${m.orgAdminFirstName} ${m.orgAdminLastName}`.trim(),
        orgAdminEmail: m.orgAdminEmail,
        role: m.role,
        permissions: parsePermissions(m.permissions),
        status: m.status,
        joinedAt: m.joinedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "List user organisations error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── DELETE /api/user/organisations/:orgId — leave an org ─────────────────────

router.delete("/user/organisations/:orgId", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const orgAdminId = parseInt(String(req.params.orgId));

    if (isNaN(orgAdminId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid org ID" });
      return;
    }

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.userId, userId),
        eq(userOrganisationsTable.orgAdminId, orgAdminId),
      ));

    if (!membership) {
      // Create a revoked tombstone entry so getAccessibleOrgAdminIds blocks primary-org access
      await db.insert(userOrganisationsTable).values({
        userId,
        orgAdminId,
        status: "revoked",
        role: "inspector",
      });
    } else {
      // Mark as revoked rather than deleting — this ensures getAccessibleOrgAdminIds
      // can block primary-org access derived from adminUserId for this user.
      await db.update(userOrganisationsTable)
        .set({ status: "revoked", inviteToken: null })
        .where(eq(userOrganisationsTable.id, membership.id));
    }

    req.log.info({ userId, orgAdminId }, "User left organisation");
    res.json({ success: true, message: "Left organisation successfully" });
  } catch (err) {
    req.log.error({ err }, "Leave organisation error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/orgs/invites/:token/accept — accept a pending org invite by token ─

router.post("/orgs/invites/:token/accept", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ error: "bad_request", message: "Token is required" });
      return;
    }

    // Validate the token belongs to this user's pending membership
    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.userId, userId),
        sql`${userOrganisationsTable.inviteToken} = ${token}`,
        eq(userOrganisationsTable.status, "pending"),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Invitation not found or already used" });
      return;
    }

    // Check expiry via invitations table (stores expiresAt for this token)
    const [invite] = await db
      .select({ expiresAt: invitationsTable.expiresAt })
      .from(invitationsTable)
      .where(sql`${invitationsTable.token} = ${token}`);
    if (invite && invite.expiresAt < new Date()) {
      res.status(410).json({ error: "invite_expired", message: "This invitation has expired. Please request a new invitation." });
      return;
    }

    await db.update(userOrganisationsTable)
      .set({ status: "active", joinedAt: new Date(), inviteToken: null })
      .where(eq(userOrganisationsTable.id, membership.id));

    req.log.info({ userId, orgAdminId: membership.orgAdminId, token }, "Org invite accepted by token");
    res.json({ success: true, message: "Invitation accepted" });
  } catch (err) {
    req.log.error({ err }, "Accept org invite error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/orgs/invites/:token/decline — decline a pending org invite by token ─

router.post("/orgs/invites/:token/decline", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const token = String(req.params.token);

    if (!token) {
      res.status(400).json({ error: "bad_request", message: "Token is required" });
      return;
    }

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.userId, userId),
        sql`${userOrganisationsTable.inviteToken} = ${token}`,
        eq(userOrganisationsTable.status, "pending"),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Invitation not found or already used" });
      return;
    }

    // Check expiry via invitations table
    const [inviteDecline] = await db
      .select({ expiresAt: invitationsTable.expiresAt })
      .from(invitationsTable)
      .where(sql`${invitationsTable.token} = ${token}`);
    if (inviteDecline && inviteDecline.expiresAt < new Date()) {
      res.status(410).json({ error: "invite_expired", message: "This invitation has expired." });
      return;
    }

    await db.delete(userOrganisationsTable).where(eq(userOrganisationsTable.id, membership.id));

    req.log.info({ userId, orgAdminId: membership.orgAdminId, token }, "Org invite declined by token");
    res.json({ success: true, message: "Invitation declined" });
  } catch (err) {
    req.log.error({ err }, "Decline org invite error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/orgs/memberships/:membershipId/accept — accept by membership ID ─
// (Use this for in-app acceptance to avoid conflict with token-based routes)

router.post("/orgs/memberships/:membershipId/accept", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const membershipId = parseInt(String(req.params.membershipId));

    if (isNaN(membershipId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid membership ID" });
      return;
    }

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.id, membershipId),
        eq(userOrganisationsTable.userId, userId),
        eq(userOrganisationsTable.status, "pending"),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Pending invitation not found" });
      return;
    }

    await db.update(userOrganisationsTable)
      .set({ status: "active", joinedAt: new Date() })
      .where(eq(userOrganisationsTable.id, membershipId));

    req.log.info({ userId, orgAdminId: membership.orgAdminId }, "Org invite accepted by membership ID");
    res.json({ success: true, message: "Invitation accepted" });
  } catch (err) {
    req.log.error({ err }, "Accept org invite error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/orgs/memberships/:membershipId/decline — decline by membership ID

router.post("/orgs/memberships/:membershipId/decline", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const membershipId = parseInt(String(req.params.membershipId));

    if (isNaN(membershipId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid membership ID" });
      return;
    }

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.id, membershipId),
        eq(userOrganisationsTable.userId, userId),
        eq(userOrganisationsTable.status, "pending"),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Pending invitation not found" });
      return;
    }

    await db.delete(userOrganisationsTable).where(eq(userOrganisationsTable.id, membershipId));

    req.log.info({ userId, orgAdminId: membership.orgAdminId }, "Org invite declined");
    res.json({ success: true, message: "Invitation declined" });
  } catch (err) {
    req.log.error({ err }, "Decline org invite error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── PATCH /api/orgs/members/:userId — update a member's per-org permissions ───

router.patch("/orgs/members/:userId", requireAuth, async (req, res) => {
  try {
    const caller = req.authUser!;
    const targetUserId = parseInt(String(req.params.userId));

    if (isNaN(targetUserId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid user ID" });
      return;
    }

    if (!caller.isCompanyAdmin && !caller.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can update member permissions." });
      return;
    }

    const orgAdminId = caller.isAdmin ? (req.body.orgAdminId ?? caller.id) : caller.id;

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.userId, targetUserId),
        eq(userOrganisationsTable.orgAdminId, orgAdminId),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Membership not found in your organisation" });
      return;
    }

    const { role, permissions, status } = req.body as { role?: string; permissions?: Record<string, boolean>; status?: string };
    const updateData: { role?: string; permissions?: string; status?: string } = {};

    if (role !== undefined) updateData.role = role;
    if (status !== undefined) {
      const validStatuses = ["active", "suspended"];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: "bad_request", message: "Invalid status. Must be active or suspended." });
        return;
      }
      updateData.status = status;
    }
    if (permissions !== undefined) {
      const validated = validatePermissions(permissions);
      if (!validated.ok) {
        res.status(400).json({ error: "bad_request", message: "Invalid permissions format." });
        return;
      }
      updateData.permissions = JSON.stringify(validated.data);
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "bad_request", message: "No valid fields to update" });
      return;
    }

    const [updated] = await db.update(userOrganisationsTable)
      .set(updateData)
      .where(eq(userOrganisationsTable.id, membership.id))
      .returning();

    req.log.info({ targetUserId, orgAdminId, status: updateData.status }, "Org member updated");
    res.json({
      id: updated.id,
      userId: updated.userId,
      orgAdminId: updated.orgAdminId,
      role: updated.role,
      permissions: parsePermissions(updated.permissions),
      status: updated.status,
    });
  } catch (err) {
    req.log.error({ err }, "Update org member error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── DELETE /api/orgs/members/:userId — revoke a member from the org ───────────

router.delete("/orgs/members/:userId", requireAuth, async (req, res) => {
  try {
    const caller = req.authUser!;
    const targetUserId = parseInt(String(req.params.userId));

    if (isNaN(targetUserId)) {
      res.status(400).json({ error: "bad_request", message: "Invalid user ID" });
      return;
    }

    if (targetUserId === caller.id) {
      res.status(400).json({ error: "bad_request", message: "You cannot revoke your own access." });
      return;
    }

    if (!caller.isCompanyAdmin && !caller.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can revoke member access." });
      return;
    }

    const orgAdminId = caller.isAdmin ? (req.body.orgAdminId ?? caller.id) : caller.id;

    const [membership] = await db
      .select()
      .from(userOrganisationsTable)
      .where(and(
        eq(userOrganisationsTable.userId, targetUserId),
        eq(userOrganisationsTable.orgAdminId, orgAdminId),
      ));

    if (!membership) {
      res.status(404).json({ error: "not_found", message: "Membership not found in your organisation" });
      return;
    }

    // Mark as revoked rather than deleting — a tombstone row ensures getAccessibleOrgAdminIds
    // blocks access even when the user's primary org matches (via adminUserId fallback).
    await db.update(userOrganisationsTable)
      .set({ status: "revoked", inviteToken: null })
      .where(eq(userOrganisationsTable.id, membership.id));

    req.log.info({ targetUserId, orgAdminId }, "Org member revoked");
    res.json({ success: true, message: "Member access revoked" });
  } catch (err) {
    req.log.error({ err }, "Revoke org member error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/orgs/members — list members in the admin's org with multi-org info

router.get("/orgs/members", requireAuth, async (req, res) => {
  try {
    const caller = req.authUser!;

    if (!caller.isCompanyAdmin && !caller.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can view members." });
      return;
    }

    const orgAdminId = caller.isAdmin
      ? (req.query.orgAdminId ? parseInt(req.query.orgAdminId as string) : caller.id)
      : caller.id;

    const memberships = await db
      .select({
        id: userOrganisationsTable.id,
        userId: userOrganisationsTable.userId,
        role: userOrganisationsTable.role,
        permissions: userOrganisationsTable.permissions,
        status: userOrganisationsTable.status,
        joinedAt: userOrganisationsTable.joinedAt,
        createdAt: userOrganisationsTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        isCompanyAdmin: usersTable.isCompanyAdmin,
        isActive: usersTable.isActive,
        userType: usersTable.userType,
      })
      .from(userOrganisationsTable)
      .innerJoin(usersTable, eq(userOrganisationsTable.userId, usersTable.id))
      .where(and(
        eq(userOrganisationsTable.orgAdminId, orgAdminId),
        ne(userOrganisationsTable.status, "revoked"),
      ));

    // For each member, count how many orgs they belong to (to detect multi-org)
    const multiOrgCounts: Record<number, number> = {};
    const userIds = memberships.map(m => m.userId);
    if (userIds.length > 0) {
      const countRows = await db
        .select({
          userId: userOrganisationsTable.userId,
          orgCount: count(),
        })
        .from(userOrganisationsTable)
        .where(and(
          eq(userOrganisationsTable.status, "active"),
        ))
        .groupBy(userOrganisationsTable.userId);
      for (const row of countRows) {
        multiOrgCounts[row.userId] = Number(row.orgCount);
      }
    }

    res.json({
      members: memberships.map(m => ({
        membershipId: m.id,
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone ?? null,
        role: m.role,
        permissions: parsePermissions(m.permissions),
        status: m.status,
        isCompanyAdmin: m.isCompanyAdmin ?? false,
        isActive: m.isActive,
        userType: m.userType ?? "inspector",
        joinedAt: m.joinedAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        isMultiOrg: (multiOrgCounts[m.userId] ?? 0) > 1,
        orgCount: multiOrgCounts[m.userId] ?? 1,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "List org members error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
