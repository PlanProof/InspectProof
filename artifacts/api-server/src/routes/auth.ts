import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { db, usersTable, pool } from "@workspace/db";
import { sendPasswordResetEmail, sendWelcomeEmail, sendEmailVerificationEmail } from "../lib/email";
import { createSessionToken, decodeSessionToken } from "../lib/session-token";

export { createSessionToken, decodeSessionToken };

const _SECRET = process.env.APP_SECRET || process.env.SESSION_SECRET;
if (!_SECRET) {
  throw new Error("APP_SECRET (or SESSION_SECRET) environment variable is required but not set.");
}
const APP_SECRET: string = _SECRET;

// ── Reset token helpers (HMAC-SHA256 signed, 1 hour) ─────────────────────────

function createResetToken(userId: number): string {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}:${expiry}`;
  const sig = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

function verifyResetToken(token: string): { userId: number; valid: boolean; expired: boolean } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = raw.lastIndexOf(":");
    if (lastColon === -1) return { userId: 0, valid: false, expired: false };
    const sig = raw.slice(lastColon + 1);
    const data = raw.slice(0, lastColon);
    const parts = data.split(":");
    if (parts.length !== 2) return { userId: 0, valid: false, expired: false };
    const userId = parseInt(parts[0], 10);
    const expiry = parseInt(parts[1], 10);
    if (isNaN(userId) || isNaN(expiry)) return { userId: 0, valid: false, expired: false };
    const now = Math.floor(Date.now() / 1000);
    const expected = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
    if (expected !== sig) return { userId: 0, valid: false, expired: false };
    if (now > expiry) return { userId, valid: false, expired: true };
    return { userId, valid: true, expired: false };
  } catch {
    return { userId: 0, valid: false, expired: false };
  }
}

// ── Email verification token helpers (HMAC-SHA256 signed, 24 hours) ──────────

function createEmailVerificationToken(userId: number): string {
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours
  const data = `ev:${userId}:${expiry}`;
  const sig = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

function verifyEmailVerificationToken(token: string): { userId: number; valid: boolean; expired: boolean } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = raw.lastIndexOf(":");
    if (lastColon === -1) return { userId: 0, valid: false, expired: false };
    const sig = raw.slice(lastColon + 1);
    const data = raw.slice(0, lastColon);
    const parts = data.split(":");
    if (parts.length !== 3 || parts[0] !== "ev") return { userId: 0, valid: false, expired: false };
    const userId = parseInt(parts[1], 10);
    const expiry = parseInt(parts[2], 10);
    if (isNaN(userId) || isNaN(expiry)) return { userId: 0, valid: false, expired: false };
    const now = Math.floor(Date.now() / 1000);
    const expected = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
    if (expected !== sig) return { userId: 0, valid: false, expired: false };
    if (now > expiry) return { userId, valid: false, expired: true };
    return { userId, valid: true, expired: false };
  } catch {
    return { userId: 0, valid: false, expired: false };
  }
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many login attempts. Please wait 15 minutes before trying again." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many registration attempts. Please try again in an hour." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many password reset requests. Please try again in an hour." },
});

// ── Shared user shape ─────────────────────────────────────────────────────────

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    signatureUrl: user.signatureUrl ?? null,
    companyName: user.companyName ?? null,
    profession: user.profession ?? null,
    licenceNumber: user.licenceNumber ?? null,
    isAdmin: user.isAdmin ?? false,
    isCompanyAdmin: user.isCompanyAdmin ?? false,
    userType: user.userType ?? "inspector",
    permissions: user.permissions ? JSON.parse(user.permissions) : null,
    isActive: user.isActive,
    mobileOnly: user.mobileOnly ?? false,
    requiresPasswordChange: user.requiresPasswordChange ?? false,
    createdAt: user.createdAt.toISOString(),
  };
}

const router: IRouter = Router();

// ── Login ─────────────────────────────────────────────────────────────────────

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "bad_request", message: "Email and password required" });
      return;
    }

    const users = await db.select().from(usersTable).where(eq(usersTable.email, email));
    const user = users[0];

    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }

    const token = createSessionToken(user.id);

    res.json({ token, user: formatUser(user) });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Register ──────────────────────────────────────────────────────────────────

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, organization, plan, profession, marketingEmailOptIn, marketingOptIn } = req.body;

    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: "bad_request", message: "First name, last name, email and password are required." });
      return;
    }
    if (!organization || !organization.trim()) {
      res.status(400).json({ error: "bad_request", message: "Company or organisation name is required." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters." });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "An account with this email already exists." });
      return;
    }

    // Prevent self-attachment to an existing organisation by name — only invite tokens may do that.
    const existingOrg = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.companyName, organization.trim()));
    if (existingOrg.length > 0) {
      res.status(409).json({
        error: "org_name_taken",
        message: "An organisation with that name already exists. If you were invited to join, please use the link in your invitation email.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const optedIn = marketingEmailOptIn === true || marketingOptIn === true;
    const [newUser] = await db.insert(usersTable).values({
      email: email.toLowerCase().trim(),
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role || "inspector",
      profession: profession ? profession.trim() : null,
      companyName: organization ? organization.trim() : null,
      isActive: true,
      isCompanyAdmin: true,
      userType: "user",
      permissions: JSON.stringify({ editTemplates: true, addInspectors: true, createProjects: true }),
      marketingEmailOptIn: optedIn,
      marketingEmailOptInAt: optedIn ? new Date() : null,
      marketingEmailSource: optedIn ? "inspectproof_signup" : null,
      marketingEmailScope: optedIn ? "inspectproof_and_related_updates" : null,
    }).returning();

    const token = createSessionToken(newUser.id);

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcomeEmail(
      {
        toEmail: newUser.email,
        firstName: newUser.firstName,
        companyName: newUser.companyName ?? organization.trim(),
      },
      req.log,
    ).catch(() => {});

    // Send email verification link (non-blocking)
    const APP_BASE_URL = process.env.APP_BASE_URL ?? "";
    if (APP_BASE_URL) {
      const verificationToken = createEmailVerificationToken(newUser.id);
      const verificationUrl = `${APP_BASE_URL}/verify-email?token=${verificationToken}`;
      sendEmailVerificationEmail(
        { toEmail: newUser.email, firstName: newUser.firstName, verificationUrl },
        req.log,
      ).catch(() => {});
    }

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        phone: newUser.phone,
        avatar: newUser.avatar,
        signatureUrl: newUser.signatureUrl ?? null,
        companyName: newUser.companyName ?? null,
        profession: newUser.profession ?? null,
        isAdmin: newUser.isAdmin ?? false,
        isCompanyAdmin: newUser.isCompanyAdmin ?? true,
        userType: newUser.userType ?? "user",
        permissions: newUser.permissions ? JSON.parse(newUser.permissions) : { editTemplates: true, addInspectors: true, createProjects: true },
        isActive: newUser.isActive,
        mobileOnly: false,
        requiresPasswordChange: false,
        createdAt: newUser.createdAt.toISOString(),
      },
      plan: plan || "starter",
    });
  } catch (err: any) {
    req.log.error({ err }, "Register error");
    const isDbError = err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND" || err?.message?.includes("connect");
    res.status(500).json({
      error: "internal_error",
      message: isDbError
        ? "Database connection failed. Please contact support."
        : "Server error",
    });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }

    const token = authHeader.slice(7);
    const { userId, valid, expired } = decodeSessionToken(token);

    if (!valid || expired) {
      res.status(401).json({ error: "unauthorized", message: expired ? "Session expired" : "Invalid token" });
      return;
    }

    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const user = users[0];

    if (!user) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
      signatureUrl: user.signatureUrl ?? null,
      profession: user.profession ?? null,
      licenceNumber: user.licenceNumber ?? null,
      companyName: user.companyName ?? null,
      isActive: user.isActive,
      isAdmin: user.isAdmin ?? false,
      isCompanyAdmin: user.isCompanyAdmin ?? false,
      userType: user.userType ?? "inspector",
      permissions: user.permissions ? JSON.parse(user.permissions) : null,
      plan: user.plan,
      mobileOnly: user.mobileOnly ?? false,
      requiresPasswordChange: user.requiresPasswordChange ?? false,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Update profile ─────────────────────────────────────────────────────────────

router.patch("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const token = authHeader.slice(7);
    const { userId, valid, expired } = decodeSessionToken(token);
    if (!valid || expired) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
      return;
    }

    const { firstName, lastName, phone, avatar } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (firstName !== undefined) updates.firstName = firstName.trim();
    if (lastName !== undefined) updates.lastName = lastName.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (avatar !== undefined) updates.avatar = avatar || null;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, userId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }

    res.json({
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      role: updated.role,
      phone: updated.phone,
      avatar: updated.avatar,
      companyName: updated.companyName ?? null,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Update profile error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Organisation settings ──────────────────────────────────────────────────────

router.get("/organisation", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "not_found" }); return; }

    // Team members inherit org details from their company admin's record.
    // For reminder settings, always read from the canonical primary admin (lowest-id company admin
    // with the same companyName) to ensure GET returns the same record the job and PATCH use.
    let orgUser = user;
    if (!user.isCompanyAdmin && user.adminUserId) {
      const adminId = parseInt(user.adminUserId);
      if (!isNaN(adminId)) {
        const [adminRecord] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
        if (adminRecord) orgUser = adminRecord;
      }
    }

    // Resolve primary admin for reminder settings
    let prefsSource = orgUser;
    if (orgUser.companyName) {
      const [primaryAdmin] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.companyName, orgUser.companyName), eq(usersTable.isCompanyAdmin, true), eq(usersTable.isActive, true)))
        .orderBy(usersTable.id);
      if (primaryAdmin) prefsSource = primaryAdmin;
    }

    const orgPrefs: Record<string, unknown> = prefsSource.notificationPrefs
      ? (() => { try { return JSON.parse(prefsSource.notificationPrefs!) as Record<string, unknown>; } catch { return {}; } })()
      : {};

    res.json({
      name: orgUser.companyName ?? "",
      abn: orgUser.abn ?? "",
      acn: orgUser.acn ?? "",
      phone: orgUser.companyPhone ?? "",
      email: orgUser.companyEmail ?? "",
      address: orgUser.companyAddress ?? "",
      suburb: orgUser.companySuburb ?? "",
      state: orgUser.companyState ?? "NSW",
      postcode: orgUser.companyPostcode ?? "",
      website: orgUser.companyWebsite ?? "",
      logoUrl: orgUser.logoUrl ?? null,
      accredBody: orgUser.accreditationBody ?? "BPB",
      accredNum: orgUser.accreditationNumber ?? "",
      accredExpiry: orgUser.accreditationExpiry ?? "",
      plInsurer: orgUser.plInsurer ?? "",
      plPolicyNumber: orgUser.plPolicyNumber ?? "",
      plExpiry: orgUser.plExpiry ?? "",
      piInsurer: orgUser.piInsurer ?? "",
      piPolicyNumber: orgUser.piPolicyNumber ?? "",
      piExpiry: orgUser.piExpiry ?? "",
      reportFooterText: orgUser.reportFooterText ?? "",
      isCompanyAdmin: user.isCompanyAdmin ?? false,
      inspectionRemindersEnabled: orgPrefs.inspectionRemindersEnabled !== false,
      inspectionReminderLeadDays: Array.isArray(orgPrefs.inspectionReminderLeadDays)
        ? (orgPrefs.inspectionReminderLeadDays as unknown[]).filter((d): d is number => typeof d === "number" && d > 0)
        : [1, 3],
    });
  } catch (err) {
    req.log.error({ err }, "Get organisation error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/organisation", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    const [user] = await db.select({ isCompanyAdmin: usersTable.isCompanyAdmin, isAdmin: usersTable.isAdmin })
      .from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "not_found" }); return; }

    // Only company admins (or platform admins) may modify organisation details
    if (!user.isCompanyAdmin && !user.isAdmin) {
      res.status(403).json({ error: "forbidden", message: "Only company administrators can update organisation settings" });
      return;
    }

    const { name, abn, acn, phone, email, address, suburb, state, postcode, website, logoUrl, accredBody, accredNum, accredExpiry, plInsurer, plPolicyNumber, plExpiry, piInsurer, piPolicyNumber, piExpiry, reportFooterText, inspectionRemindersEnabled, inspectionReminderLeadDays } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.companyName = name?.trim() || null;
    if (abn !== undefined) updates.abn = abn?.trim() || null;
    if (acn !== undefined) updates.acn = acn?.trim() || null;
    if (phone !== undefined) updates.companyPhone = phone?.trim() || null;
    if (email !== undefined) updates.companyEmail = email?.trim() || null;
    if (address !== undefined) updates.companyAddress = address?.trim() || null;
    if (suburb !== undefined) updates.companySuburb = suburb?.trim() || null;
    if (state !== undefined) updates.companyState = state?.trim() || null;
    if (postcode !== undefined) updates.companyPostcode = postcode?.trim() || null;
    if (website !== undefined) updates.companyWebsite = website?.trim() || null;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl || null;
    if (accredBody !== undefined) updates.accreditationBody = accredBody?.trim() || null;
    if (accredNum !== undefined) updates.accreditationNumber = accredNum?.trim() || null;
    if (accredExpiry !== undefined) updates.accreditationExpiry = accredExpiry?.trim() || null;
    if (plInsurer !== undefined) updates.plInsurer = plInsurer?.trim() || null;
    if (plPolicyNumber !== undefined) updates.plPolicyNumber = plPolicyNumber?.trim() || null;
    if (plExpiry !== undefined) updates.plExpiry = plExpiry?.trim() || null;
    if (piInsurer !== undefined) updates.piInsurer = piInsurer?.trim() || null;
    if (piPolicyNumber !== undefined) updates.piPolicyNumber = piPolicyNumber?.trim() || null;
    if (piExpiry !== undefined) updates.piExpiry = piExpiry?.trim() || null;
    if (reportFooterText !== undefined) updates.reportFooterText = reportFooterText?.trim() || null;

    // Resolve the canonical org admin record: the lowest-id company admin with the same companyName.
    // Both the job and this endpoint must read/write reminder settings from the same record.
    let primaryAdminId = userId;
    if (user.isCompanyAdmin) {
      const [freshUser] = await db.select({ companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, userId));
      if (freshUser?.companyName) {
        const [primaryAdmin] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(and(eq(usersTable.companyName, freshUser.companyName), eq(usersTable.isCompanyAdmin, true), eq(usersTable.isActive, true)))
          .orderBy(usersTable.id);
        if (primaryAdmin) primaryAdminId = primaryAdmin.id;
      }
    }

    // Update reminder settings in the primary admin's notificationPrefs JSON
    if (inspectionRemindersEnabled !== undefined || inspectionReminderLeadDays !== undefined) {
      const targetId = primaryAdminId;
      const [targetUser] = await db.select({ notificationPrefs: usersTable.notificationPrefs }).from(usersTable).where(eq(usersTable.id, targetId));
      const existingPrefs: Record<string, unknown> = targetUser?.notificationPrefs
        ? (() => { try { return JSON.parse(targetUser.notificationPrefs) as Record<string, unknown>; } catch { return {}; } })()
        : {};
      if (inspectionRemindersEnabled !== undefined) existingPrefs.inspectionRemindersEnabled = inspectionRemindersEnabled;
      if (inspectionReminderLeadDays !== undefined && Array.isArray(inspectionReminderLeadDays)) {
        existingPrefs.inspectionReminderLeadDays = (inspectionReminderLeadDays as unknown[]).filter(
          (d): d is number => typeof d === "number" && d > 0
        );
      }
      // Write prefs to primary org admin record; write other fields (name, abn, etc) to authenticated user record
      await db.update(usersTable).set({ notificationPrefs: JSON.stringify(existingPrefs), updatedAt: new Date() }).where(eq(usersTable.id, targetId));
      delete updates.notificationPrefs;
    }

    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Update organisation error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Notification preferences ────────────────────────────────────────────────────

router.get("/notification-prefs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "not_found" }); return; }

    const defaults = { emailSummary: true, emailDefects: true, emailAssignments: false, pushCritical: true, pushCompletions: false, pushReminders: true, reportReady: true, weeklyDigest: false };
    const prefs = user.notificationPrefs ? { ...defaults, ...JSON.parse(user.notificationPrefs) } : defaults;
    res.json(prefs);
  } catch (err) {
    req.log.error({ err }, "Get notification prefs error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/notification-prefs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    // Whitelist only known boolean notification preference keys to prevent arbitrary field injection.
    const ALLOWED_PREF_KEYS = new Set(["emailSummary", "emailDefects", "emailAssignments", "pushCritical", "pushCompletions", "pushReminders", "reportReady", "weeklyDigest"]);

    // Read and MERGE into existing prefs — do NOT replace the whole JSON blob.
    // Other keys (e.g. inspectionRemindersEnabled, inspectionReminderLeadDays) are written
    // by the organisation settings endpoint and must survive notification-prefs updates.
    const [existingRow] = await db.select({ notificationPrefs: usersTable.notificationPrefs })
      .from(usersTable).where(eq(usersTable.id, userId));
    const existing: Record<string, unknown> = existingRow?.notificationPrefs
      ? (() => { try { return JSON.parse(existingRow.notificationPrefs); } catch { return {}; } })()
      : {};

    for (const [key, val] of Object.entries(req.body)) {
      if (ALLOWED_PREF_KEYS.has(key) && typeof val === "boolean") {
        existing[key] = val;
      }
    }

    await db.update(usersTable)
      .set({ notificationPrefs: JSON.stringify(existing), updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    res.json({ success: true, prefs: existing });
  } catch (err) {
    req.log.error({ err }, "Update notification prefs error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Marketing preferences ──────────────────────────────────────────────────────

router.get("/marketing-prefs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    const [user] = await db.select({
      marketingEmailOptIn: usersTable.marketingEmailOptIn,
      marketingEmailOptInAt: usersTable.marketingEmailOptInAt,
      marketingEmailSource: usersTable.marketingEmailSource,
      marketingEmailScope: usersTable.marketingEmailScope,
    }).from(usersTable).where(eq(usersTable.id, userId));

    if (!user) { res.status(404).json({ error: "not_found" }); return; }
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Get marketing prefs error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/marketing-prefs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "unauthorized" }); return; }
    const { userId, valid } = decodeSessionToken(authHeader.slice(7));
    if (!valid) { res.status(401).json({ error: "unauthorized" }); return; }

    const { marketingEmailOptIn } = req.body;
    if (typeof marketingEmailOptIn !== "boolean") {
      res.status(400).json({ error: "bad_request", message: "marketingEmailOptIn must be a boolean" });
      return;
    }

    await db.update(usersTable)
      .set({
        marketingEmailOptIn,
        marketingEmailOptInAt: marketingEmailOptIn ? new Date() : null,
        marketingEmailSource: marketingEmailOptIn ? "inspectproof_settings" : null,
        marketingEmailScope: marketingEmailOptIn ? "inspectproof_and_related_updates" : null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Update marketing prefs error");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── Change password ────────────────────────────────────────────────────────────

router.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const { userId, valid, expired } = decodeSessionToken(authHeader.slice(7));
    if (!valid || expired) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "bad_request", message: "Current and new password are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "bad_request", message: "New password must be at least 8 characters" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!match) {
      res.status(401).json({ error: "unauthorized", message: "Current password is incorrect" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, userId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Change password error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── First-login forced password change ────────────────────────────────────────
// Called when requiresPasswordChange=true. Does not require old password.

router.post("/set-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const { userId, valid, expired } = decodeSessionToken(authHeader.slice(7));
    if (!valid || expired) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
      return;
    }

    const { newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({ error: "bad_request", message: "New password is required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }
    if (!user.requiresPasswordChange) {
      res.status(400).json({ error: "bad_request", message: "No password change required" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable)
      .set({ passwordHash, requiresPasswordChange: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Set password error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Forgot password ────────────────────────────────────────────────────────────

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "bad_request", message: "Email is required" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    // Always return success to prevent email enumeration attacks
    if (!user || !user.isActive) {
      res.json({ success: true });
      return;
    }
    const token = createResetToken(user.id);
    const baseUrl = process.env.APP_BASE_URL || "https://inspectproof.com.au";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(
      { toEmail: user.email, firstName: user.firstName || "there", resetUrl },
      req.log,
    );
    req.log.info({ userId: user.id }, "Password reset email sent");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Forgot password error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Reset password (from email link) ──────────────────────────────────────────

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: "bad_request", message: "Token and new password are required" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "bad_request", message: "Password must be at least 8 characters" });
      return;
    }
    const { userId, valid, expired } = verifyResetToken(token);
    if (expired) {
      res.status(400).json({ error: "token_expired", message: "This reset link has expired. Please request a new one." });
      return;
    }
    if (!valid) {
      res.status(400).json({ error: "invalid_token", message: "This reset link is invalid. Please request a new one." });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user || !user.isActive) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(usersTable)
      .set({ passwordHash, requiresPasswordChange: false, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    req.log.info({ userId }, "Password reset via email link");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Reset password error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Verify email ───────────────────────────────────────────────────────────────

router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "bad_request", message: "Verification token is required." });
      return;
    }
    const { userId, valid, expired } = verifyEmailVerificationToken(token);
    if (!valid) {
      if (expired) {
        res.status(400).json({ error: "token_expired", message: "Verification link has expired. Please request a new one." });
      } else {
        res.status(400).json({ error: "invalid_token", message: "Invalid verification token." });
      }
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "not_found", message: "User not found." });
      return;
    }
    // Persist verification timestamp (column added via migration — not in Drizzle schema)
    await pool.query(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, [userId]);
    req.log.info({ userId }, "Email verified via token");
    res.json({ success: true, message: "Email verified successfully." });
  } catch (err) {
    req.log.error({ err }, "Verify email error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

// ── Delete account ─────────────────────────────────────────────────────────────

router.delete("/account", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const { userId, valid, expired } = decodeSessionToken(authHeader.slice(7));
    if (!valid || expired) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "not_found", message: "User not found" });
      return;
    }

    // Anonymise all personal data — keep the row so company/inspection FK refs don't break
    const anonymisedEmail = `deleted_${userId}_${Date.now()}@deleted.invalid`;
    const randomHash = await bcrypt.hash(`${userId}-${Date.now()}-deleted`, 12);

    await db.update(usersTable).set({
      email: anonymisedEmail,
      firstName: "Deleted",
      lastName: "User",
      phone: null,
      avatar: null,
      signatureUrl: null,
      passwordHash: randomHash,
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    req.log.info({ userId }, "Account deleted and anonymised");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete account error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
