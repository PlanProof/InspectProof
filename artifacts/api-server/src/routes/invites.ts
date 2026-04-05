import { Router, type IRouter } from "express";
import { eq, and, isNull, gt, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, usersTable, invitationsTable } from "@workspace/db";
import { sendTokenInviteEmail } from "../lib/email";
import { requireAuth } from "../middleware/auth";
import { getLimits } from "../lib/planLimits";
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

    if (!inviter.isCompanyAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can send invitations." });
      return;
    }

    const companyName = inviter.companyName ?? null;

    // ── Seat limit check ──────────────────────────────────────────────────────
    // Count only team members (users with adminUserId = inviter.id), not the admin themselves.
    const limits = getLimits(inviter.plan ?? "free_trial");
    if (limits.maxTeamMembers !== null) {
      const [{ value: currentMemberCount }] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.adminUserId, String(inviter.id)));
      if (currentMemberCount >= limits.maxTeamMembers) {
        res.status(402).json({
          error: "team_limit_reached",
          message: `Your ${limits.label} plan allows up to ${limits.maxTeamMembers} team member${limits.maxTeamMembers === 1 ? "" : "s"}. Upgrade your plan to invite more.`,
          plan: inviter.plan,
          limit: limits.maxTeamMembers,
          current: currentMemberCount,
        });
        return;
      }
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if already a member
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "An account with this email already exists." });
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
      invitedById: String(inviter.id),
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
    const { token } = req.params;

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
    const { token } = req.params;

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
    const { token, firstName, lastName, password } = req.body as {
      token?: string;
      firstName?: string;
      lastName?: string;
      password?: string;
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

    // Check email not already taken
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, invite.email));
    if (existing.length > 0) {
      // Mark token used to clean up
      await db.update(invitationsTable).set({ usedAt: new Date() }).where(eq(invitationsTable.token, token));
      res.status(409).json({ error: "conflict", message: "An account with this email already exists. Please sign in." });
      return;
    }

    // Determine mobile_only based on invite's userType and admin's plan
    // If admin is on free_trial plan, all team members are mobile-only regardless.
    // Otherwise, respect the userType chosen when the invite was sent:
    //   "inspector" = mobile app only → mobileOnly: true
    //   "user"      = web only        → mobileOnly: false
    //   "both"      = full access     → mobileOnly: false
    const adminRows = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(invite.invitedById)));
    const adminUser = adminRows[0];
    const adminPlan = adminUser?.plan ?? "free_trial";
    const planForcesAppOnly = isMobileOnly(adminPlan);
    const inviteUserType = invite.userType ?? "both";
    const mobileOnly = planForcesAppOnly || inviteUserType === "inspector";

    // Re-check seat limit at accept time using adminUserId linkage (not companyName)
    if (adminUser) {
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
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const permissions = invite.permissions ?? JSON.stringify({ editTemplates: false, addInspectors: false, createProjects: false });

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
    }).returning();

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
