-- Migration 017: SaaS Billing & Subscriptions with Pesapal
--
-- Goals:
-- - Store SaaS plans, active tenant subscriptions, transaction logs, and Pesapal credentials.
-- - Ensure strict RLS rules for tenant isolation and super_admin control.

-- 1. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text UNIQUE NOT NULL, -- e.g. 'starter', 'growth', 'pro', 'enterprise'
  name              text NOT NULL,
  description       text,
  price             numeric(14, 2) NOT NULL DEFAULT 0.00,
  currency          text NOT NULL DEFAULT 'UGX',
  billing_interval  text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly', 'one_time')),
  user_limit        integer NOT NULL DEFAULT 3,
  invoice_limit     integer NOT NULL DEFAULT 50,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_plans_key ON subscription_plans(key);
CREATE INDEX IF NOT EXISTS idx_sub_plans_active ON subscription_plans(is_active);

-- Seed default plans
INSERT INTO subscription_plans (key, name, description, price, currency, user_limit, invoice_limit, is_active) VALUES
  ('starter', 'Starter', 'Perfect for small teams and solo consultants.', 75000.00, 'UGX', 3, 50, true),
  ('growth', 'Growth', 'Ideal for growing businesses needing team collaboration.', 150000.00, 'UGX', 10, 200, true),
  ('pro', 'Pro', 'Full capacity for large consultancies and agencies.', 300000.00, 'UGX', 25, 1000, true),
  ('enterprise', 'Enterprise', 'Custom integration, custom limits, dedicated infrastructure.', 0.00, 'UGX', 9999, 99999, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  user_limit = EXCLUDED.user_limit,
  invoice_limit = EXCLUDED.invoice_limit,
  updated_at = now();

-- 2. COMPANY SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status      text NOT NULL DEFAULT 'trialing' CHECK (status IN ('active', 'trialing', 'expired', 'canceled', 'suspended')),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_sub_company ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sub_status ON company_subscriptions(status);

-- Seed default subscription for Sabtech Online (Starter Plan as default active)
INSERT INTO company_subscriptions (company_id, plan_id, status, starts_at, ends_at)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  id,
  'active',
  now(),
  now() + interval '100 years'
FROM subscription_plans 
WHERE key = 'starter'
ON CONFLICT (company_id) DO NOTHING;

-- 3. BILLING TRANSACTIONS
CREATE TABLE IF NOT EXISTS billing_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id             uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  pesapal_tracking_id text UNIQUE,
  merchant_reference  text UNIQUE NOT NULL,
  amount              numeric(14, 2) NOT NULL,
  currency            text NOT NULL DEFAULT 'UGX',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'invalid')),
  payment_method      text,
  payment_account     text,
  error_message       text,
  raw_response        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_tx_company ON billing_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_tx_reference ON billing_transactions(merchant_reference);
CREATE INDEX IF NOT EXISTS idx_billing_tx_status ON billing_transactions(status);

-- 4. PESAPAL GATEWAY SETTINGS
CREATE TABLE IF NOT EXISTS pesapal_settings (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  consumer_key    text,
  consumer_secret text,
  ipn_id          text,
  sandbox_mode    boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed default config row (empty keys to start)
INSERT INTO pesapal_settings (id, consumer_key, consumer_secret, ipn_id, sandbox_mode)
VALUES (1, '', '', '', true)
ON CONFLICT (id) DO NOTHING;

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesapal_settings ENABLE ROW LEVEL SECURITY;

-- RLS helper checks
CREATE OR REPLACE FUNCTION is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM app_users 
    WHERE auth_user_id = auth.uid() 
      AND role = 'super_admin' 
      AND status = 'active'
  )
$$;

-- RLS POLICIES

-- Subscription Plans Policies
CREATE POLICY "plans_select_authenticated" ON subscription_plans
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "plans_admin_all" ON subscription_plans
  FOR ALL TO authenticated 
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Company Subscriptions Policies
CREATE POLICY "company_sub_select_members" ON company_subscriptions
  FOR SELECT TO authenticated 
  USING (is_company_member(company_id));

CREATE POLICY "company_sub_admin_all" ON company_subscriptions
  FOR ALL TO authenticated 
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Billing Transactions Policies
CREATE POLICY "billing_tx_select_members" ON billing_transactions
  FOR SELECT TO authenticated 
  USING (is_company_member(company_id));

CREATE POLICY "billing_tx_admin_all" ON billing_transactions
  FOR ALL TO authenticated 
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());

-- Pesapal Settings Policies (restricted to platform admins only; keys never leaked to clients)
CREATE POLICY "pesapal_settings_admin_all" ON pesapal_settings
  FOR ALL TO authenticated 
  USING (is_platform_super_admin())
  WITH CHECK (is_platform_super_admin());
