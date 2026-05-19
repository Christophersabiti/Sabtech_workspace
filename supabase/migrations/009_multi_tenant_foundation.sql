-- Migration 009: Multi-tenant foundation
--
-- Phase 1 goal:
-- - Introduce companies and company_users.
-- - Backfill all existing data into a deterministic default company.
-- - Add company_id to tenant-owned tables.
-- - Replace broad authenticated RLS with tenant membership checks.
--
-- This preserves the current single-company app because new rows default to
-- the seeded company. Later phases should pass the active company_id explicitly.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Stable default tenant used to preserve existing single-company behavior.
-- Do not change this UUID after data has been migrated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_status') THEN
    CREATE TYPE company_status AS ENUM ('active', 'suspended', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  status          company_status NOT NULL DEFAULT 'active',
  owner_user_id   uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  app_user_id   uuid REFERENCES app_users(id) ON DELETE CASCADE,
  auth_user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id       text NOT NULL DEFAULT 'staff' REFERENCES roles(id),
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('invited', 'active', 'inactive', 'suspended')),
  invited_by    uuid REFERENCES app_users(id) ON DELETE SET NULL,
  joined_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, auth_user_id),
  UNIQUE (company_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_users_auth
  ON company_users(auth_user_id, status);
CREATE INDEX IF NOT EXISTS idx_company_users_company
  ON company_users(company_id, status);

INSERT INTO companies (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Sabtech Online', 'sabtech-online', 'active')
ON CONFLICT (id) DO NOTHING;

UPDATE companies
SET owner_user_id = COALESCE(
  owner_user_id,
  (SELECT id FROM app_users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1),
  (SELECT id FROM app_users ORDER BY created_at LIMIT 1)
)
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO company_users (
  company_id,
  app_user_id,
  auth_user_id,
  role_id,
  status,
  invited_by,
  joined_at
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  au.id,
  au.auth_user_id,
  au.role,
  CASE WHEN au.status IN ('active', 'invited', 'inactive', 'suspended') THEN au.status ELSE 'active' END,
  au.invited_by,
  COALESCE(au.last_login_at, au.created_at)
FROM app_users au
WHERE au.auth_user_id IS NOT NULL
ON CONFLICT (company_id, auth_user_id) DO UPDATE
SET
  app_user_id = EXCLUDED.app_user_id,
  role_id = EXCLUDED.role_id,
  status = EXCLUDED.status,
  updated_at = now();

CREATE OR REPLACE FUNCTION sync_company_users_from_app_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE company_users
  SET
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
  AFTER UPDATE OF role, status ON app_users
  FOR EACH ROW EXECUTE FUNCTION sync_company_users_from_app_user();

-- Tenant helper functions used by RLS and server-side checks.
CREATE OR REPLACE FUNCTION current_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.company_id
  FROM company_users cu
  WHERE cu.auth_user_id = auth.uid()
    AND cu.status = 'active'
$$;

CREATE OR REPLACE FUNCTION is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.auth_user_id = auth.uid()
      AND cu.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.auth_user_id = auth.uid()
      AND cu.status = 'active'
      AND cu.role_id IN ('super_admin', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION can_manage_app_user(p_app_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_users manager
    JOIN company_users target
      ON target.company_id = manager.company_id
    WHERE manager.auth_user_id = auth.uid()
      AND manager.status = 'active'
      AND manager.role_id IN ('super_admin', 'admin')
      AND target.app_user_id = p_app_user_id
  )
$$;

CREATE OR REPLACE FUNCTION shares_company_with_app_user(p_app_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_users current_member
    JOIN company_users target
      ON target.company_id = current_member.company_id
    WHERE current_member.auth_user_id = auth.uid()
      AND current_member.status = 'active'
      AND target.app_user_id = p_app_user_id
  )
$$;

-- Add company_id to every tenant-owned table. Default keeps current inserts working.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE invoice_schedules
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE client_audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE invoice_audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE payment_audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE RESTRICT
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Backfill child rows from their parents where possible.
UPDATE projects p SET company_id = c.company_id FROM clients c WHERE p.client_id = c.id;
UPDATE invoice_schedules s SET company_id = p.company_id FROM projects p WHERE s.project_id = p.id;
UPDATE invoices i SET company_id = c.company_id FROM clients c WHERE i.client_id = c.id;
UPDATE invoice_items ii SET company_id = i.company_id FROM invoices i WHERE ii.invoice_id = i.id;
UPDATE payments p SET company_id = i.company_id FROM invoices i WHERE p.invoice_id = i.id;
UPDATE client_audit_log al SET company_id = c.company_id FROM clients c WHERE al.client_id = c.id;
UPDATE invoice_audit_log al SET company_id = i.company_id FROM invoices i WHERE al.invoice_id = i.id;
UPDATE payment_audit_log al SET company_id = p.company_id FROM payments p WHERE al.payment_id = p.id;
UPDATE quotations q SET company_id = c.company_id FROM clients c WHERE q.client_id = c.id;
UPDATE quotation_items qi SET company_id = q.company_id FROM quotations q WHERE qi.quotation_id = q.id;
UPDATE project_tasks t SET company_id = p.company_id FROM projects p WHERE t.project_id = p.id;

-- Enforce company_id after all rows are backfilled.
ALTER TABLE clients ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE services ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invoice_schedules ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invoice_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE company_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payment_methods ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invitations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE client_audit_log ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE invoice_audit_log ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payment_audit_log ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE quotations ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE quotation_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE project_tasks ALTER COLUMN company_id SET NOT NULL;

-- Tenant-aware uniqueness for future SaaS operation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_client_code_key'
  ) THEN
    ALTER TABLE clients DROP CONSTRAINT clients_client_code_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_code_key'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT projects_project_code_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_number_key'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_invoice_number_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_payment_number_key'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_payment_number_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_service_code_key'
  ) THEN
    ALTER TABLE services DROP CONSTRAINT services_service_code_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_quotation_number_key'
  ) THEN
    ALTER TABLE quotations DROP CONSTRAINT quotations_quotation_number_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_company_code ON clients(company_id, client_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_company_code ON services(company_id, service_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_company_code ON projects(company_id, project_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_number ON invoices(company_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_number ON payments(company_id, payment_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_company_number ON quotations(company_id, quotation_number);

-- company_settings was originally a single-row table with id = 1. For SaaS it
-- must become one settings row per company. Keep the id column for compatibility,
-- but make company_id the tenant-unique key used by new code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_pkey'
  ) THEN
    ALTER TABLE company_settings DROP CONSTRAINT company_settings_pkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_id_check'
  ) THEN
    ALTER TABLE company_settings DROP CONSTRAINT company_settings_id_check;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_settings_company
  ON company_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_clients_company_status ON clients(company_id, status);
CREATE INDEX IF NOT EXISTS idx_services_company_active ON services(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_projects_company_status ON projects(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_company_status ON payments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_quotations_company_status ON quotations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON project_tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_company_settings_company ON company_settings(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_company ON payment_methods(company_id, is_active);

-- Enable RLS on tenant foundation tables.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_member_select" ON companies;
DROP POLICY IF EXISTS "companies_member_insert" ON companies;
DROP POLICY IF EXISTS "companies_admin_update" ON companies;
CREATE POLICY "companies_member_select"
  ON companies FOR SELECT TO authenticated
  USING (is_company_member(id));
CREATE POLICY "companies_member_insert"
  ON companies FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "companies_admin_update"
  ON companies FOR UPDATE TO authenticated
  USING (is_company_admin(id))
  WITH CHECK (is_company_admin(id));

DROP POLICY IF EXISTS "company_users_member_select" ON company_users;
DROP POLICY IF EXISTS "company_users_admin_write" ON company_users;
CREATE POLICY "company_users_member_select"
  ON company_users FOR SELECT TO authenticated
  USING (is_company_member(company_id));
CREATE POLICY "company_users_admin_write"
  ON company_users FOR ALL TO authenticated
  USING (is_company_admin(company_id))
  WITH CHECK (is_company_admin(company_id));

-- Replace broad policies on tenant-owned tables.
DROP POLICY IF EXISTS "auth_clients_all" ON clients;
DROP POLICY IF EXISTS "auth_services_all" ON services;
DROP POLICY IF EXISTS "auth_projects_all" ON projects;
DROP POLICY IF EXISTS "auth_invoices_all" ON invoices;
DROP POLICY IF EXISTS "auth_items_all" ON invoice_items;
DROP POLICY IF EXISTS "auth_payments_all" ON payments;
DROP POLICY IF EXISTS "auth_schedules_all" ON invoice_schedules;
DROP POLICY IF EXISTS "auth_audit_all" ON audit_log;
DROP POLICY IF EXISTS "auth_client_audit" ON client_audit_log;
DROP POLICY IF EXISTS "auth_invoice_audit" ON invoice_audit_log;
DROP POLICY IF EXISTS "auth_payment_audit" ON payment_audit_log;
DROP POLICY IF EXISTS "auth_write_company" ON company_settings;
DROP POLICY IF EXISTS "auth_write_pm" ON payment_methods;
DROP POLICY IF EXISTS "auth_invites_all" ON invitations;
DROP POLICY IF EXISTS "auth_all_quotations" ON quotations;
DROP POLICY IF EXISTS "auth_all_quotation_items" ON quotation_items;
DROP POLICY IF EXISTS "auth_all_project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "auth_users_all" ON app_users;
DROP POLICY IF EXISTS "auth_overrides_all" ON user_permission_overrides;
DROP POLICY IF EXISTS "auth_roles_write" ON roles;
DROP POLICY IF EXISTS "auth_roles_update" ON roles;
DROP POLICY IF EXISTS "auth_roles_delete" ON roles;

CREATE POLICY "tenant_clients_all" ON clients FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_services_all" ON services FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_projects_all" ON projects FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_invoice_schedules_all" ON invoice_schedules FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_invoices_all" ON invoices FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_invoice_items_all" ON invoice_items FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_payments_all" ON payments FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_audit_all" ON audit_log FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_client_audit_all" ON client_audit_log FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_invoice_audit_all" ON invoice_audit_log FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_payment_audit_all" ON payment_audit_log FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_company_settings_select" ON company_settings FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY "tenant_company_settings_write" ON company_settings FOR ALL TO authenticated USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "tenant_payment_methods_select" ON payment_methods FOR SELECT TO authenticated USING (is_company_member(company_id));
CREATE POLICY "tenant_payment_methods_write" ON payment_methods FOR ALL TO authenticated USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "tenant_invitations_all" ON invitations FOR ALL TO authenticated USING (is_company_admin(company_id)) WITH CHECK (is_company_admin(company_id));
CREATE POLICY "tenant_quotations_all" ON quotations FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_quotation_items_all" ON quotation_items FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY "tenant_project_tasks_all" ON project_tasks FOR ALL TO authenticated USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

CREATE POLICY "app_users_self_or_company_select"
  ON app_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR shares_company_with_app_user(id));
CREATE POLICY "app_users_company_admin_update"
  ON app_users FOR UPDATE TO authenticated
  USING (can_manage_app_user(id))
  WITH CHECK (can_manage_app_user(id));

CREATE POLICY "overrides_company_admin_all"
  ON user_permission_overrides FOR ALL TO authenticated
  USING (can_manage_app_user(app_user_id))
  WITH CHECK (can_manage_app_user(app_user_id));

CREATE POLICY "roles_admin_insert"
  ON roles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role_id IN ('super_admin', 'admin')
  ));
CREATE POLICY "roles_admin_update"
  ON roles FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM company_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role_id IN ('super_admin', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role_id IN ('super_admin', 'admin')
  ));
CREATE POLICY "roles_admin_delete"
  ON roles FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM company_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role_id IN ('super_admin', 'admin')
  ));

-- Keep invite acceptance possible before login only for valid pending invite lookup.
DROP POLICY IF EXISTS "anon_read_invitations_by_token" ON invitations;
CREATE POLICY "anon_read_invitations_by_token"
  ON invitations FOR SELECT
  TO anon
  USING (status = 'pending' AND expires_at > now());

DROP POLICY IF EXISTS "invitee_read_own_pending_invitation" ON invitations;
CREATE POLICY "invitee_read_own_pending_invitation"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Global role catalog remains readable; writes still restricted by existing policies.
-- Public company settings reads from earlier migrations are intentionally removed
-- for SaaS safety. Add a tenant-aware public branding endpoint in a later phase.
DROP POLICY IF EXISTS "public_read_company_settings" ON company_settings;
DROP POLICY IF EXISTS "public_read_payment_methods" ON payment_methods;

-- Tenant-isolate company asset writes. Public reads remain enabled because PDF
-- documents and email previews need logo URLs without a signed app session.
DROP POLICY IF EXISTS "company_assets_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "company_assets_tenant_delete" ON storage.objects;

CREATE POLICY "company_assets_tenant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT current_company_ids::text FROM current_company_ids()
    )
  );

CREATE POLICY "company_assets_tenant_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT current_company_ids::text FROM current_company_ids()
    )
  )
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT current_company_ids::text FROM current_company_ids()
    )
  );

CREATE POLICY "company_assets_tenant_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT current_company_ids::text FROM current_company_ids()
    )
  );
