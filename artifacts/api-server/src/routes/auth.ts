import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/login", async (req, res) => {
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

    const storedHash = user.passwordHash;
    const isBcryptHash = storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$");
    const passwordMatch = isBcryptHash
      ? await bcrypt.compare(password, storedHash)
      : storedHash === password;

    if (!passwordMatch) {
      res.status(401).json({ error: "unauthorized", message: "Invalid credentials" });
      return;
    }

    const token = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString("base64");

    res.json({
      token,
      user: {
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
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, organization, plan, profession } = req.body;

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

    const passwordHash = await bcrypt.hash(password, 12);

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
    }).returning();

    const token = Buffer.from(`${newUser.id}:${newUser.email}:${Date.now()}`).toString("base64");

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

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }

    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [userIdStr] = decoded.split(":");
    const userId = parseInt(userIdStr);

    if (isNaN(userId)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
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
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [userIdStr] = decoded.split(":");
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
      res.status(401).json({ error: "unauthorized", message: "Invalid token" });
      return;
    }

    const { firstName, lastName, phone, avatar, companyName } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (firstName !== undefined) updates.firstName = firstName.trim();
    if (lastName !== undefined) updates.lastName = lastName.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (avatar !== undefined) updates.avatar = avatar || null;
    if (companyName !== undefined) updates.companyName = companyName?.trim() || null;

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

// ── Change password ────────────────────────────────────────────────────────────

router.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [userIdStr] = decoded.split(":");
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
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

    const isBcryptHash = user.passwordHash.startsWith("$2a$") || user.passwordHash.startsWith("$2b$");
    const match = isBcryptHash
      ? await bcrypt.compare(currentPassword, user.passwordHash)
      : user.passwordHash === currentPassword;

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

// ── Delete account ─────────────────────────────────────────────────────────────

router.delete("/account", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized", message: "No token" });
      return;
    }
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [userIdStr] = decoded.split(":");
    const userId = parseInt(userIdStr);
    if (isNaN(userId)) {
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
