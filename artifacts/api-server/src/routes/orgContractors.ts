import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, orgContractorsTable } from "@workspace/db";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

function scopeKey(authUser: { companyName?: string | null; id: number }): string {
  return authUser.companyName?.trim() || `user:${authUser.id}`;
}

router.get("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  try {
    const contractors = await db
      .select()
      .from(orgContractorsTable)
      .where(eq(orgContractorsTable.companyName, scope))
      .orderBy(orgContractorsTable.name);
    res.json(contractors);
  } catch (err) {
    req.log.error({ err }, "List org contractors error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const { name, trade, email, company } = req.body as { name?: string; trade?: string; email?: string; company?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "bad_request", message: "name is required" });
    return;
  }
  try {
    const [created] = await db
      .insert(orgContractorsTable)
      .values({
        companyName: scope,
        name: name.trim(),
        trade: (trade ?? "").trim(),
        email: email?.trim() || null,
        company: company?.trim() || null,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Create org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const contractorId = parseInt(req.params.id, 10);
  if (isNaN(contractorId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid contractor id" });
    return;
  }
  const { name, trade, email, company } = req.body as { name?: string; trade?: string; email?: string; company?: string };
  if (name !== undefined && !name.trim()) {
    res.status(400).json({ error: "bad_request", message: "name cannot be empty" });
    return;
  }
  const updates: Partial<{ name: string; trade: string; email: string | null; company: string | null; updatedAt: Date }> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (trade !== undefined) updates.trade = trade.trim();
  if (email !== undefined) updates.email = email.trim() || null;
  if (company !== undefined) updates.company = company.trim() || null;
  try {
    const [updated] = await db
      .update(orgContractorsTable)
      .set(updates)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Update org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const scope = scopeKey(req.authUser!);
  const contractorId = parseInt(req.params.id, 10);
  if (isNaN(contractorId)) {
    res.status(400).json({ error: "bad_request", message: "Invalid contractor id" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(orgContractorsTable)
      .where(and(eq(orgContractorsTable.id, contractorId), eq(orgContractorsTable.companyName, scope)))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Delete org contractor error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
