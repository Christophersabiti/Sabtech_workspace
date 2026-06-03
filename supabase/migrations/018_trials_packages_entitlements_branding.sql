-- Migration 018: Trials, package entitlements, coupons, and richer branding
--
-- Builds on subscription_plans/company_subscriptions from migration 017 while
-- keeping existing plan_id/status columns compatible with the current app.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#2952C8',
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS invoice_logo_url text,
  ADD COLUMN IF NOT EXISTS report_header_logo_url text;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS monthly_price numeric(14, 2),
  ADD COLUMN IF NOT EXISTS annual_price numeric(14, 2),
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7 CHECK (trial_days >= 0),
  ADD COLUMN IF NOT EXISTS company_limit integer,
  ADD COLUMN IF NOT EXISTS storage_limit_mb integer,
  ADD COLUMN IF NOT EXISTS document_limit integer,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

UPDATE subscription_plans
SET
  monthly_price = COALESCE(monthly_price, price),
  annual_price = COALESCE(annual_price, CASE WHEN price > 0 THEN price * 10 ELSE 0 END),
  trial_days = COALESCE(trial_days, 7),
  updated_at = now();

INSERT INTO subscription_plans (
  key,
  name,
  description,
  price,
  monthly_price,
  annual_price,
  currency,
  billing_interval,
  user_limit,
  invoice_limit,
  trial_days,
  is_active,
  is_public
) VALUES
  (
    'starter',
    'Starter',
    'For solo consultants and very small teams starting structured operations.',
    75000.00,
    75000.00,
    750000.00,
    'UGX',
    'monthly',
    3,
    50,
    7,
    true,
    true
  ),
  (
    'professional',
    'Professional',
    'For growing teams that need projects, billing, reporting, and branded documents.',
    150000.00,
    150000.00,
    1500000.00,
    'UGX',
    'monthly',
    10,
    250,
    7,
    true,
    true
  ),
  (
    'business',
    'Business',
    'For established companies running multiple teams, approvals, and advanced reporting.',
    300000.00,
    300000.00,
    3000000.00,
    'UGX',
    'monthly',
    25,
    1000,
    7,
    true,
    true
  ),
  (
    'enterprise',
    'Enterprise',
    'Custom governance, limits, onboarding, and support for larger organizations.',
    0.00,
    0.00,
    0.00,
    'UGX',
    'monthly',
    9999,
    99999,
    7,
    true,
    true
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  user_limit = EXCLUDED.user_limit,
  invoice_limit = EXCLUDED.invoice_limit,
  trial_days = EXCLUDED.trial_days,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  updated_at = now();

UPDATE subscription_plans
SET is_active = false, is_public = false, updated_at = now()
WHERE key IN ('growth', 'pro');

CREATE TABLE IF NOT EXISTS package_features (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key  text NOT NULL,
  feature_name text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  limit_value  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_package_features_package
  ON package_features(package_id);
CREATE INDEX IF NOT EXISTS idx_package_features_key
  ON package_features(feature_key);

CREATE TABLE IF NOT EXISTS coupons (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  discount_type  text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(14, 2) NOT NULL CHECK (discount_value >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  expiry_date    timestamptz,
  usage_limit    integer,
  used_count     integer NOT NULL DEFAULT 0,
  package_id     uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code_active
  ON coupons(upper(code), is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_package
  ON coupons(package_id);

ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'trial_active'
    CHECK (billing_status IN ('trial_active', 'trial_expired', 'active', 'past_due', 'cancelled', 'suspended')),
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  ADD COLUMN IF NOT EXISTS trial_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;

UPDATE company_subscriptions
SET
  trial_start_date = COALESCE(trial_start_date, starts_at),
  trial_end_date = COALESCE(trial_end_date, CASE WHEN status = 'trialing' THEN ends_at ELSE NULL END),
  current_period_start = COALESCE(current_period_start, starts_at),
  current_period_end = COALESCE(current_period_end, ends_at),
  payment_provider = COALESCE(payment_provider, 'pesapal'),
  billing_status = CASE
    WHEN status = 'active' THEN 'active'
    WHEN status = 'trialing' AND COALESCE(ends_at, now()) >= now() THEN 'trial_active'
    WHEN status = 'trialing' THEN 'trial_expired'
    WHEN status = 'expired' THEN 'trial_expired'
    WHEN status = 'canceled' THEN 'cancelled'
    WHEN status = 'suspended' THEN 'suspended'
    ELSE billing_status
  END,
  subscription_status = CASE
    WHEN status = 'active' THEN 'active'
    WHEN status = 'trialing' THEN 'trialing'
    WHEN status = 'expired' THEN 'past_due'
    WHEN status = 'canceled' THEN 'cancelled'
    WHEN status = 'suspended' THEN 'suspended'
    ELSE subscription_status
  END,
  updated_at = now();

CREATE INDEX IF NOT EXISTS idx_company_sub_billing_status
  ON company_subscriptions(company_id, billing_status);
CREATE INDEX IF NOT EXISTS idx_company_sub_trial_end
  ON company_subscriptions(trial_end_date);

ALTER TABLE package_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "package_features_select_authenticated" ON package_features;
DROP POLICY IF EXISTS "package_features_admin_all" ON package_features;
CREATE POLICY "package_features_select_authenticated"
  ON package_features FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM subscription_plans sp
      WHERE sp.id = package_features.package_id
        AND sp.is_active = true
    )
  );
CREATE POLICY "package_features_admin_all"
  ON package_features FOR ALL TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

DROP POLICY IF EXISTS "coupons_select_authenticated" ON coupons;
DROP POLICY IF EXISTS "coupons_admin_all" ON coupons;
CREATE POLICY "coupons_select_authenticated"
  ON coupons FOR SELECT TO authenticated
  USING (is_active = true);
CREATE POLICY "coupons_admin_all"
  ON coupons FOR ALL TO authenticated
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

CREATE OR REPLACE VIEW packages AS
SELECT
  id,
  key,
  name,
  description,
  monthly_price,
  annual_price,
  currency,
  trial_days,
  user_limit,
  company_limit,
  storage_limit_mb,
  document_limit,
  is_active,
  is_public,
  created_at,
  updated_at
FROM subscription_plans;

CREATE OR REPLACE FUNCTION seed_package_feature(
  p_plan_key text,
  p_feature_key text,
  p_feature_name text,
  p_enabled boolean,
  p_limit_value integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  SELECT id INTO v_plan_id FROM subscription_plans WHERE key = p_plan_key;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO package_features (
    package_id,
    feature_key,
    feature_name,
    enabled,
    limit_value
  )
  VALUES (
    v_plan_id,
    p_feature_key,
    p_feature_name,
    p_enabled,
    p_limit_value
  )
  ON CONFLICT (package_id, feature_key) DO UPDATE SET
    feature_name = EXCLUDED.feature_name,
    enabled = EXCLUDED.enabled,
    limit_value = EXCLUDED.limit_value,
    updated_at = now();
END;
$$;

SELECT seed_package_feature('starter', 'clients.create', 'Create clients', true, 25);
SELECT seed_package_feature('starter', 'projects.create', 'Create projects', true, 5);
SELECT seed_package_feature('starter', 'tasks.create', 'Create tasks', true, 100);
SELECT seed_package_feature('starter', 'invoices.create', 'Create invoices', true, 50);
SELECT seed_package_feature('starter', 'quotations.create', 'Create quotations', true, 50);
SELECT seed_package_feature('starter', 'reports.export', 'Export reports', false, NULL);
SELECT seed_package_feature('starter', 'dashboard.advanced', 'Advanced dashboards', false, NULL);
SELECT seed_package_feature('starter', 'inventory.enabled', 'Inventory module', false, NULL);
SELECT seed_package_feature('starter', 'accounting.enabled', 'Accounting reports', false, NULL);
SELECT seed_package_feature('starter', 'users.invite', 'Invite team users', true, 3);
SELECT seed_package_feature('starter', 'branding.customize', 'Customize company branding', false, NULL);
SELECT seed_package_feature('starter', 'billing.manage', 'Manage billing', true, NULL);

SELECT seed_package_feature('professional', 'clients.create', 'Create clients', true, NULL);
SELECT seed_package_feature('professional', 'projects.create', 'Create projects', true, 50);
SELECT seed_package_feature('professional', 'tasks.create', 'Create tasks', true, 1000);
SELECT seed_package_feature('professional', 'invoices.create', 'Create invoices', true, 250);
SELECT seed_package_feature('professional', 'quotations.create', 'Create quotations', true, 250);
SELECT seed_package_feature('professional', 'reports.export', 'Export reports', true, NULL);
SELECT seed_package_feature('professional', 'dashboard.advanced', 'Advanced dashboards', true, NULL);
SELECT seed_package_feature('professional', 'inventory.enabled', 'Inventory module', false, NULL);
SELECT seed_package_feature('professional', 'accounting.enabled', 'Accounting reports', false, NULL);
SELECT seed_package_feature('professional', 'users.invite', 'Invite team users', true, 10);
SELECT seed_package_feature('professional', 'branding.customize', 'Customize company branding', true, NULL);
SELECT seed_package_feature('professional', 'billing.manage', 'Manage billing', true, NULL);

SELECT seed_package_feature('business', 'clients.create', 'Create clients', true, NULL);
SELECT seed_package_feature('business', 'projects.create', 'Create projects', true, NULL);
SELECT seed_package_feature('business', 'tasks.create', 'Create tasks', true, NULL);
SELECT seed_package_feature('business', 'invoices.create', 'Create invoices', true, 1000);
SELECT seed_package_feature('business', 'quotations.create', 'Create quotations', true, 1000);
SELECT seed_package_feature('business', 'reports.export', 'Export reports', true, NULL);
SELECT seed_package_feature('business', 'dashboard.advanced', 'Advanced dashboards', true, NULL);
SELECT seed_package_feature('business', 'inventory.enabled', 'Inventory module', true, NULL);
SELECT seed_package_feature('business', 'accounting.enabled', 'Accounting reports', true, NULL);
SELECT seed_package_feature('business', 'users.invite', 'Invite team users', true, 25);
SELECT seed_package_feature('business', 'branding.customize', 'Customize company branding', true, NULL);
SELECT seed_package_feature('business', 'billing.manage', 'Manage billing', true, NULL);

SELECT seed_package_feature('enterprise', 'clients.create', 'Create clients', true, NULL);
SELECT seed_package_feature('enterprise', 'projects.create', 'Create projects', true, NULL);
SELECT seed_package_feature('enterprise', 'tasks.create', 'Create tasks', true, NULL);
SELECT seed_package_feature('enterprise', 'invoices.create', 'Create invoices', true, NULL);
SELECT seed_package_feature('enterprise', 'quotations.create', 'Create quotations', true, NULL);
SELECT seed_package_feature('enterprise', 'reports.export', 'Export reports', true, NULL);
SELECT seed_package_feature('enterprise', 'dashboard.advanced', 'Advanced dashboards', true, NULL);
SELECT seed_package_feature('enterprise', 'inventory.enabled', 'Inventory module', true, NULL);
SELECT seed_package_feature('enterprise', 'accounting.enabled', 'Accounting reports', true, NULL);
SELECT seed_package_feature('enterprise', 'users.invite', 'Invite team users', true, NULL);
SELECT seed_package_feature('enterprise', 'branding.customize', 'Customize company branding', true, NULL);
SELECT seed_package_feature('enterprise', 'billing.manage', 'Manage billing', true, NULL);

DROP FUNCTION IF EXISTS seed_package_feature(text, text, text, boolean, integer);
