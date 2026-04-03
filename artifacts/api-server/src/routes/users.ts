import { Router, type IRouter } from "express";
import { eq, and, or, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { sendWelcomeWithCredentialsEmail } from "../lib/email";
import { requireAuth } from "../middleware/auth";
import { getLimits } from "../lib/planLimits";

const router: IRouter = Router();

function parsePermissions(raw: string | null | undefined) {
  if (!raw) return { editTemplates: false, addInspectors: false, createProjects: false };
  try { return JSON.parse(raw); } catch { return { editTemplates: false, addInspectors: false, createProjects: false }; }
}

function formatUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    phone: u.phone,
    avatar: u.avatar,
    signatureUrl: u.signatureUrl ?? null,
    profession: u.profession ?? null,
    licenceNumber: u.licenceNumber ?? null,
    companyName: u.companyName ?? null,
    isActive: u.isActive,
    isCompanyAdmin: u.isCompanyAdmin ?? false,
    userType: u.userType ?? "inspector",
    permissions: parsePermissions(u.permissions),
    mobileOnly: u.mobileOnly ?? false,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const caller = req.authUser!;
    let users;

    if (caller.isCompanyAdmin) {
      users = await db.select().from(usersTable)
        .where(
          or(
            eq(usersTable.id, caller.id),
            eq(usersTable.adminUserId, String(caller.id))
          )
        )
        .orderBy(usersTable.firstName);
    } else if (caller.isAdmin) {
      users = await db.select().from(usersTable).orderBy(usersTable.firstName);
    } else {
      users = await db.select().from(usersTable)
        .where(eq(usersTable.id, caller.id));
    }

    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const creator = req.authUser!;

    // Only company admins or platform admins may create team members
    if (!creator.isCompanyAdmin && !creator.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only organisation admins can add team members." });
      return;
    }

    const data = req.body;
    if (!data.email || !data.firstName || !data.lastName) {
      res.status(400).json({ error: "bad_request", message: "First name, last name, and email are required" });
      return;
    }

    // ── Team member quota check ──────────────────────────────────────────────
    // Count existing team members linked to this admin via adminUserId
    const limits = getLimits(creator.plan ?? "free_trial");
    if (limits.maxTeamMembers !== null) {
      const [{ value: currentCount }] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.adminUserId, String(creator.id)));

      if (currentCount >= limits.maxTeamMembers) {
        res.status(402).json({
          error: "team_limit_reached",
          message: `Your ${limits.label} plan allows up to ${limits.maxTeamMembers} team member${limits.maxTeamMembers === 1 ? "" : "s"}. Upgrade your plan or contact contact@inspectproof.com.au to add more.`,
          plan: creator.plan,
          limit: limits.maxTeamMembers,
          current: currentCount,
        });
        return;
      }
    }

    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "An account with this email already exists." });
      return;
    }

    const temporaryPassword = data.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    const inheritedCompany = creator.companyName ?? data.companyName ?? null;

    const userType: string = data.userType ?? "inspector";
    const defaultPerms = { editTemplates: false, addInspectors: false, createProjects: false };
    const permissions = data.permissions
      ? JSON.stringify({ ...defaultPerms, ...data.permissions })
      : JSON.stringify(defaultPerms);

    // "inspector" userType = mobile app only → restrict from web portal
    const mobileOnly = userType === "inspector";

    // Determine the admin this member belongs to:
    // - If the creator is a company admin, they ARE the admin → adminUserId = creator.id
    // - If the creator is a platform super-admin acting on behalf of an org, preserve any
    //   adminUserId supplied in the request body; otherwise fall back to creator.id
    const resolvedAdminUserId = creator.isCompanyAdmin
      ? String(creator.id)
      : (data.adminUserId ? String(data.adminUserId) : String(creator.id));

    const [user] = await db.insert(usersTable).values({
      email: normalizedEmail,
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      role: data.role || "inspector",
      phone: data.phone || null,
      companyName: inheritedCompany,
      isActive: true,
      isCompanyAdmin: false,
      userType,
      mobileOnly,
      permissions,
      requiresPasswordChange: true,
      adminUserId: resolvedAdminUserId,
    }).returning();

    res.status(201).json({ ...formatUser(user), temporaryPassword });

    if (data.sendWelcomeEmail !== false) {
      const inviterName = data.inviterName || "Your team administrator";
      sendWelcomeWithCredentialsEmail(
        { toEmail: normalizedEmail, firstName: data.firstName.trim(), temporaryPassword, inviterName },
        req.log
      ).catch(() => {});
    }
  } catch (err) {
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "internal_error" });
  }
});

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Save or update the caller's Expo push token
router.put("/me/push-token", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    const [updated] = await db.update(usersTable)
      .set({ expoPushToken: token ?? null, updatedAt: new Date() })
      .where(eq(usersTable.id, req.authUser!.id))
      .returning();
    res.json({ ok: true, expoPushToken: updated?.expoPushToken ?? null });
  } catch (err) {
    req.log.error({ err }, "Save push token error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Update notification preferences for the caller
router.patch("/me/notification-prefs", requireAuth, async (req, res) => {
  try {
    const { notifyOnAssignment } = req.body;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (typeof notifyOnAssignment === "boolean") updateData.notifyOnAssignment = notifyOnAssignment;
    const [updated] = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, req.authUser!.id))
      .returning();
    res.json({ ok: true, notifyOnAssignment: updated?.notifyOnAssignment ?? true });
  } catch (err) {
    req.log.error({ err }, "Update notification prefs error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const caller = req.authUser!;

    // ── Authorization check ──────────────────────────────────────────────────
    // Allowed if any of:
    //   1. The caller is the target user (updating their own profile)
    //   2. The caller is a company admin and the target is one of their team members
    //      (adminUserId === String(caller.id))
    //   3. The caller is a platform super-admin (isAdmin)
    if (caller.id !== id && !caller.isAdmin) {
      if (!caller.isCompanyAdmin) {
        res.status(403).json({ error: "forbidden", message: "You do not have permission to modify this user." });
        return;
      }
      // Verify the target user belongs to this company admin
      const [target] = await db.select({ adminUserId: usersTable.adminUserId })
        .from(usersTable)
        .where(eq(usersTable.id, id));

      if (!target || target.adminUserId !== String(caller.id)) {
        res.status(403).json({ error: "forbidden", message: "You do not have permission to modify this user." });
        return;
      }
    }

    const { phone, firstName, lastName, role, signatureUrl, profession, licenceNumber,
            companyName, isActive, userType, permissions } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (phone !== undefined) updateData.phone = phone;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (signatureUrl !== undefined) updateData.signatureUrl = signatureUrl;
    if (profession !== undefined) updateData.profession = profession;
    if (licenceNumber !== undefined) updateData.licenceNumber = licenceNumber;
    if (companyName !== undefined && caller.isAdmin) updateData.companyName = companyName;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (userType !== undefined) {
      updateData.userType = userType;
      updateData.mobileOnly = userType === "inspector";
    }
    if (permissions !== undefined) updateData.permissions = JSON.stringify(permissions);

    // isCompanyAdmin:
    //   - Platform super-admin: can set on anyone
    //   - Company admin: can promote/demote their own team members only
    //     (target's adminUserId must be their own id — already verified above)
    //   - Regular team members: blocked
    if (typeof req.body.isCompanyAdmin === "boolean") {
      if (caller.isAdmin || caller.isCompanyAdmin) {
        updateData.isCompanyAdmin = req.body.isCompanyAdmin;
      }
    }

    const [updated] = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(formatUser(updated));
  } catch (err) {
    req.log.error({ err }, "Update user error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
