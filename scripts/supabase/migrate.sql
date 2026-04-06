-- ============================================================
-- InspectProof – additive migration script
-- Safe to run on an existing database.
--
-- Strategy:
--   • ADD COLUMN IF NOT EXISTS – purely additive, never removes data
--   • CREATE TABLE IF NOT EXISTS – no-op if table already exists
--   • FK constraints use NOT VALID so they succeed even if orphaned
--     rows are present in the existing database. The constraint is
--     then VALIDATED, which will raise an error only if true orphans
--     exist at validation time. See the note below if validation fails.
--
-- NOTE on FK validation failures:
--   If VALIDATE CONSTRAINT fails it means the database contains orphaned
--   rows that violate referential integrity. These should be reviewed and
--   cleaned up manually before re-running migration. The migration does NOT
--   automatically delete any data to avoid unintended data loss.
--
-- Table ordering ensures every referenced table is created/confirmed
-- before FK constraints that reference it are added.
-- ============================================================

-- ── users: add missing columns ────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS licence_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on_assignment boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_company_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'inspector';
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_only boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_password_change boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS abn text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_suburb text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_state text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_postcode text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_website text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS acn text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_body text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_expiry text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_insurer text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_policy_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pl_expiry text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_insurer text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_policy_number text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pi_expiry text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS report_footer_text text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free_trial';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_override_projects text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_override_inspections text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- ── invitations table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
    id serial PRIMARY KEY,
    token text NOT NULL UNIQUE,
    email text NOT NULL,
    company_name text,
    invited_by_id text NOT NULL,
    role text NOT NULL DEFAULT 'inspector',
    user_type text NOT NULL DEFAULT 'both',
    permissions text,
    expires_at timestamp NOT NULL,
    used_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email);
CREATE INDEX IF NOT EXISTS invitations_company_name_idx ON invitations(company_name);

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'both';

-- ── projects: add missing columns ─────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_admin_id integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS projects_ref_num_per_org_idx
    ON projects (reference_number, org_admin_id)
    WHERE reference_number IS NOT NULL AND org_admin_id IS NOT NULL;

-- ── projects: FK constraints ──────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_certifier' AND table_name = 'projects'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_certifier
            FOREIGN KEY (assigned_certifier_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE projects VALIDATE CONSTRAINT fk_projects_certifier;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_inspector' AND table_name = 'projects'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_inspector
            FOREIGN KEY (assigned_inspector_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE projects VALIDATE CONSTRAINT fk_projects_inspector;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_projects_creator' AND table_name = 'projects'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT fk_projects_creator
            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE projects VALIDATE CONSTRAINT fk_projects_creator;
    END IF;
END $$;

-- ── inspections: add missing columns ─────────────────────────────────────────
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS share_token text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS signed_off_at timestamp;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS signed_off_by_id integer;

-- ── inspections: FK constraints ───────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_inspections_project' AND table_name = 'inspections'
    ) THEN
        ALTER TABLE inspections
            ADD CONSTRAINT fk_inspections_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE inspections VALIDATE CONSTRAINT fk_inspections_project;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_inspections_inspector' AND table_name = 'inspections'
    ) THEN
        ALTER TABLE inspections
            ADD CONSTRAINT fk_inspections_inspector
            FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE inspections VALIDATE CONSTRAINT fk_inspections_inspector;
    END IF;
END $$;

-- ── checklist_templates: add missing columns ──────────────────────────────────
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'Class 1a';
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'Building Surveyor';
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS recurrence_type text;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS recurrence_interval integer;

-- ── checklist_items: add missing columns ──────────────────────────────────────
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS risk_level text NOT NULL DEFAULT 'medium';
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS defect_trigger boolean NOT NULL DEFAULT false;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS recommended_action text;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS include_in_report boolean NOT NULL DEFAULT true;

-- ── checklist_items: FK constraint ───────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_checklist_items_template' AND table_name = 'checklist_items'
    ) THEN
        ALTER TABLE checklist_items
            ADD CONSTRAINT fk_checklist_items_template
            FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE checklist_items VALIDATE CONSTRAINT fk_checklist_items_template;
    END IF;
END $$;

-- ── checklist_results: add missing columns ────────────────────────────────────
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS photo_markups text;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS severity text;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS trade_allocated text;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS defect_status text DEFAULT 'open';
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT true;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS recommended_action text;
ALTER TABLE checklist_results ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- ── checklist_results: FK constraints ────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_checklist_results_inspection' AND table_name = 'checklist_results'
    ) THEN
        ALTER TABLE checklist_results
            ADD CONSTRAINT fk_checklist_results_inspection
            FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE checklist_results VALIDATE CONSTRAINT fk_checklist_results_inspection;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_checklist_results_item' AND table_name = 'checklist_results'
    ) THEN
        ALTER TABLE checklist_results
            ADD CONSTRAINT fk_checklist_results_item
            FOREIGN KEY (checklist_item_id) REFERENCES checklist_items(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE checklist_results VALIDATE CONSTRAINT fk_checklist_results_item;
    END IF;
END $$;

-- ── issues: add missing columns ───────────────────────────────────────────────
ALTER TABLE issues ADD COLUMN IF NOT EXISTS closeout_notes text;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS closeout_photos text;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS markup_document_id integer;

-- ── issues: FK constraints ────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_issues_project' AND table_name = 'issues'
    ) THEN
        ALTER TABLE issues
            ADD CONSTRAINT fk_issues_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE issues VALIDATE CONSTRAINT fk_issues_project;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_issues_inspection' AND table_name = 'issues'
    ) THEN
        ALTER TABLE issues
            ADD CONSTRAINT fk_issues_inspection
            FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE issues VALIDATE CONSTRAINT fk_issues_inspection;
    END IF;
END $$;

-- ── internal_staff: add missing columns ───────────────────────────────────────
ALTER TABLE internal_staff ADD COLUMN IF NOT EXISTS email text;

-- ── trade_categories table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_categories (
    id serial PRIMARY KEY,
    company_name text NOT NULL,
    name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

-- ── org_contractors: create if missing, then add missing columns ──────────────
CREATE TABLE IF NOT EXISTS org_contractors (
    id serial PRIMARY KEY,
    company_name text NOT NULL,
    name text NOT NULL,
    trade text NOT NULL DEFAULT '',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS trade_category_id integer;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS licence_number text;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS licence_expiry date;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS registration_expiry date;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS contact_role text;
ALTER TABLE org_contractors ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS org_contractors_company_name_idx ON org_contractors(company_name);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_org_contractors_trade_category' AND table_name = 'org_contractors'
    ) THEN
        ALTER TABLE org_contractors
            ADD CONSTRAINT fk_org_contractors_trade_category
            FOREIGN KEY (trade_category_id) REFERENCES trade_categories(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE org_contractors VALIDATE CONSTRAINT fk_org_contractors_trade_category;
    END IF;
END $$;

-- ── org_contractor_project_assignments: create if missing ─────────────────────
CREATE TABLE IF NOT EXISTS org_contractor_project_assignments (
    id serial PRIMARY KEY,
    org_contractor_id integer NOT NULL,
    project_id integer NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT oca_unique_assignment UNIQUE(org_contractor_id, project_id)
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_ocpa_contractor' AND table_name = 'org_contractor_project_assignments'
    ) THEN
        ALTER TABLE org_contractor_project_assignments
            ADD CONSTRAINT fk_ocpa_contractor
            FOREIGN KEY (org_contractor_id) REFERENCES org_contractors(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE org_contractor_project_assignments VALIDATE CONSTRAINT fk_ocpa_contractor;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_ocpa_project' AND table_name = 'org_contractor_project_assignments'
    ) THEN
        ALTER TABLE org_contractor_project_assignments
            ADD CONSTRAINT fk_ocpa_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE org_contractor_project_assignments VALIDATE CONSTRAINT fk_ocpa_project;
    END IF;
END $$;

-- ── project_contractors: create if missing, then add missing columns ───────────
CREATE TABLE IF NOT EXISTS project_contractors (
    id serial PRIMARY KEY,
    project_id integer NOT NULL,
    name text NOT NULL,
    trade text NOT NULL DEFAULT '',
    email text,
    company text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS contact_role text;
ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE project_contractors ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS project_contractors_project_id_idx ON project_contractors(project_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_project_contractors_project' AND table_name = 'project_contractors'
    ) THEN
        ALTER TABLE project_contractors
            ADD CONSTRAINT fk_project_contractors_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE project_contractors VALIDATE CONSTRAINT fk_project_contractors_project;
    END IF;
END $$;

-- ── inductions: create if missing ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inductions (
    id serial PRIMARY KEY,
    project_id integer NOT NULL,
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
);

CREATE INDEX IF NOT EXISTS inductions_project_id_idx ON inductions(project_id);

ALTER TABLE inductions ADD COLUMN IF NOT EXISTS checklist_data jsonb;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_inductions_project' AND table_name = 'inductions'
    ) THEN
        ALTER TABLE inductions
            ADD CONSTRAINT fk_inductions_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE inductions VALIDATE CONSTRAINT fk_inductions_project;
    END IF;
END $$;

-- ── induction_attendees: create if missing ────────────────────────────────────
CREATE TABLE IF NOT EXISTS induction_attendees (
    id serial PRIMARY KEY,
    induction_id integer NOT NULL,
    org_contractor_id integer,
    internal_staff_id integer,
    attendee_type text NOT NULL DEFAULT 'contractor',
    contractor_name text NOT NULL,
    contractor_email text,
    contractor_trade text,
    attended boolean NOT NULL DEFAULT false,
    signed_off boolean NOT NULL DEFAULT false,
    signature_data text,
    acknowledged_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS induction_attendees_induction_id_idx ON induction_attendees(induction_id);
CREATE INDEX IF NOT EXISTS induction_attendees_org_contractor_id_idx ON induction_attendees(org_contractor_id);

ALTER TABLE induction_attendees ADD COLUMN IF NOT EXISTS internal_staff_id integer;
ALTER TABLE induction_attendees ADD COLUMN IF NOT EXISTS attendee_type text NOT NULL DEFAULT 'contractor';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_induction_attendees_induction' AND table_name = 'induction_attendees'
    ) THEN
        ALTER TABLE induction_attendees
            ADD CONSTRAINT fk_induction_attendees_induction
            FOREIGN KEY (induction_id) REFERENCES inductions(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE induction_attendees VALIDATE CONSTRAINT fk_induction_attendees_induction;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_induction_attendees_contractor' AND table_name = 'induction_attendees'
    ) THEN
        ALTER TABLE induction_attendees
            ADD CONSTRAINT fk_induction_attendees_contractor
            FOREIGN KEY (org_contractor_id) REFERENCES org_contractors(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE induction_attendees VALIDATE CONSTRAINT fk_induction_attendees_contractor;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_induction_attendees_staff' AND table_name = 'induction_attendees'
    ) THEN
        ALTER TABLE induction_attendees
            ADD CONSTRAINT fk_induction_attendees_staff
            FOREIGN KEY (internal_staff_id) REFERENCES internal_staff(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE induction_attendees VALIDATE CONSTRAINT fk_induction_attendees_staff;
    END IF;
END $$;

-- ── documents: add missing columns and FK ────────────────────────────────────
-- NOTE: inductions table is created above, so FK constraint is safe to add.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS inspection_id integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS induction_id integer;

CREATE INDEX IF NOT EXISTS documents_induction_id_idx ON documents(induction_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_documents_project' AND table_name = 'documents'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT fk_documents_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE documents VALIDATE CONSTRAINT fk_documents_project;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_documents_induction' AND table_name = 'documents'
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT fk_documents_induction
            FOREIGN KEY (induction_id) REFERENCES inductions(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE documents VALIDATE CONSTRAINT fk_documents_induction;
    END IF;
END $$;

-- ── document_checklist_links: create if missing ───────────────────────────────
CREATE TABLE IF NOT EXISTS document_checklist_links (
    id serial PRIMARY KEY,
    document_id integer NOT NULL,
    checklist_item_id integer NOT NULL,
    project_id integer NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT doc_item_unique UNIQUE(document_id, checklist_item_id)
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_dcl_document' AND table_name = 'document_checklist_links'
    ) THEN
        ALTER TABLE document_checklist_links
            ADD CONSTRAINT fk_dcl_document
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE document_checklist_links VALIDATE CONSTRAINT fk_dcl_document;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_dcl_checklist_item' AND table_name = 'document_checklist_links'
    ) THEN
        ALTER TABLE document_checklist_links
            ADD CONSTRAINT fk_dcl_checklist_item
            FOREIGN KEY (checklist_item_id) REFERENCES checklist_items(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE document_checklist_links VALIDATE CONSTRAINT fk_dcl_checklist_item;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_dcl_project' AND table_name = 'document_checklist_links'
    ) THEN
        ALTER TABLE document_checklist_links
            ADD CONSTRAINT fk_dcl_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE document_checklist_links VALIDATE CONSTRAINT fk_dcl_project;
    END IF;
END $$;

-- ── project_inspection_types: FK constraint ───────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_pit_project' AND table_name = 'project_inspection_types'
    ) THEN
        ALTER TABLE project_inspection_types
            ADD CONSTRAINT fk_pit_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE project_inspection_types VALIDATE CONSTRAINT fk_pit_project;
    END IF;
END $$;

-- ── notes: FK constraint ──────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_notes_project' AND table_name = 'notes'
    ) THEN
        ALTER TABLE notes
            ADD CONSTRAINT fk_notes_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE notes VALIDATE CONSTRAINT fk_notes_project;
    END IF;
END $$;

-- ── reports: FK constraints ───────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_reports_project' AND table_name = 'reports'
    ) THEN
        ALTER TABLE reports
            ADD CONSTRAINT fk_reports_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE reports VALIDATE CONSTRAINT fk_reports_project;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_reports_inspection' AND table_name = 'reports'
    ) THEN
        ALTER TABLE reports
            ADD CONSTRAINT fk_reports_inspection
            FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE reports VALIDATE CONSTRAINT fk_reports_inspection;
    END IF;
END $$;

-- ── activity_logs: drop NOT NULL then add FK ──────────────────────────────────
-- user_id must be nullable to support ON DELETE SET NULL (rows retained, user_id → NULL).
ALTER TABLE activity_logs ALTER COLUMN user_id DROP NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_activity_logs_user' AND table_name = 'activity_logs'
    ) THEN
        ALTER TABLE activity_logs
            ADD CONSTRAINT fk_activity_logs_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
        ALTER TABLE activity_logs VALIDATE CONSTRAINT fk_activity_logs_user;
    END IF;
END $$;

-- ── doc_templates: create if missing ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_templates (
    id serial PRIMARY KEY,
    user_id integer,
    name text NOT NULL,
    content text,
    linked_checklist_ids text DEFAULT '[]',
    background_image text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

-- ── feedbacks: create if missing ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedbacks (
    id serial PRIMARY KEY,
    user_id integer,
    sender_name text,
    sender_email text,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamp NOT NULL DEFAULT now()
);

-- ── notifications: FK constraint ──────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_notifications_user' AND table_name = 'notifications'
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT fk_notifications_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
        ALTER TABLE notifications VALIDATE CONSTRAINT fk_notifications_user;
    END IF;
END $$;

-- ── users: marketing communications opt-in columns ────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'marketing_email_opt_in'
    ) THEN
        ALTER TABLE users ADD COLUMN marketing_email_opt_in boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'marketing_email_opt_in_at'
    ) THEN
        ALTER TABLE users ADD COLUMN marketing_email_opt_in_at timestamp;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'marketing_email_source'
    ) THEN
        ALTER TABLE users ADD COLUMN marketing_email_source text;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'marketing_email_scope'
    ) THEN
        ALTER TABLE users ADD COLUMN marketing_email_scope text;
    END IF;
END $$;
