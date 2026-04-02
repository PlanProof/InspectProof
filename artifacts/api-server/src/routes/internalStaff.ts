import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, internalStaffTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res) => {
  const companyName = req.authUser!.companyName;
  if (!companyName) {
    res.json([]);
    return;
  }
  try {
    const staff = await db
      .select()
      .from(internalStaffTable)
      .where(eq(internalStaffTable.companyName, companyName))
      .orderBy(internalStaffTable.name);
    res.json(staff);
  } catch (err) {
    req.log.error({ err }, "List internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const companyName = req.authUser!.companyName;
  if (!companyName) {
    res.status(400).json({ error: "bad_request", message: "No company associated with your account" });
    return;
  }
  const { name, role, email } = req.body as { name?: string; role?: string; email?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    const [created] = await db
      .insert(internalStaffTable)
      .values({ companyName, name: name.trim(), role: (role ?? "").trim(), email: email?.trim() || null })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Create internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const companyName = req.authUser!.companyName;
  const staffId = parseInt(req.params.id, 10);
  if (isNaN(staffId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid staff id" });
    return;
  }
  if (!companyName) {
    res.status(400).json({ error: "bad_request", message: "No company associated with your account" });
    return;
  }
  const { name, role, email } = req.body as { name?: string; role?: string; email?: string };
  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: "bad_request", message: "name cannot be empty" });
    return;
  }
  const updates: Partial<{ name: string; role: string; email: string | null; updatedAt: Date }> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (role !== undefined) updates.role = role.trim();
  if (email !== undefined) updates.email = email.trim() || null;
  try {
    const [updated] = await db
      .update(internalStaffTable)
      .set(updates)
      .where(and(eq(internalStaffTable.id, staffId), eq(internalStaffTable.companyName, companyName)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Update internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const companyName = req.authUser!.companyName;
  const staffId = parseInt(req.params.id, 10);
  if (isNaN(staffId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid staff id" });
    return;
  }
  if (!companyName) {
    res.status(400).json({ error: "bad_request", message: "No company associated with your account" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(internalStaffTable)
      .where(and(eq(internalStaffTable.id, staffId), eq(internalStaffTable.companyName, companyName)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
