import app from "./app";
import { logger } from "./lib/logger";
import { ensureSupabaseBucket, isSupabaseStorageAvailable } from "./lib/supabaseStorage";
import { db, pool, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureGlobalTemplatesSeed } from "../../../lib/db/src/seeds/global-templates";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runSchemaMigrations() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on_assignment boolean NOT NULL DEFAULT true`);
    logger.info("Schema migrations applied");
  } catch (err) {
    logger.error({ err }, "Schema migration failed — continuing");
  }
}

async function ensureAdminSeed() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "contact@inspectproof.com.au";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "InspectProof2024!";
  try {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.isAdmin, true), eq(usersTable.isActive, true)))
      .limit(1);
    if (existing.length > 0) {
      logger.info("Admin user already exists — skipping seed");
      return;
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await db.insert(usersTable).values({
      email: adminEmail,
      passwordHash,
      firstName: "InspectProof",
      lastName: "Admin",
      role: "admin",
      isAdmin: true,
      isActive: true,
      plan: "enterprise",
      companyName: "InspectProof Pty Ltd",
    }).onConflictDoNothing();
    logger.info({ email: adminEmail }, "Admin seed account created");
  } catch (err) {
    logger.error({ err }, "Admin seed failed — continuing without seeding");
  }
}

async function initStripe() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) {
    logger.warn('No database URL set — skipping Stripe init');
    return;
  }
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    logger.info('Running Stripe schema migrations...');
    await runMigrations({ databaseUrl });
    logger.info('Stripe schema ready');

    const { getStripeSync } = await import('./stripeClient');
    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
    if (domain) {
      logger.info('Setting up managed Stripe webhook...');
      await stripeSync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`);
      logger.info('Stripe webhook configured');
    }

    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe data synced'))
      .catch((err: any) => logger.error({ err }, 'Stripe syncBackfill error'));
  } catch (err) {
    logger.error({ err }, 'Stripe init failed — payments unavailable');
  }
}

async function runBackgroundTasks() {
  try {
    await ensureGlobalTemplatesSeed();
  } catch (err) {
    logger.error({ err }, "Global template seed failed — continuing");
  }

  try {
    await initStripe();
  } catch (err) {
    logger.error({ err }, "Stripe init failed in background — continuing");
  }

  if (isSupabaseStorageAvailable()) {
    try {
      logger.info('Supabase Storage detected — ensuring bucket exists...');
      await ensureSupabaseBucket();
      logger.info('Supabase Storage bucket ready');
    } catch (err) {
      logger.error({ err }, "Supabase bucket setup failed — continuing");
    }
  } else {
    logger.info('Supabase Storage not configured — using Replit Object Storage');
  }
}

// Run fast critical setup before listening
await runSchemaMigrations();
await ensureAdminSeed();

// Start listening immediately so the port is open for deployment health checks
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Run seeds and integrations in the background after port is open
  runBackgroundTasks().catch((err) => logger.error({ err }, "Background tasks failed"));
});
