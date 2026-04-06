-- ============================================================
-- InspectProof – full reference schema
-- Kept in sync with lib/db/src/schema/*.ts (Drizzle ORM).
-- Run this on a fresh database; for existing DBs use migrate.sql.
--
-- Table ordering ensures every FK referent is created before
-- the table that references it (no deferred FK resolution needed).
-- ============================================================

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "first_name" text NOT NULL,
        "last_name" text NOT NULL,
        "role" text DEFAULT 'inspector' NOT NULL,
        "phone" text,
        "avatar" text,
        "signature_url" text,
        "profession" text,
        "licence_number" text,
        "company_name" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "is_admin" boolean DEFAULT false NOT NULL,
        "plan" text DEFAULT 'free_trial' NOT NULL,
        "stripe_customer_id" text,
        "stripe_subscription_id" text,
        "plan_override_projects" text,
        "plan_override_inspections" text,
        "expo_push_token" text,
        "notify_on_assignment" boolean DEFAULT true NOT NULL,
        "is_company_admin" boolean DEFAULT false NOT NULL,
        "user_type" text DEFAULT 'inspector' NOT NULL,
        "permissions" text,
        "mobile_only" boolean DEFAULT false NOT NULL,
        "admin_user_id" text,
        "requires_password_change" boolean DEFAULT false NOT NULL,
        "abn" text,
        "company_phone" text,
        "company_email" text,
        "company_address" text,
        "company_suburb" text,
        "company_state" text,
        "company_postcode" text,
        "company_website" text,
        "logo_url" text,
        "acn" text,
        "accreditation_body" text,
        "accreditation_number" text,
        "accreditation_expiry" text,
        "pl_insurer" text,
        "pl_policy_number" text,
        "pl_expiry" text,
        "pi_insurer" text,
        "pi_policy_number" text,
        "pi_expiry" text,
        "report_footer_text" text,
        "notification_prefs" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint

-- ── invitations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invitations" (
        "id" serial PRIMARY KEY NOT NULL,
        "token" text NOT NULL,
        "email" text NOT NULL,
        "company_name" text,
        "invited_by_id" text NOT NULL,
        "role" text DEFAULT 'inspector' NOT NULL,
        "user_type" text DEFAULT 'both' NOT NULL,
        "permissions" text,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint

-- ── internal_staff ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "internal_staff" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_name" text NOT NULL,
        "name" text NOT NULL,
        "role" text DEFAULT '' NOT NULL,
        "email" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── plan_configs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "plan_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "plan_key" text NOT NULL,
        "label" text NOT NULL,
        "description" text,
        "features" text DEFAULT '[]' NOT NULL,
        "max_projects" text,
        "max_inspections_monthly" text,
        "max_inspections_total" text,
        "max_team_members" text,
        "is_popular" boolean DEFAULT false NOT NULL,
        "is_best_value" boolean DEFAULT false NOT NULL,
        "sort_order" text DEFAULT '0' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "plan_configs_plan_key_unique" UNIQUE("plan_key")
);
--> statement-breakpoint

-- ── trade_categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "trade_categories" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_name" text NOT NULL,
        "name" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── projects (references users) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "projects" (
        "id" serial PRIMARY KEY NOT NULL,
        "reference_number" text,
        "org_admin_id" integer,
        "name" text NOT NULL,
        "site_address" text NOT NULL,
        "suburb" text NOT NULL,
        "state" text NOT NULL,
        "postcode" text NOT NULL,
        "client_name" text NOT NULL,
        "owner_name" text,
        "builder_name" text,
        "designer_name" text,
        "da_number" text,
        "certification_number" text,
        "building_classification" text NOT NULL,
        "project_type" text DEFAULT 'residential' NOT NULL,
        "status" text DEFAULT 'active' NOT NULL,
        "stage" text DEFAULT 'pre_construction' NOT NULL,
        "notes" text,
        "assigned_certifier_id" integer,
        "assigned_inspector_id" integer,
        "created_by_id" integer,
        "start_date" date,
        "expected_completion_date" date,
        "completed_date" date,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_projects_certifier"
            FOREIGN KEY ("assigned_certifier_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_projects_inspector"
            FOREIGN KEY ("assigned_inspector_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_projects_creator"
            FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "projects_ref_num_per_org_idx"
    ON "projects" ("reference_number", "org_admin_id")
    WHERE "reference_number" IS NOT NULL AND "org_admin_id" IS NOT NULL;
--> statement-breakpoint

-- ── org_contractors (references trade_categories) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "org_contractors" (
        "id" serial PRIMARY KEY NOT NULL,
        "company_name" text NOT NULL,
        "name" text NOT NULL,
        "trade" text DEFAULT '' NOT NULL,
        "trade_category_id" integer,
        "email" text,
        "company" text,
        "licence_number" text,
        "registration_number" text,
        "licence_expiry" date,
        "registration_expiry" date,
        "contact_role" text,
        "phone" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_org_contractors_trade_category"
            FOREIGN KEY ("trade_category_id") REFERENCES "trade_categories"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── org_contractor_project_assignments (references org_contractors, projects) ──
CREATE TABLE IF NOT EXISTS "org_contractor_project_assignments" (
        "id" serial PRIMARY KEY NOT NULL,
        "org_contractor_id" integer NOT NULL,
        "project_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "oca_unique_assignment" UNIQUE("org_contractor_id","project_id"),
        CONSTRAINT "fk_ocpa_contractor"
            FOREIGN KEY ("org_contractor_id") REFERENCES "org_contractors"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ocpa_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── project_contractors (references projects) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "project_contractors" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "name" text NOT NULL,
        "trade" text DEFAULT '' NOT NULL,
        "email" text,
        "company" text,
        "contact_role" text,
        "phone" text,
        "is_primary" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_project_contractors_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── inspections (references projects, users) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "inspections" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer,
        "inspection_type" text NOT NULL,
        "status" text DEFAULT 'scheduled' NOT NULL,
        "scheduled_date" date NOT NULL,
        "scheduled_time" text,
        "completed_date" date,
        "inspector_id" integer,
        "duration" integer,
        "notes" text,
        "weather_conditions" text,
        "checklist_template_id" integer,
        "share_token" text,
        "signed_off_at" timestamp,
        "signed_off_by_id" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_inspections_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_inspections_inspector"
            FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── inductions (references projects) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inductions" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "title" text DEFAULT 'Site Induction' NOT NULL,
        "scheduled_date" text NOT NULL,
        "scheduled_time" text,
        "location" text,
        "conducted_by_id" integer,
        "conducted_by_name" text,
        "status" text DEFAULT 'scheduled' NOT NULL,
        "notes" text,
        "checklist_data" jsonb,
        "completed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_inductions_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── induction_attendees (references inductions, org_contractors, internal_staff) ─
CREATE TABLE IF NOT EXISTS "induction_attendees" (
        "id" serial PRIMARY KEY NOT NULL,
        "induction_id" integer NOT NULL,
        "org_contractor_id" integer,
        "internal_staff_id" integer,
        "attendee_type" text DEFAULT 'contractor' NOT NULL,
        "contractor_name" text NOT NULL,
        "contractor_email" text,
        "contractor_trade" text,
        "attended" boolean DEFAULT false NOT NULL,
        "signed_off" boolean DEFAULT false NOT NULL,
        "signature_data" text,
        "acknowledged_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_induction_attendees_induction"
            FOREIGN KEY ("induction_id") REFERENCES "inductions"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_induction_attendees_contractor"
            FOREIGN KEY ("org_contractor_id") REFERENCES "org_contractors"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_induction_attendees_staff"
            FOREIGN KEY ("internal_staff_id") REFERENCES "internal_staff"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── checklist_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "checklist_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "inspection_type" text NOT NULL,
        "description" text,
        "folder" text DEFAULT 'Class 1a' NOT NULL,
        "discipline" text DEFAULT 'Building Surveyor' NOT NULL,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "is_global" boolean DEFAULT false NOT NULL,
        "recurrence_type" text,
        "recurrence_interval" integer,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── checklist_items (references checklist_templates) ──────────────────────────
CREATE TABLE IF NOT EXISTS "checklist_items" (
        "id" serial PRIMARY KEY NOT NULL,
        "template_id" integer,
        "order_index" integer NOT NULL,
        "category" text NOT NULL,
        "description" text NOT NULL,
        "reason" text,
        "code_reference" text,
        "risk_level" text DEFAULT 'medium' NOT NULL,
        "is_required" boolean DEFAULT true NOT NULL,
        "require_photo" boolean DEFAULT false NOT NULL,
        "defect_trigger" boolean DEFAULT false NOT NULL,
        "recommended_action" text,
        "include_in_report" boolean DEFAULT true NOT NULL,
        CONSTRAINT "fk_checklist_items_template"
            FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── checklist_results (references inspections, checklist_items) ───────────────
CREATE TABLE IF NOT EXISTS "checklist_results" (
        "id" serial PRIMARY KEY NOT NULL,
        "inspection_id" integer NOT NULL,
        "checklist_item_id" integer NOT NULL,
        "result" text DEFAULT 'pending' NOT NULL,
        "notes" text,
        "photo_urls" text,
        "photo_markups" text,
        "severity" text,
        "issue_category" text,
        "issue_priority" text,
        "location" text,
        "trade_allocated" text,
        "defect_status" text DEFAULT 'open',
        "client_visible" boolean DEFAULT true NOT NULL,
        "recommended_action" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_checklist_results_inspection"
            FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_checklist_results_item"
            FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── issues (references projects, inspections) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "issues" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer,
        "inspection_id" integer,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "severity" text DEFAULT 'medium' NOT NULL,
        "category" text,
        "priority" text,
        "photos" text,
        "status" text DEFAULT 'open' NOT NULL,
        "location" text,
        "code_reference" text,
        "responsible_party" text,
        "due_date" date,
        "resolved_date" date,
        "assigned_to_id" integer,
        "closeout_notes" text,
        "closeout_photos" text,
        "markup_document_id" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_issues_inspection"
            FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── issue_comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "issue_comments" (
        "id" serial PRIMARY KEY NOT NULL,
        "issue_id" integer NOT NULL,
        "user_id" integer NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_issue_comments_issue"
            FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_issue_comments_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── documents (references projects, inductions) ───────────────────────────────
-- Placed after inductions so fk_documents_induction can be declared inline.
CREATE TABLE IF NOT EXISTS "documents" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "name" text NOT NULL,
        "category" text DEFAULT 'other' NOT NULL,
        "file_name" text NOT NULL,
        "file_size" integer,
        "mime_type" text,
        "version" text,
        "tags" text[] DEFAULT '{}' NOT NULL,
        "uploaded_by_id" integer NOT NULL,
        "folder" text DEFAULT 'General' NOT NULL,
        "file_url" text,
        "inspection_id" integer,
        "induction_id" integer,
        "included_in_inspection" boolean DEFAULT true NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_documents_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_documents_induction"
            FOREIGN KEY ("induction_id") REFERENCES "inductions"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── document_checklist_links (references documents, checklist_items, projects) ─
CREATE TABLE IF NOT EXISTS "document_checklist_links" (
        "id" serial PRIMARY KEY NOT NULL,
        "document_id" integer NOT NULL,
        "checklist_item_id" integer NOT NULL,
        "project_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "doc_item_unique" UNIQUE("document_id","checklist_item_id"),
        CONSTRAINT "fk_dcl_document"
            FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_dcl_checklist_item"
            FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_items"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_dcl_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── project_inspection_types (references projects) ────────────────────────────
CREATE TABLE IF NOT EXISTS "project_inspection_types" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "inspection_type" text NOT NULL,
        "is_selected" boolean DEFAULT false NOT NULL,
        "template_id" integer,
        "sort_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_pit_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── notes (references projects) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notes" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer NOT NULL,
        "inspection_id" integer,
        "content" text NOT NULL,
        "author_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_notes_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── reports (references projects, inspections) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "project_id" integer,
        "inspection_id" integer,
        "title" text NOT NULL,
        "report_type" text DEFAULT 'inspection_certificate' NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "content" text,
        "sent_to" text,
        "sent_at" timestamp,
        "submitted_at" timestamp,
        "generated_by_id" integer NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_reports_project"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_reports_inspection"
            FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── activity_logs (references users) ─────────────────────────────────────────
-- user_id is nullable to support ON DELETE SET NULL: when a user is deleted,
-- activity log rows are retained but user_id is set to NULL.
CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" serial PRIMARY KEY NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "action" text NOT NULL,
        "description" text NOT NULL,
        "user_id" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_activity_logs_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

-- ── doc_templates (references users via user_id, nullable) ───────────────────
CREATE TABLE IF NOT EXISTS "doc_templates" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "name" text NOT NULL,
        "content" text,
        "linked_checklist_ids" text DEFAULT '[]',
        "background_image" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── feedbacks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "feedbacks" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer,
        "sender_name" text,
        "sender_email" text,
        "message" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── notifications (references users) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "type" text DEFAULT 'system' NOT NULL,
        "is_read" text DEFAULT 'false' NOT NULL,
        "entity_type" text,
        "entity_id" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "fk_notifications_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "project_contractors_project_id_idx" ON "project_contractors"("project_id");
CREATE INDEX IF NOT EXISTS "org_contractors_company_name_idx" ON "org_contractors"("company_name");
CREATE INDEX IF NOT EXISTS "inductions_project_id_idx" ON "inductions"("project_id");
CREATE INDEX IF NOT EXISTS "induction_attendees_induction_id_idx" ON "induction_attendees"("induction_id");
CREATE INDEX IF NOT EXISTS "induction_attendees_org_contractor_id_idx" ON "induction_attendees"("org_contractor_id");
CREATE INDEX IF NOT EXISTS "invitations_token_idx" ON "invitations"("token");
CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations"("email");
CREATE INDEX IF NOT EXISTS "invitations_company_name_idx" ON "invitations"("company_name");
CREATE INDEX IF NOT EXISTS "documents_induction_id_idx" ON "documents"("induction_id");

-- ── Seed: Plan configs ────────────────────────────────────────────────────────
INSERT INTO plan_configs (plan_key, label, description, features, max_projects, max_inspections_monthly, max_inspections_total, max_team_members, is_popular, is_best_value, sort_order)
VALUES
  ('free_trial', 'Free Trial', '14-day trial with limited access', '["1 project","10 inspections total","Basic reports"]', '1', NULL, '10', '1', false, false, '0'),
  ('starter', 'Starter', '$59/mo — small operators', '["Unlimited projects","50 inspections/month","PDF reports","Email support"]', NULL, '50', NULL, '3', false, false, '1'),
  ('professional', 'Professional', '$149/mo — growing businesses', '["Unlimited projects","Unlimited inspections","Advanced reports","Priority support"]', NULL, NULL, NULL, '10', true, false, '2'),
  ('enterprise', 'Enterprise', 'Custom — large organisations', '["Everything in Professional","Custom integrations","Dedicated support","SLA"]', NULL, NULL, NULL, NULL, false, true, '3')
ON CONFLICT (plan_key) DO NOTHING;

-- ── Seed: Default admin user ──────────────────────────────────────────────────
-- Password: InspectProof2024!  (bcrypt hash below)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_admin, plan, is_active)
VALUES (
  'contact@inspectproof.com.au',
  '$2b$12$Ca/cygBkookOVK/g7RconOpWOfBHkDNnLhiiCa8QsadbfpZzKaLQC',
  'InspectProof',
  'Admin',
  'admin',
  true,
  'enterprise',
  true
)
ON CONFLICT (email) DO NOTHING;
