import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decodeSessionToken } from "../lib/session-token";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  isAdmin: boolean;
  isCompanyAdmin: boolean;
  companyName: string | null;
  adminUserId: string | null;
  plan: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  if (authHeader.startsWith("Basic ")) return authHeader.slice(6);
  return null;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (token) {
      const { userId, valid } = decodeSessionToken(token);
      if (valid && userId) {
        const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (users[0]) {
          req.authUser = {
            id: users[0].id,
            email: users[0].email,
            role: users[0].role,
            isAdmin: users[0].isAdmin ?? false,
            isCompanyAdmin: users[0].isCompanyAdmin ?? false,
            companyName: users[0].companyName ?? null,
            adminUserId: users[0].adminUserId ?? null,
            plan: users[0].plan ?? "free_trial",
          };
        }
      }
    }
  } catch {
  }
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  await optionalAuth(req, res, async () => {
    if (!req.authUser) {
      res.status(401).json({ error: "unauthorized", message: "Authentication required." });
      return;
    }
    next();
  });
}

export const INSPECTOR_ROLES = new Set(["inspector", "building_inspector"]);

export function isInspectorOnly(user: AuthUser): boolean {
  return INSPECTOR_ROLES.has(user.role) && !user.isAdmin;
}
