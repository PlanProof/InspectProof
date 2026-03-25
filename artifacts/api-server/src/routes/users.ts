import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

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
    isActive: u.isActive,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.firstName);
    res.json(users.map(formatUser));
  } catch (err) {
    req.log.error({ err }, "List users error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const [user] = await db.insert(usersTable).values({
      email: data.email,
      passwordHash: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      phone: data.phone,
      isActive: true,
    }).returning();
    res.status(201).json(formatUser(user));
  } catch (err) {
    req.log.error({ err }, "Create user error");
    res.status(500).json({ error: "internal_error" });
  }
});

// Update user profile (phone, signatureUrl, etc.)
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { phone, firstName, lastName, role, signatureUrl } = req.body;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (phone !== undefined) updateData.phone = phone;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (signatureUrl !== undefined) updateData.signatureUrl = signatureUrl;

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
