import app from "./app";
import { logger } from "./lib/logger";
import { ensureSupabaseBucket, isSupabaseStorageAvailable } from "./lib/supabaseStorage";
import { db, pool, usersTable, planConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureGlobalTemplatesSeed } from "../../../lib/db/src/seeds/global-templates";
import { PLAN_LIMITS } from "./lib/planLimits";

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
    // users table additions
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on_assignment boolean NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profession text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS licence_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free_trial'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_override_projects text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_override_inspections text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_company_admin boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'inspector'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()`);

    // checklist_templates table additions
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'Class 1a'`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'Building Surveyor'`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false`);

    // checklist_items table additions
    await pool.query(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium'`);
    await pool.query(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS defect_trigger boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS recommended_action text`);
    await pool.query(`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS include_in_report boolean NOT NULL DEFAULT true`);

    // internal_staff table additions
    await pool.query(`ALTER TABLE internal_staff ADD COLUMN IF NOT EXISTS email text`);

    // project_contractors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_contractors (
        id serial PRIMARY KEY,
        project_id integer NOT NULL,
        name text NOT NULL,
        trade text NOT NULL DEFAULT '',
        email text,
        company text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS project_contractors_project_id_idx ON project_contractors(project_id)`);

    // checklist_results table additions
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS photo_markups text`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS severity text`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS location text`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS trade_allocated text`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS defect_status text DEFAULT 'open'`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT true`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS recommended_action text`);
    await pool.query(`ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()`);

    // token-based team invitations (Task #7)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_only boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_user_id text`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invitations (
        id serial PRIMARY KEY,
        token text NOT NULL UNIQUE,
        email text NOT NULL,
        company_name text,
        invited_by_id text,
        role text NOT NULL DEFAULT 'inspector',
        permissions text,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS invitations_company_name_idx ON invitations(company_name)`);

    logger.info("Schema migrations applied");
  } catch (err) {
    logger.error({ err }, "Schema migration failed — continuing");
  }
}

async function ensurePlanConfigsSeed() {
  try {
    const planDefs = [
      {
        planKey: "free_trial",
        sortOrder: "0",
        label: PLAN_LIMITS.free_trial.label,
        description: "Try InspectProof risk-free with no credit card required.",
        features: JSON.stringify(["1 active project", "Up to 10 inspections", "Standard templates", "PDF reports"]),
        maxProjects: String(PLAN_LIMITS.free_trial.maxProjects ?? ""),
        maxInspectionsMonthly: null,
        maxInspectionsTotal: String(PLAN_LIMITS.free_trial.maxInspectionsTotal ?? ""),
        maxTeamMembers: String(PLAN_LIMITS.free_trial.maxTeamMembers ?? ""),
        isPopular: false,
        isBestValue: false,
      },
      {
        planKey: "starter",
        sortOrder: "1",
        label: PLAN_LIMITS.starter.label,
        description: "For sole traders and small practices managing multiple projects.",
        features: JSON.stringify(["Up to 10 active projects", "50 inspections/month", "Up to 3 team members", "All report types", "Priority support"]),
        maxProjects: String(PLAN_LIMITS.starter.maxProjects ?? ""),
        maxInspectionsMonthly: String(PLAN_LIMITS.starter.maxInspectionsMonthly ?? ""),
        maxInspectionsTotal: null,
        maxTeamMembers: String(PLAN_LIMITS.starter.maxTeamMembers ?? ""),
        isPopular: true,
        isBestValue: false,
      },
      {
        planKey: "professional",
        sortOrder: "2",
        label: PLAN_LIMITS.professional.label,
        description: "For growing practices that need unlimited capacity and custom workflows.",
        features: JSON.stringify(["Unlimited projects", "Unlimited inspections", "Up to 10 team members", "Custom templates", "All report types", "Priority support"]),
        maxProjects: null,
        maxInspectionsMonthly: null,
        maxInspectionsTotal: null,
        maxTeamMembers: String(PLAN_LIMITS.professional.maxTeamMembers ?? ""),
        isPopular: false,
        isBestValue: true,
      },
      {
        planKey: "enterprise",
        sortOrder: "3",
        label: PLAN_LIMITS.enterprise.label,
        description: "For large organisations needing custom limits, SLAs, and dedicated support.",
        features: JSON.stringify(["Unlimited everything", "Unlimited team members", "Custom templates", "Dedicated account manager", "Custom SLA", "SSO / API access"]),
        maxProjects: null,
        maxInspectionsMonthly: null,
        maxInspectionsTotal: null,
        maxTeamMembers: null,
        isPopular: false,
        isBestValue: false,
      },
    ];

    for (const plan of planDefs) {
      await db
        .insert(planConfigsTable)
        .values({ ...plan, updatedAt: new Date() })
        .onConflictDoNothing();
    }
    logger.info("Plan configs seeded");
  } catch (err) {
    logger.error({ err }, "Plan config seed failed — continuing");
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
await ensurePlanConfigsSeed();

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
