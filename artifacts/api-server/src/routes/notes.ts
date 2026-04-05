import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, notesTable, usersTable, projectsTable } from "@workspace/db";
import { optionalAuth } from "../middleware/auth";
import { decodeSessionToken } from "../lib/session-token";

const router: IRouter = Router();

router.get("/", optionalAuth, async (req, res) => {
  try {
    const { projectId, inspectionId } = req.query;
    let notes = await db.select().from(notesTable)
      .orderBy(sql`${notesTable.createdAt} DESC`);

    // Scope to user-owned projects (admins see all; unauthenticated see nothing)
    if (req.authUser && !req.authUser.isAdmin) {
      const ownedProjects = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.createdById, req.authUser.id));
      const ownedIds = new Set(ownedProjects.map(p => p.id));
      notes = notes.filter(n => n.projectId !== null && ownedIds.has(n.projectId));
    } else if (!req.authUser) {
      notes = [];
    }

    if (projectId) notes = notes.filter(n => n.projectId === parseInt(projectId as string));
    if (inspectionId) notes = notes.filter(n => n.inspectionId === parseInt(inspectionId as string));

    const result = await Promise.all(notes.map(async (n) => {
      let authorName = "Unknown";
      if (n.authorId) {
        const users = await db.select().from(usersTable).where(eq(usersTable.id, n.authorId));
        if (users[0]) authorName = `${users[0].firstName} ${users[0].lastName}`;
      }
      return {
        id: n.id,
        projectId: n.projectId,
        inspectionId: n.inspectionId,
        content: n.content,
        authorId: n.authorId,
        authorName,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      };
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "List notes error");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = req.body;

    // Resolve author from Authorization header if not provided
    let authorId = data.authorId;
    if (!authorId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const { userId, valid } = decodeSessionToken(authHeader.slice(7));
        if (valid) authorId = userId;
      }
    }

    if (!authorId) {
      res.status(400).json({ error: "bad_request", message: "Author required" });
      return;
    }

    const [note] = await db.insert(notesTable).values({
      projectId: data.projectId,
      inspectionId: data.inspectionId,
      content: data.content,
      authorId,
    }).returning();

    let authorName = "Unknown";
    if (note.authorId) {
      const users = await db.select().from(usersTable).where(eq(usersTable.id, note.authorId));
      if (users[0]) authorName = `${users[0].firstName} ${users[0].lastName}`;
    }

    res.status(201).json({
      id: note.id,
      projectId: note.projectId,
      inspectionId: note.inspectionId,
      content: note.content,
      authorId: note.authorId,
      authorName,
      createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Create note error");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
