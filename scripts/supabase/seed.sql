-- ── Seed: Plan configs ────────────────────────────────────────────────────────
INSERT INTO plan_configs (plan_key, label, description, features, max_projects, max_inspections_monthly, max_inspections_total, max_team_members, is_popular, is_best_value, sort_order)
VALUES
  ('free_trial', 'Free Trial', '14-day trial with limited access', '["1 project","10 inspections total","Basic reports"]', '1', NULL, '10', '1', false, false, '0'),
  ('starter', 'Starter', '$59/mo — small operators', '["Unlimited projects","50 inspections/month","PDF reports","Email support"]', NULL, '50', NULL, '3', false, false, '1'),
  ('professional', 'Professional', '$149/mo — growing businesses', '["Unlimited projects","Unlimited inspections","Advanced reports","Priority support"]', NULL, NULL, NULL, '10', true, false, '2'),
  ('enterprise', 'Enterprise', 'Custom — large organisations', '["Everything in Professional","Custom integrations","Dedicated support","SLA"]', NULL, NULL, NULL, NULL, false, true, '3')
ON CONFLICT (plan_key) DO NOTHING;

-- ── Seed: Default admin user ──────────────────────────────────────────────────
-- Password: InspectProof2024!
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
