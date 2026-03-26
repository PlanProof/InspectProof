CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" text DEFAULT 'inspector' NOT NULL,
	"phone" text,
	"avatar" text,
	"signature_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"plan" text DEFAULT 'free_trial' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan_override_projects" text,
	"plan_override_inspections" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"site_address" text NOT NULL,
	"suburb" text NOT NULL,
	"state" text NOT NULL,
	"postcode" text NOT NULL,
	"client_name" text NOT NULL,
	"builder_name" text,
	"designer_name" text,
	"da_number" text,
	"certification_number" text,
	"building_classification" text NOT NULL,
	"project_type" text DEFAULT 'residential' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stage" text DEFAULT 'pre_construction' NOT NULL,
	"assigned_certifier_id" integer,
	"assigned_inspector_id" integer,
	"created_by_id" integer,
	"start_date" date,
	"expected_completion_date" date,
	"completed_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
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
	"include_in_report" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_id" integer NOT NULL,
	"checklist_item_id" integer NOT NULL,
	"result" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"photo_urls" text,
	"photo_markups" text,
	"severity" text,
	"location" text,
	"trade_allocated" text,
	"defect_status" text DEFAULT 'open',
	"client_visible" boolean DEFAULT true NOT NULL,
	"recommended_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"inspection_type" text NOT NULL,
	"description" text,
	"folder" text DEFAULT 'Class 1a' NOT NULL,
	"discipline" text DEFAULT 'Building Surveyor' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"inspection_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"location" text,
	"code_reference" text,
	"responsible_party" text,
	"due_date" date,
	"resolved_date" date,
	"assigned_to_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_checklist_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"checklist_item_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doc_item_unique" UNIQUE("document_id","checklist_item_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
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
	"included_in_inspection" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_inspection_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"inspection_type" text NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"template_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"inspection_id" integer,
	"content" text NOT NULL,
	"author_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"inspection_id" integer,
	"title" text NOT NULL,
	"report_type" text DEFAULT 'inspection_certificate' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" text,
	"sent_to" text,
	"sent_at" timestamp,
	"submitted_at" timestamp,
	"generated_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"type" text DEFAULT 'system' NOT NULL,
	"is_read" text DEFAULT 'false' NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_configs" (
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
