import app, { validateWebhookRouteOrder } from "./app";
import { logger } from "./lib/logger";
import { ensureSupabaseBucket, isSupabaseStorageAvailable } from "./lib/supabaseStorage";
import { db, pool, usersTable, planConfigsTable } from "@workspace/db";

if (!process.env.RESEND_API_KEY) {
  logger.warn(
    "RESEND_API_KEY is not set — emails will be skipped. " +
    "For production, set RESEND_API_KEY and ensure DKIM/SPF records are configured for your sending domain."
  );
}
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureGlobalTemplatesSeed } from "../../../lib/db/src/seeds/global-templates";
import { PLAN_LIMITS } from "./lib/planLimits";
import { startInspectionReminderCron } from "./lib/inspectionReminderJob";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail fast if required env vars are absent, rather than surfacing errors mid-request.
(function validateRequiredEnvVars() {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  const hasReplitStorage = !!process.env.PRIVATE_OBJECT_DIR;
  const hasSupabaseStorage =
    !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasReplitStorage && !hasSupabaseStorage) {
    missing.push(
      "PRIVATE_OBJECT_DIR (Replit Object Storage) " +
      "OR both SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase Storage)"
    );
  }

  if (missing.length > 0) {
    logger.error(
      { missingVars: missing },
      "STARTUP ABORTED — required environment variables are not set:\n" +
      missing.map((v) => `  • ${v}`).join("\n") + "\n" +
      "Set these variables and restart the server."
    );
    process.exit(1);
  }
})();

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
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_status text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in_at timestamp`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_source text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_scope text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS abn text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS acn text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_phone text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_email text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_suburb text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_state text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_postcode text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_body text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_insurer text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_policy_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_insurer text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_policy_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS report_footer_text text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs text`);
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

    // org_contractors table (Task #10)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_contractors (
        id serial PRIMARY KEY,
        company_name text NOT NULL,
        name text NOT NULL,
        trade text NOT NULL DEFAULT '',
        email text,
        company text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS org_contractors_company_name_idx ON org_contractors(company_name)`);

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

    // invitations: user_type column (app-invite access level)
    await pool.query(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS user_type text`);

    // users: requires_password_change column
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_password_change boolean NOT NULL DEFAULT false`);

    // users: user_type column
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'inspector'`);

    // ── One-time data fix: rename se_footing_slab → bs_footing_slab in templates ──
    await pool.query(`
      UPDATE checklist_templates
      SET inspection_type = 'bs_footing_slab'
      WHERE inspection_type = 'se_footing_slab'
    `);

    // ── One-time data fix: link jakey.turner@outlook.com to Jake's org ───────
    // Safe to run on every startup — the WHERE clause is a no-op once already done.
    const jakyHash = await bcrypt.hash("InspectProof2024!", 12);
    await pool.query(`
      UPDATE users
      SET
        admin_user_id = (
          SELECT id::text FROM users WHERE email = 'jake@jtcertifications.com.au' LIMIT 1
        ),
        mobile_only            = true,
        requires_password_change = false,
        password_hash          = $1,
        updated_at             = NOW()
      WHERE email = 'jakey.turner@outlook.com'
        AND admin_user_id IS NULL
    `, [jakyHash]);

    // inductions tables (Task #21)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inductions (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title text NOT NULL DEFAULT 'Site Induction',
        scheduled_date text NOT NULL,
        scheduled_time text,
        location text,
        conducted_by_id integer,
        conducted_by_name text,
        status text NOT NULL DEFAULT 'scheduled',
        notes text,
        checklist_data jsonb,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS inductions_project_id_idx ON inductions(project_id)`);
    await pool.query(`ALTER TABLE inductions ADD COLUMN IF NOT EXISTS checklist_data jsonb`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS induction_attendees (
        id serial PRIMARY KEY,
        induction_id integer NOT NULL REFERENCES inductions(id) ON DELETE CASCADE,
        org_contractor_id integer REFERENCES org_contractors(id) ON DELETE SET NULL,
        internal_staff_id integer REFERENCES internal_staff(id) ON DELETE SET NULL,
        attendee_type text NOT NULL DEFAULT 'contractor',
        contractor_name text NOT NULL,
        contractor_email text,
        contractor_trade text,
        attended boolean NOT NULL DEFAULT false,
        signed_off boolean NOT NULL DEFAULT false,
        signature_data text,
        acknowledged_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS induction_attendees_induction_id_idx ON induction_attendees(induction_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS induction_attendees_org_contractor_id_idx ON induction_attendees(org_contractor_id)`);
    await pool.query(`ALTER TABLE induction_attendees ADD COLUMN IF NOT EXISTS internal_staff_id integer REFERENCES internal_staff(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE induction_attendees ADD COLUMN IF NOT EXISTS attendee_type text NOT NULL DEFAULT 'contractor'`);

    // induction_id on documents for per-induction attachments
    await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS induction_id integer REFERENCES inductions(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS documents_induction_id_idx ON documents(induction_id)`);

    // inspection reminders (Task #36)
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inspection_reminders (
        id serial PRIMARY KEY,
        inspection_id integer NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        reminder_type text NOT NULL,
        sent_at timestamp NOT NULL DEFAULT now(),
        inspector_id integer,
        UNIQUE (inspection_id, reminder_type)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS inspection_reminders_inspection_id_idx ON inspection_reminders(inspection_id)`);
    // org-level inspection reminder settings stored in users.notification_prefs JSON
    // (uses existing notification_prefs column — no ALTER TABLE needed)

    // email_logs table (Task #34)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id serial PRIMARY KEY,
        type text NOT NULL,
        recipient text NOT NULL,
        subject text NOT NULL,
        status text NOT NULL DEFAULT 'sent',
        resend_message_id text,
        error_message text,
        metadata jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS email_logs_type_idx ON email_logs(type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS email_logs_status_idx ON email_logs(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS email_logs_recipient_idx ON email_logs(recipient)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON email_logs(created_at DESC)`);

    // email_verified_at column for users (Task #34 verification flow)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp`);

    // inspections: scheduled_end_date for calendar duration support (Task #39)
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS scheduled_end_date date`);

    // inspections: share token, sign-off, and calendar integration columns
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS share_token text`);
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS share_token_expiry timestamp`);
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS signed_off_at timestamp`);
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS signed_off_by_id integer`);
    await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS calendar_event_id text`);

    // share_acknowledgements table (client portal sign-off)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS share_acknowledgements (
        id serial PRIMARY KEY,
        inspection_id integer NOT NULL,
        share_token text NOT NULL,
        client_name text NOT NULL,
        client_email text NOT NULL,
        signature_text text,
        acknowledged_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // contractor_share_tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contractor_share_tokens (
        id serial PRIMARY KEY,
        token text NOT NULL UNIQUE,
        project_id integer NOT NULL,
        inspection_id integer,
        contractor_name text NOT NULL,
        contractor_email text,
        expires_at timestamp,
        revoked_at timestamp,
        created_by_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // trade_categories table (org-level)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trade_categories (
        id serial PRIMARY KEY,
        company_name text NOT NULL,
        name text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // org_contractor_project_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_contractor_project_assignments (
        id serial PRIMARY KEY,
        org_contractor_id integer NOT NULL,
        project_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (org_contractor_id, project_id)
      )
    `);

    // user_calendar_integrations table (calendar sync)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_calendar_integrations (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        provider text NOT NULL,
        access_token text NOT NULL,
        refresh_token text,
        token_expiry timestamp,
        calendar_id text NOT NULL DEFAULT 'primary',
        calendar_name text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (user_id, provider)
      )
    `);

    // org_contractors: columns added in later tasks
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS trade_category_id integer`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS licence_number text`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS registration_number text`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS licence_expiry date`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS registration_expiry date`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS contact_role text`);
    await pool.query(`ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS phone text`);

    // project_contractors: columns added in later tasks
    await pool.query(`ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS contact_role text`);
    await pool.query(`ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS phone text`);
    await pool.query(`ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false`);

    // reports: report_options jsonb column
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_options jsonb`);
    await pool.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS submitted_at timestamp`);

    // users: org fields stored in DB (Task #32 - organisation settings)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS abn text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_phone text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_email text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_suburb text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_state text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_postcode text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS acn text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_body text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_insurer text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_policy_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_insurer text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_policy_number text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_expiry text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS report_footer_text text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_opt_in_at timestamp`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_source text`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_email_scope text`);

    await pool.query(`CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id serial PRIMARY KEY,
      subject text NOT NULL,
      body_html text NOT NULL,
      preview_text text,
      sent_by_id integer,
      sent_by_email text,
      recipient_count integer NOT NULL DEFAULT 0,
      success_count integer NOT NULL DEFAULT 0,
      failure_count integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      sent_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`);

    // user_organisations table (Task #49 - multi-org membership)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_organisations (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        org_admin_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL DEFAULT 'inspector',
        permissions text,
        status text NOT NULL DEFAULT 'active',
        invited_by_id integer REFERENCES users(id) ON DELETE SET NULL,
        joined_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        UNIQUE (user_id, org_admin_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_organisations_user_id_idx ON user_organisations(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_organisations_org_admin_id_idx ON user_organisations(org_admin_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_organisations_status_idx ON user_organisations(status)`);
    await pool.query(`ALTER TABLE user_organisations ADD COLUMN IF NOT EXISTS invite_token text`);

    // Migrate existing user-org relationships from adminUserId into user_organisations
    // This inserts a row for every non-admin user that has adminUserId set, skipping existing rows
    await pool.query(`
      INSERT INTO user_organisations (user_id, org_admin_id, role, permissions, status, joined_at, created_at)
      SELECT
        u.id AS user_id,
        u.admin_user_id::integer AS org_admin_id,
        COALESCE(u.role, 'inspector') AS role,
        u.permissions,
        'active' AS status,
        u.created_at AS joined_at,
        u.created_at
      FROM users u
      WHERE u.admin_user_id IS NOT NULL
        AND u.admin_user_id ~ '^[0-9]+$'
        AND u.is_company_admin = false
      ON CONFLICT (user_id, org_admin_id) DO NOTHING
    `);

    logger.info("Schema migrations applied");
  } catch (err) {
    logger.error({ err }, "Schema migration failed — continuing");
  }

  // Task #50 migrations run in their own block so pre-existing migration failures above
  // do not prevent these from running.
  try {
    // doc_templates: discipline column (Task #50)
    await pool.query(`ALTER TABLE doc_templates ADD COLUMN IF NOT EXISTS discipline text`);

    // Task #50: remove standalone 'footing' and 'slab' Building Surveyor checklist templates
    // (replaced by the combined 'bs_footing_slab' type). Safe to run repeatedly — WHERE clause
    // is a no-op once the rows are gone.
    await pool.query(`
      DELETE FROM checklist_items
      WHERE template_id IN (
        SELECT id FROM checklist_templates
        WHERE discipline = 'Building Surveyor'
          AND inspection_type IN ('footing', 'slab')
      )
    `);
    await pool.query(`
      DELETE FROM checklist_templates
      WHERE discipline = 'Building Surveyor'
        AND inspection_type IN ('footing', 'slab')
    `);

    // Task #50: remove old global doc templates that lack a discipline and are now duplicated
    // by newer global templates with discipline set. Safe to run repeatedly (no-op if already gone).
    await pool.query(`
      DELETE FROM doc_templates old_t
      WHERE old_t.user_id IS NULL
        AND old_t.discipline IS NULL
        AND EXISTS (
          SELECT 1 FROM doc_templates new_t
          WHERE new_t.user_id IS NULL
            AND new_t.discipline IS NOT NULL
            AND new_t.name = old_t.name
        )
    `);

    logger.info("Task #50 migrations applied");
  } catch (err) {
    logger.error({ err }, "Task #50 migration failed — continuing");
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

// Runs AFTER ensureGlobalTemplatesSeed() to remove standalone footing/slab
// duplicates and apply the correct sort ordering within each BS folder.
// Safe to run repeatedly — all operations are idempotent.
async function ensureInspectionTypeCleanup() {
  try {
    // Delete standalone footing/slab templates that exist alongside a combined
    // "Footing & Slab" (bs_footing_slab) template in the same folder.
    await pool.query(`
      DELETE FROM checklist_items
      WHERE template_id IN (
        SELECT t.id FROM checklist_templates t
        WHERE t.inspection_type IN ('footing', 'slab')
          AND EXISTS (
            SELECT 1 FROM checklist_templates combo
            WHERE combo.folder = t.folder
              AND combo.inspection_type = 'bs_footing_slab'
          )
      )
    `);
    await pool.query(`
      DELETE FROM checklist_templates t
      WHERE t.inspection_type IN ('footing', 'slab')
        AND EXISTS (
          SELECT 1 FROM checklist_templates combo
          WHERE combo.folder = t.folder
            AND combo.inspection_type = 'bs_footing_slab'
        )
    `);
    // Apply standard sort ordering:
    // 1. Footing & Slab, 2. Frame, 3. Waterproofing, 4. Final, 5. Occupancy, 6+. rest
    await pool.query(`
      UPDATE checklist_templates SET sort_order = CASE inspection_type
        WHEN 'bs_footing_slab'    THEN 1
        WHEN 'frame'              THEN 2
        WHEN 'steel_frame'        THEN 2
        WHEN 'waterproofing'      THEN 3
        WHEN 'pre_plaster'        THEN 4
        WHEN 'lock_up'            THEN 5
        WHEN 'final'              THEN 10
        WHEN 'pool_final'         THEN 10
        WHEN 'occupancy'          THEN 11
        WHEN 'fire_penetration'   THEN 20
        WHEN 'fire_separation'    THEN 21
        ELSE sort_order
      END
      WHERE folder IN (
        'Dwelling 1 Storey (Class 1)',
        'Dwelling 2 Storey (Class 1)',
        'Class 2-9',
        'Shed Steel (Class 10)',
        'Shed Timber Framed (Class 10)',
        'Swimming Pool / Spa (Class 10b)',
        'Class 5'
      )
    `);
    logger.info("Inspection type cleanup applied");
  } catch (err) {
    logger.error({ err }, "Inspection type cleanup failed — continuing");
  }
}

async function runBackgroundTasks() {
  try {
    await ensureGlobalTemplatesSeed();
  } catch (err) {
    logger.error({ err }, "Global template seed failed — continuing");
  }

  // Run AFTER seed so it removes any templates the seed re-creates
  await ensureInspectionTypeCleanup();

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
const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Validate Stripe webhook route ordering by sending a synthetic probe request.
  // We delay slightly so the server is ready to accept connections on this event loop tick.
  setTimeout(() => validateWebhookRouteOrder(port), 200);

  // Start inspection reminder cron job
  startInspectionReminderCron();

  // Run seeds and integrations in the background after port is open
  runBackgroundTasks().catch((err) => logger.error({ err }, "Background tasks failed"));
});

// Graceful shutdown: on SIGTERM, stop accepting new connections and wait for
// in-flight requests to drain before exiting, preventing abrupt connection resets.
process.on("SIGTERM", () => {
  logger.info("SIGTERM received — starting graceful shutdown");
  server.close((closeErr) => {
    if (closeErr) {
      logger.error({ err: closeErr }, "Error during graceful shutdown");
      process.exit(1);
    }
    logger.info("All connections drained — process exiting");
    process.exit(0);
  });
});
