import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  isAdmin: boolean;
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
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [userIdStr] = decoded.split(":");
      const userId = parseInt(userIdStr);
      if (!isNaN(userId)) {
        const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
        if (users[0]) {
          req.authUser = {
            id: users[0].id,
            email: users[0].email,
            role: users[0].role,
            isAdmin: users[0].isAdmin ?? false,
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
