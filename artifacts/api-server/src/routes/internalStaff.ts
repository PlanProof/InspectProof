import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, internalStaffTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function scopeKey(authUser: { companyName?: string | null; id: number }): string {
  return authUser.companyName?.trim() || `user:${authUser.id}`;
}

router.get("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  try {
    const staff = await db
      .select()
      .from(internalStaffTable)
      .where(eq(internalStaffTable.companyName, scope))
      .orderBy(internalStaffTable.name);
    res.json(staff);
  } catch (err) {
    req.log.error({ err }, "List internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const { name, role, email } = req.body as { name?: string; role?: string; email?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    const [created] = await db
      .insert(internalStaffTable)
      .values({ companyName: scope, name: name.trim(), role: (role ?? "").trim(), email: email?.trim() || null })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Create internal staff error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const staffId = parseInt(req.params.id, 10);
  if (isNaN(staffId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid staff id" });
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
      .where(and(eq(internalStaffTable.id, staffId), eq(internalStaffTable.companyName, scope)))
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
  const scope = scopeKey(req.authUser!);
  const staffId = parseInt(req.params.id, 10);
  if (isNaN(staffId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid staff id" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(internalStaffTable)
      .where(and(eq(internalStaffTable.id, staffId), eq(internalStaffTable.companyName, scope)))
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
