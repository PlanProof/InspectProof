import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch (err: any) {
    dbError = err?.message ?? "unknown";
  }

  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk ? "connected" : "unavailable",
    ...(dbError ? { dbError } : {}),
    timestamp: new Date().toISOString(),
  });
});

export default router;
