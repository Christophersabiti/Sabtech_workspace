-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Tighten RLS — require authentication on all core tables
--
-- Problem: Migration 002 replaced all policies with `using (true)` which
-- allowed unauthenticated (anon) reads AND writes on every table.
-- Migration 003/004 repeated the same pattern for admin and audit tables.
--
-- Fix: Drop every open/service_write policy and replace with
--      `TO authenticated` so anon users get nothing.
--      Role-level scoping (e.g. client sees only own invoices) will be
--      layered on in a future migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Core business tables (from migration 002) ───────────────────────────

DROP POLICY IF EXISTS "open_clients_all"   ON clients;
DROP POLICY IF EXISTS "open_services_all"  ON services;
DROP POLICY IF EXISTS "open_projects_all"  ON projects;
DROP POLICY IF EXISTS "open_invoices_all"  ON invoices;
DROP POLICY IF EXISTS "open_items_all"     ON invoice_items;
DROP POLICY IF EXISTS "open_payments_all"  ON payments;
DROP POLICY IF EXISTS "open_schedules_all" ON invoice_schedules;
DROP POLICY IF EXISTS "open_audit_all"     ON audit_log;

CREATE POLICY "auth_clients_all"    ON clients           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_services_all"   ON services          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_projects_all"   ON projects          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_invoices_all"   ON invoices          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_items_all"      ON invoice_items     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_payments_all"   ON payments          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_schedules_all"  ON invoice_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_audit_all"      ON audit_log         FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Audit log tables (from migration 004) ──────────────────────────────

DROP POLICY IF EXISTS "open_client_audit"  ON client_audit_log;
DROP POLICY IF EXISTS "open_invoice_audit" ON invoice_audit_log;
DROP POLICY IF EXISTS "open_payment_audit" ON payment_audit_log;

CREATE POLICY "auth_client_audit"  ON client_audit_log  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_invoice_audit" ON invoice_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_payment_audit" ON payment_audit_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Admin tables (from migration 003) ─────────────────────────────────
-- company_settings and payment_methods: keep public SELECT (needed for
-- invoice rendering and login page branding) but lock down writes to
-- authenticated users only.

DROP POLICY IF EXISTS "service_write_company" ON company_settings;
DROP POLICY IF EXISTS "service_write_pm"      ON payment_methods;

CREATE POLICY "auth_write_company" ON company_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_write_pm"      ON payment_methods  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- app_users: authenticated read/write (admin API uses service role which
-- bypasses RLS; regular users can read own row for role resolution).
DROP POLICY IF EXISTS "service_write_users" ON app_users;
CREATE POLICY "auth_users_all" ON app_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- invitations: authenticated read/write (admin operations use service role).
DROP POLICY IF EXISTS "service_write_invites" ON invitations;
CREATE POLICY "auth_invites_all" ON invitations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- user_permission_overrides: authenticated only.
DROP POLICY IF EXISTS "service_write_overrides" ON user_permission_overrides;
CREATE POLICY "auth_overrides_all" ON user_permission_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- roles: keep public read (needed by permission matrix UI before full auth
-- loads), lock writes to authenticated.
DROP POLICY IF EXISTS "service_write_roles" ON roles;
CREATE POLICY "auth_roles_write" ON roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_roles_update" ON roles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_roles_delete" ON roles FOR DELETE TO authenticated USING (true);

-- ── 4. Accept-invite endpoint: invitations need to be readable by the
--    anon role during the accept flow (unauthenticated token lookup).
--    Scope this to SELECT only on the token column path.
DROP POLICY IF EXISTS "anon_read_invitations_by_token" ON invitations;
CREATE POLICY "anon_read_invitations_by_token"
  ON invitations FOR SELECT
  TO anon
  USING (status = 'pending' AND expires_at > now());
