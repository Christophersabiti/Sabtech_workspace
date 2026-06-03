-- Migration 019: Platform Super Admin guardrails and package sync
--
-- Keeps global Platform Admin access separate from tenant admin roles, seeds the
-- requested Super Admin account, and keeps company package metadata aligned with
-- subscription_plans/company_subscriptions.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Seed the requested Platform Super Admin. If the Supabase auth user already
-- exists, link to it now; otherwise keep an active email placeholder that the
-- auth callback can link on first login.
WITH auth_match AS (
  SELECT id, email, raw_user_meta_data
  FROM auth.users
  WHERE lower(email) = lower('sabiti.christopher@gmail.com')
  ORDER BY created_at
  LIMIT 1
),
seed AS (
  INSERT INTO app_users (
    auth_user_id,
    email,
    full_name,
    role,
    status,
    invited_at,
    created_at,
    updated_at
  )
  SELECT
    auth_match.id,
    coalesce(auth_match.email, 'sabiti.christopher@gmail.com'),
    coalesce(
      auth_match.raw_user_meta_data ->> 'full_name',
      auth_match.raw_user_meta_data ->> 'name',
      'Christopher Sabiti'
    ),
    'super_admin',
    'active',
    now(),
    now(),
    now()
  FROM auth_match
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = excluded.email,
    full_name = coalesce(app_users.full_name, excluded.full_name),
    role = 'super_admin',
    status = 'active',
    updated_at = now()
  RETURNING id
)
INSERT INTO app_users (
  email,
  full_name,
  role,
  status,
  invited_at,
  created_at,
  updated_at
)
SELECT
  'sabiti.christopher@gmail.com',
  'Christopher Sabiti',
  'super_admin',
  'active',
  now(),
  now(),
  now()
WHERE
  NOT EXISTS (SELECT 1 FROM seed)
  AND NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(email) = lower('sabiti.christopher@gmail.com')
      AND role = 'super_admin'
  );

-- If a placeholder was already present and the auth user now exists, link it.
UPDATE app_users au
SET
  auth_user_id = auth_match.id,
  role = 'super_admin',
  status = 'active',
  full_name = coalesce(
    au.full_name,
    auth_match.raw_user_meta_data ->> 'full_name',
    auth_match.raw_user_meta_data ->> 'name',
    'Christopher Sabiti'
  ),
  updated_at = now()
FROM (
  SELECT id, raw_user_meta_data
  FROM auth.users
  WHERE lower(email) = lower('sabiti.christopher@gmail.com')
  ORDER BY created_at
  LIMIT 1
) auth_match
WHERE lower(au.email) = lower('sabiti.christopher@gmail.com')
  AND au.auth_user_id IS NULL;

-- Ensure the seeded Super Admin can still enter the default tenant as a tenant
-- super_admin while Platform Admin checks remain based on app_users.role.
INSERT INTO company_users (
  company_id,
  app_user_id,
  auth_user_id,
  role_id,
  status,
  joined_at,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  au.id,
  au.auth_user_id,
  'super_admin',
  'active',
  now(),
  now(),
  now()
FROM app_users au
WHERE lower(au.email) = lower('sabiti.christopher@gmail.com')
  AND au.role = 'super_admin'
ON CONFLICT (company_id, app_user_id) DO UPDATE SET
  auth_user_id = coalesce(excluded.auth_user_id, company_users.auth_user_id),
  role_id = 'super_admin',
  status = 'active',
  updated_at = now();

CREATE OR REPLACE FUNCTION prevent_last_active_platform_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'super_admin' AND OLD.status = 'active' THEN
      SELECT count(*) INTO v_remaining
      FROM app_users
      WHERE role = 'super_admin'
        AND status = 'active'
        AND id <> OLD.id;

      IF v_remaining = 0 THEN
        RAISE EXCEPTION 'At least one active Platform Super Admin is required.';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  IF OLD.role = 'super_admin'
     AND OLD.status = 'active'
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    SELECT count(*) INTO v_remaining
    FROM app_users
    WHERE role = 'super_admin'
      AND status = 'active'
      AND id <> OLD.id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'At least one active Platform Super Admin is required.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_active_platform_super_admin ON app_users;
CREATE TRIGGER trg_prevent_last_active_platform_super_admin
  BEFORE UPDATE OF role, status OR DELETE ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_active_platform_super_admin();

-- Keep tenant membership rows linked when an email placeholder becomes a real
-- authenticated app user.
CREATE OR REPLACE FUNCTION sync_company_users_from_app_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE company_users
  SET
    auth_user_id = NEW.auth_user_id,
    role_id = NEW.role,
    status = CASE
      WHEN NEW.status IN ('invited', 'active', 'inactive', 'suspended') THEN NEW.status
      ELSE status
    END,
    updated_at = now()
  WHERE app_user_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_users_from_app_user ON app_users;
CREATE TRIGGER trg_sync_company_users_from_app_user
  AFTER UPDATE OF auth_user_id, role, status ON app_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_company_users_from_app_user();

-- Company Admins can manage tenant users, but only Platform Super Admins can
-- modify rows that are or become global super_admin records.
DROP POLICY IF EXISTS "app_users_company_admin_update" ON app_users;
CREATE POLICY "app_users_company_admin_update"
  ON app_users FOR UPDATE TO authenticated
  USING (
    can_manage_app_user(id)
    AND (
      role <> 'super_admin'
      OR is_platform_super_admin()
    )
  )
  WITH CHECK (
    can_manage_app_user(id)
    AND (
      role <> 'super_admin'
      OR is_platform_super_admin()
    )
  );

CREATE OR REPLACE FUNCTION normalize_subscription_plan_prices()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.monthly_price IS NULL THEN
    NEW.monthly_price := NEW.price;
  END IF;

  IF NEW.price IS DISTINCT FROM coalesce(NEW.monthly_price, NEW.price) THEN
    NEW.price := coalesce(NEW.monthly_price, NEW.price);
  END IF;

  IF NEW.annual_price IS NULL THEN
    NEW.annual_price := CASE
      WHEN coalesce(NEW.monthly_price, NEW.price, 0) > 0 THEN coalesce(NEW.monthly_price, NEW.price, 0) * 10
      ELSE 0
    END;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_plan_prices ON subscription_plans;
CREATE TRIGGER trg_normalize_subscription_plan_prices
  BEFORE INSERT OR UPDATE OF price, monthly_price, annual_price ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION normalize_subscription_plan_prices();

CREATE OR REPLACE FUNCTION sync_company_plan_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_key text;
BEGIN
  SELECT key INTO v_plan_key
  FROM subscription_plans
  WHERE id = NEW.plan_id;

  IF v_plan_key IS NOT NULL THEN
    UPDATE companies
    SET plan = v_plan_key, updated_at = now()
    WHERE id = NEW.company_id
      AND plan IS DISTINCT FROM v_plan_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_plan_from_subscription ON company_subscriptions;
CREATE TRIGGER trg_sync_company_plan_from_subscription
  AFTER INSERT OR UPDATE OF plan_id ON company_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_company_plan_from_subscription();

CREATE OR REPLACE FUNCTION sync_subscription_package_metadata()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_plans integer := 0;
  v_legacy_subscriptions integer := 0;
  v_status_rows integer := 0;
  v_company_rows integer := 0;
BEGIN
  UPDATE subscription_plans
  SET
    monthly_price = coalesce(monthly_price, price),
    price = coalesce(monthly_price, price),
    annual_price = coalesce(
      annual_price,
      CASE WHEN coalesce(monthly_price, price, 0) > 0 THEN coalesce(monthly_price, price, 0) * 10 ELSE 0 END
    ),
    updated_at = now()
  WHERE monthly_price IS NULL
     OR price IS DISTINCT FROM coalesce(monthly_price, price)
     OR annual_price IS NULL;
  GET DIAGNOSTICS v_normalized_plans = ROW_COUNT;

  WITH plan_map AS (
    SELECT old_plan.id AS old_id, new_plan.id AS new_id
    FROM subscription_plans old_plan
    JOIN subscription_plans new_plan
      ON new_plan.key = CASE
        WHEN old_plan.key = 'growth' THEN 'professional'
        WHEN old_plan.key = 'pro' THEN 'business'
      END
    WHERE old_plan.key IN ('growth', 'pro')
  )
  UPDATE company_subscriptions cs
  SET plan_id = plan_map.new_id, updated_at = now()
  FROM plan_map
  WHERE cs.plan_id = plan_map.old_id;
  GET DIAGNOSTICS v_legacy_subscriptions = ROW_COUNT;

  UPDATE company_subscriptions
  SET
    trial_start_date = coalesce(trial_start_date, starts_at),
    trial_end_date = coalesce(trial_end_date, CASE WHEN status = 'trialing' THEN ends_at ELSE NULL END),
    current_period_start = coalesce(current_period_start, starts_at),
    current_period_end = coalesce(current_period_end, ends_at),
    billing_status = CASE
      WHEN status = 'active' AND coalesce(current_period_end, ends_at, now()) < now() THEN 'past_due'
      WHEN status = 'active' THEN 'active'
      WHEN status = 'trialing' AND coalesce(trial_end_date, ends_at, now()) >= now() THEN 'trial_active'
      WHEN status = 'trialing' THEN 'trial_expired'
      WHEN status = 'expired' THEN 'trial_expired'
      WHEN status = 'canceled' THEN 'cancelled'
      WHEN status = 'suspended' THEN 'suspended'
      ELSE billing_status
    END,
    subscription_status = CASE
      WHEN status = 'active' AND coalesce(current_period_end, ends_at, now()) < now() THEN 'past_due'
      WHEN status = 'active' THEN 'active'
      WHEN status = 'trialing' THEN 'trialing'
      WHEN status = 'expired' THEN 'past_due'
      WHEN status = 'canceled' THEN 'cancelled'
      WHEN status = 'suspended' THEN 'suspended'
      ELSE subscription_status
    END,
    updated_at = now();
  GET DIAGNOSTICS v_status_rows = ROW_COUNT;

  UPDATE companies c
  SET plan = sp.key, updated_at = now()
  FROM company_subscriptions cs
  JOIN subscription_plans sp ON sp.id = cs.plan_id
  WHERE c.id = cs.company_id
    AND c.plan IS DISTINCT FROM sp.key;
  GET DIAGNOSTICS v_company_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'normalizedPlans', v_normalized_plans,
    'legacySubscriptionsUpdated', v_legacy_subscriptions,
    'subscriptionStatusesChecked', v_status_rows,
    'companiesSynced', v_company_rows
  );
END;
$$;

SELECT sync_subscription_package_metadata();
