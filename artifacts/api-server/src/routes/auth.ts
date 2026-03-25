import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

    // Simple password check (demo: password === "password123")
    if (password !== "password123" && user.passwordHash !== password) {
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
    const { email, password, firstName, lastName, role, organization, plan } = req.body;

    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: "bad_request", message: "First name, last name, email and password are required." });
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

    const [newUser] = await db.insert(usersTable).values({
      email: email.toLowerCase().trim(),
      passwordHash: password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: role || "inspector",
      isActive: true,
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
        isActive: newUser.isActive,
        createdAt: newUser.createdAt.toISOString(),
      },
      plan: plan || "starter",
    });
  } catch (err) {
    req.log.error({ err }, "Register error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
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
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Get me error");
    res.status(500).json({ error: "internal_error", message: "Server error" });
  }
});

export default router;
