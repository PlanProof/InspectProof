import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { sendWelcomeWithCredentialsEmail } from "../lib/email";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

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
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    let users;
    // Super-admins (isAdmin=true) see all users; company admins only see users from their own company
    if (req.authUser!.isAdmin && !req.authUser!.companyName) {
      users = await db.select().from(usersTable).orderBy(usersTable.firstName);
    } else if (req.authUser!.companyName) {
      users = await db.select().from(usersTable)
        .where(eq(usersTable.companyName, req.authUser!.companyName))
        .orderBy(usersTable.firstName);
    } else {
      // User has no company — only return themselves
      users = await db.select().from(usersTable)
        .where(eq(usersTable.id, req.authUser!.id));
    }
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data.email || !data.firstName || !data.lastName) {
      res.status(400).json({ error: "bad_request", message: "First name, last name, and email are required" });
      return;
    }

    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "An account with this email already exists." });
      return;
    }

    const temporaryPassword = data.password || generateTempPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    // New users inherit the creating user's company
    const inheritedCompany = req.authUser!.companyName ?? data.companyName ?? null;

    const [user] = await db.insert(usersTable).values({
      email: normalizedEmail,
      passwordHash,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      role: data.role || "inspector",
      phone: data.phone || null,
      companyName: inheritedCompany,
      isActive: true,
    }).returning();

    res.status(201).json({ ...formatUser(user), temporaryPassword });

    // Send welcome email with credentials (non-blocking)
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

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { phone, firstName, lastName, role, signatureUrl, profession, licenceNumber, companyName, isActive } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (phone !== undefined) updateData.phone = phone;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (signatureUrl !== undefined) updateData.signatureUrl = signatureUrl;
    if (profession !== undefined) updateData.profession = profession;
    if (licenceNumber !== undefined) updateData.licenceNumber = licenceNumber;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (isActive !== undefined) updateData.isActive = isActive;

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
