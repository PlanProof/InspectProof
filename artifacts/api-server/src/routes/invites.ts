import { Router, type IRouter } from "express";
import { eq, and, isNull, gt, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, usersTable, invitationsTable, userOrganisationsTable } from "@workspace/db";
import { sendTokenInviteEmail } from "../lib/email";
import { requireAuth } from "../middleware/auth";
import { getLimits } from "../lib/planLimits";
import { validatePermissions, parsePermissions, DEFAULT_PERMISSIONS } from "../lib/permissions";
import bcrypt from "bcryptjs";
import { createSessionToken } from "../lib/session-token";

const router: IRouter = Router();

const INVITE_EXPIRY_DAYS = 7;

function isMobileOnly(adminPlan: string): boolean {
  return adminPlan === "free_trial";
}

// ── Send invite (token-based) ──────────────────────────────────────────────────

router.post("/app-invite", requireAuth, async (req, res) => {
  const { email, name, role, userType } = req.body as { email?: string; name?: string; role?: string; userType?: string };

  if (!email) {
    res.status(400).json({ error: "bad_request", message: "email is required" });
    return;
  }

  try {
    const inviterRows = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    const inviter = inviterRows[0];
    if (!inviter) {
      res.status(401).json({ error: "unauthorized", message: "Inviter not found" });
      return;
    }

    const inviterPerms = parsePermissions(inviter.permissions);

    if (!inviter.isCompanyAdmin && !inviterPerms.addInspectors) {
      res.status(403).json({ error: "forbidden", message: "You do not have permission to send invitations." });
      return;
    }

    // ── Resolve org owner ─────────────────────────────────────────────────────
    // For delegated users (non-admin with addInspectors), the canonical org owner is
    // their adminUserId. All quota and linkage must be scoped to the org owner, not
    // the delegated inviter, to ensure correct seat limits and account association.
    let orgOwner = inviter;
    if (!inviter.isCompanyAdmin && inviter.adminUserId) {
      const adminId = parseInt(inviter.adminUserId);
      if (!isNaN(adminId)) {
        const [ownerRow] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
        if (ownerRow) orgOwner = ownerRow;
      }
    }

    const companyName = orgOwner.companyName ?? inviter.companyName ?? null;

    // ── Seat limit check ──────────────────────────────────────────────────────
    // Count all team members linked to the org owner (adminUserId = orgOwner.id).
    const limits = getLimits(orgOwner.plan ?? "free_trial");
    if (limits.maxTeamMembers !== null) {
      const [{ value: currentMemberCount }] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.adminUserId, String(orgOwner.id)));
      if (currentMemberCount >= limits.maxTeamMembers) {
        res.status(402).json({
          error: "team_limit_reached",
          message: `Your organisation's ${limits.label} plan allows up to ${limits.maxTeamMembers} team member${limits.maxTeamMembers === 1 ? "" : "s"}. Upgrade your plan to invite more.`,
          plan: orgOwner.plan,
          limit: limits.maxTeamMembers,
          current: currentMemberCount,
        });
        return;
      }
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists (cross-org invite support)
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing.length > 0) {
      const existingUser = existing[0];
      // If the user already belongs to this org, reject
      const sameOrg = existingUser.adminUserId === String(orgOwner.id) || existingUser.id === orgOwner.id;
      if (sameOrg) {
        res.status(409).json({ error: "already_member", message: "This user is already a member of your organisation." });
        return;
      }
      // Check if there's already a membership (any status) for this user+org pair
      const [existingMembership] = await db
        .select()
        .from(userOrganisationsTable)
        .where(and(
          eq(userOrganisationsTable.userId, existingUser.id),
          eq(userOrganisationsTable.orgAdminId, orgOwner.id),
        ));
      if (existingMembership) {
        if (existingMembership.status === "pending") {
          res.status(409).json({ error: "already_invited", message: "This user already has a pending invitation to your organisation." });
        } else {
          res.status(409).json({ error: "already_member", message: "This user is already a member of your organisation." });
        }
        return;
      }
      // Create a pending multi-org membership record with a token for secure acceptance
      const inviteRole = role ?? "inspector";
      const invitePermissions = JSON.stringify({ editTemplates: false, addInspectors: false, createProjects: false });
      const crossOrgToken = randomUUID();
      const crossOrgExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      await db.insert(userOrganisationsTable).values({
        userId: existingUser.id,
        orgAdminId: orgOwner.id,
        role: inviteRole,
        permissions: invitePermissions,
        status: "pending",
        invitedById: inviter.id,
        inviteToken: crossOrgToken,
      });
      // Also persist to invitationsTable for audit trail with same token
      await db.insert(invitationsTable).values({
        token: crossOrgToken,
        email: normalizedEmail,
        companyName,
        invitedById: String(orgOwner.id),
        role: inviteRole,
        userType: "inspector",
        permissions: invitePermissions,
        expiresAt: crossOrgExpiresAt,
      }).onConflictDoNothing();
      // Send an invitation email with the token for secure acceptance
      const inviterName = `${inviter.firstName} ${inviter.lastName}`.trim();
      await sendTokenInviteEmail(
        { toEmail: normalizedEmail, inviteeName: name?.trim() || null, inviterName, companyName, token: crossOrgToken },
        req.log
      ).catch(() => {});
      req.log.info({ email: normalizedEmail, existingUserId: existingUser.id, orgAdminId: orgOwner.id }, "Cross-org invite sent to existing user");
      res.json({ success: true, message: `Invite sent to ${normalizedEmail}` });
      return;
    }

    // Expire any existing pending invites for the same email/company
    // (we just create a new token rather than updating to keep audit trail cleaner)

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Validate userType — default to "both" for new invites (inherit all access)
    const validUserTypes = ["inspector", "user", "both"];
    const inviteUserType = validUserTypes.includes(userType ?? "") ? (userType as string) : "both";

    await db.insert(invitationsTable).values({
      token,
      email: normalizedEmail,
      companyName,
      invitedById: String(orgOwner.id),
      role: role ?? "inspector",
      userType: inviteUserType,
      permissions: JSON.stringify({ editTemplates: false, addInspectors: false, createProjects: false }),
      expiresAt,
    });

    const inviterName = `${inviter.firstName} ${inviter.lastName}`.trim();

    await sendTokenInviteEmail(
      { toEmail: normalizedEmail, inviteeName: name?.trim() || null, inviterName, companyName, token },
      req.log
    );

    req.log.info({ email: normalizedEmail, invitedBy: req.authUser!.id }, "Token invite sent");
    res.json({ success: true, message: `Invite sent to ${normalizedEmail}` });
  } catch (err) {
    req.log.error({ err }, "Send app invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to send invite" });
  }
});

// ── List pending invites for the caller's org ─────────────────────────────────

router.get("/pending", requireAuth, async (req, res) => {
  try {
    const inviterRows = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    const inviter = inviterRows[0];
    if (!inviter) {
      res.json({ invites: [] });
      return;
    }
    if (!inviter.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can view pending invitations." });
      return;
    }

    // Scope pending invites by the admin's own ID (stable identifier, not mutable companyName)
    const pending = await db.select().from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.invitedById, String(inviter.id)),
          isNull(invitationsTable.usedAt),
          gt(invitationsTable.expiresAt, new Date())
        )
      )
      .orderBy(invitationsTable.createdAt);

    res.json({
      invites: pending.map(i => ({
        token: i.token,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "List pending invites error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Resend invite ─────────────────────────────────────────────────────────────

router.post("/:token/resend", requireAuth, async (req, res) => {
  try {
    const token = String(req.params.token);

    const inviterRows = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    const inviter = inviterRows[0];

    if (!inviter?.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can resend invitations." });
      return;
    }

    const rows = await db.select().from(invitationsTable).where(eq(invitationsTable.token, token));
    const invite = rows[0];

    if (!invite) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    // Verify the invite was created by this admin specifically (stable ID-based ownership, not mutable companyName)
    if (invite.invitedById !== String(inviter.id)) {
      res.status(403).json({ error: "forbidden", message: "You do not have permission to manage this invitation." });
      return;
    }

    if (invite.usedAt) {
      res.status(400).json({ error: "already_used", message: "This invitation has already been accepted" });
      return;
    }

    // Extend expiry on resend
    const newExpiry = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await db.update(invitationsTable)
      .set({ expiresAt: newExpiry })
      .where(eq(invitationsTable.token, token));

    const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : "Your team";

    await sendTokenInviteEmail(
      { toEmail: invite.email, inviteeName: null, inviterName, companyName: invite.companyName ?? null, token },
      req.log
    );

    req.log.info({ email: invite.email, company: invite.companyName }, "Invite resent");
    res.json({ success: true, message: `Invite resent to ${invite.email}` });
  } catch (err) {
    req.log.error({ err }, "Resend invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to resend invite" });
  }
});

// ── Revoke invite ─────────────────────────────────────────────────────────────

router.delete("/:token", requireAuth, async (req, res) => {
  try {
    const token = String(req.params.token);

    const callerRows = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id));
    const caller = callerRows[0];

    if (!caller?.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can revoke invitations." });
      return;
    }

    const rows = await db.select().from(invitationsTable).where(eq(invitationsTable.token, token));
    const invite = rows[0];

    if (!invite) {
      res.status(404).json({ error: "not_found", message: "Invitation not found" });
      return;
    }

    // Verify the invite was created by this admin specifically (stable ID-based ownership, not mutable companyName)
    if (invite.invitedById !== String(caller.id)) {
      res.status(403).json({ error: "forbidden", message: "You do not have permission to revoke this invitation." });
      return;
    }

    await db.delete(invitationsTable).where(eq(invitationsTable.token, token));

    req.log.info({ token, email: invite.email }, "Invite revoked");
    res.json({ success: true, message: "Invitation revoked" });
  } catch (err) {
    req.log.error({ err }, "Revoke invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to revoke invite" });
  }
});

// ── Validate token (public) ───────────────────────────────────────────────────

router.get("/validate/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const rows = await db.select().from(invitationsTable).where(eq(invitationsTable.token, token));
    const invite = rows[0];

    if (!invite) {
      res.status(404).json({ error: "invalid_token", message: "This invitation link is invalid." });
      return;
    }
    if (invite.usedAt) {
      res.status(410).json({ error: "already_used", message: "This invitation has already been used." });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(410).json({ error: "expired", message: "This invitation has expired. Ask your administrator to resend it." });
      return;
    }

    res.json({
      email: invite.email,
      companyName: invite.companyName,
      role: invite.role,
    });
  } catch (err) {
    req.log.error({ err }, "Validate token error");
    res.status(500).json({ error: "internal_error", message: "Failed to validate token" });
  }
});

// ── Accept invite (public) ────────────────────────────────────────────────────

router.post("/accept", async (req, res) => {
  try {
    const { token, firstName, lastName, password, marketingEmailOptIn } = req.body as {
      token?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
      marketingEmailOptIn?: boolean;
    };

    if (!token || !firstName || !lastName || !password) {
      res.status(400).json({ error: "bad_request", message: "token, firstName, lastName and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters." });
      return;
    }

    const rows = await db.select().from(invitationsTable).where(eq(invitationsTable.token, token));
    const invite = rows[0];

    if (!invite) {
      res.status(404).json({ error: "invalid_token", message: "This invitation link is invalid." });
      return;
    }
    if (invite.usedAt) {
      res.status(410).json({ error: "already_used", message: "This invitation has already been used." });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(410).json({ error: "expired", message: "This invitation has expired. Ask your administrator to resend it." });
      return;
    }

    // Check email not already taken.
    // IMPORTANT: we do NOT mark the token as used here — the conflict is not a
    // successful acceptance, so the token stays valid for the intended recipient.
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, invite.email));
    if (existing.length > 0) {
      const existingUser = existing[0];
      // Cross-org conflict: email belongs to a different organisation → different message.
      const sameOrg = existingUser.adminUserId === invite.invitedById
        || existingUser.id === parseInt(invite.invitedById);
      if (sameOrg) {
        // Already a member of this org — direct them to sign in.
        res.status(409).json({
          error: "already_member",
          message: "You are already a member of this organisation. Please sign in to your existing account.",
        });
      } else {
        // Account exists in a different organisation — prevent cross-org join.
        res.status(409).json({
          error: "conflict",
          message: "An account with this email already exists in a different organisation. Please contact support if you need to switch organisations.",
        });
      }
      return;
    }

    // ── Verify the inviting organisation still exists and is active ──────────────
    // Guard against org-linkage to deleted or deactivated admin accounts.
    // If the org owner no longer exists or is inactive, the invite is no longer valid.
    const adminRows = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(invite.invitedById)));
    const adminUser = adminRows[0];
    if (!adminUser || !adminUser.isActive) {
      res.status(410).json({
        error: "org_unavailable",
        message: "The organisation that sent this invitation is no longer available. Please contact support.",
      });
      return;
    }

    // Determine mobile_only based on invite's userType and admin's plan
    // If admin is on free_trial plan, all team members are mobile-only regardless.
    // Otherwise, respect the userType chosen when the invite was sent:
    //   "inspector" = mobile app only → mobileOnly: true
    //   "user"      = web only        → mobileOnly: false
    //   "both"      = full access     → mobileOnly: false
    const adminPlan = adminUser.plan ?? "free_trial";
    const planForcesAppOnly = isMobileOnly(adminPlan);
    const inviteUserType = invite.userType ?? "both";
    const mobileOnly = planForcesAppOnly || inviteUserType === "inspector";

    // Re-check seat limit at accept time using adminUserId linkage (not companyName).
    // adminUser is guaranteed non-null here (validated above).
    const limits = getLimits(adminPlan);
    if (limits.maxTeamMembers !== null) {
      const [{ value: currentMemberCount }] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.adminUserId, String(adminUser.id)));
      if (currentMemberCount >= limits.maxTeamMembers) {
        res.status(402).json({
          error: "team_limit_reached",
          message: `The organisation's ${limits.label} plan is at its team member limit (${limits.maxTeamMembers}). Please ask your admin to upgrade before accepting this invitation.`,
        });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Validate and reject corrupted/tampered permissions before creating the user.
    let permissions: string;
    try {
      const rawPerms = JSON.parse(invite.permissions ?? "{}");
      const validated = validatePermissions(rawPerms);
      if (!validated.ok) {
        res.status(400).json({ error: "bad_request", message: "Invite contains invalid permission data. Please contact your administrator." });
        return;
      }
      permissions = JSON.stringify(validated.data);
    } catch {
      res.status(400).json({ error: "bad_request", message: "Invite contains malformed permission data. Please contact your administrator." });
      return;
    }

    const optedIn = marketingEmailOptIn === true;
    const [newUser] = await db.insert(usersTable).values({
      email: invite.email,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: invite.role,
      companyName: invite.companyName ?? null,
      isActive: true,
      isCompanyAdmin: false,
      userType: mobileOnly ? "inspector" : inviteUserType,
      permissions,
      mobileOnly,
      adminUserId: invite.invitedById,
      requiresPasswordChange: true,
      marketingEmailOptIn: optedIn,
      marketingEmailOptInAt: optedIn ? new Date() : null,
      marketingEmailSource: optedIn ? "inspectproof_signup" : null,
      marketingEmailScope: optedIn ? "inspectproof_and_related_updates" : null,
    }).returning();

    // Create initial user_organisations record for this new user
    await db.insert(userOrganisationsTable).values({
      userId: newUser.id,
      orgAdminId: parseInt(invite.invitedById),
      role: invite.role,
      permissions,
      status: "active",
      invitedById: parseInt(invite.invitedById),
      joinedAt: new Date(),
    }).onConflictDoNothing();

    // Mark token as used
    await db.update(invitationsTable).set({ usedAt: new Date() }).where(eq(invitationsTable.token, token));

    const authToken = createSessionToken(newUser.id);

    req.log.info({ userId: newUser.id, email: newUser.email, company: invite.companyName }, "Invite accepted — account created");

    res.status(201).json({
      token: authToken,
      mobileOnly,
      requiresPasswordChange: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        phone: newUser.phone,
        avatar: newUser.avatar,
        companyName: newUser.companyName ?? null,
        isAdmin: false,
        isCompanyAdmin: false,
        userType: newUser.userType,
        permissions: JSON.parse(permissions),
        isActive: true,
        mobileOnly,
        requiresPasswordChange: true,
        createdAt: newUser.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Accept invite error");
    res.status(500).json({ error: "internal_error", message: "Failed to accept invitation" });
  }
});

export default router;
