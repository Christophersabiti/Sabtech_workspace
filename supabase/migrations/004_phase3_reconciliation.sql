-- ============================================================
-- Sabtech Online — Phase 3A: Reconciliation & Client Enhancements
-- Run this in Supabase SQL Editor AFTER migrations 001, 002, 003
-- ============================================================

-- ─── 1. CLIENTS: add missing columns ────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS alternate_phone  text,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS country          text DEFAULT 'Uganda',
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive')),
  ADD COLUMN IF NOT EXISTS updated_by       uuid;
  -- updated_by references app_users(id) — added as soft ref to avoid FK
  -- issues if app_users migration hasn't been run yet

-- ─── 2. INVOICES: add void columns + extend status check ─────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS void_reason  text,
  ADD COLUMN IF NOT EXISTS voided_at    timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by    uuid;

-- Extend the status constraint to include 'void'
-- First drop the old check, then re-add with void included
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void'));

-- ─── 3. PAYMENTS: add status + reversal columns ──────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'confirmed'
                           CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
  ADD COLUMN IF NOT EXISTS reversal_reason  text,
  ADD COLUMN IF NOT EXISTS reversed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by      uuid;

-- ─── 4. CLIENT AUDIT LOG ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  changed_by  uuid,       -- references app_users(id), soft ref
  changed_at  timestamptz NOT NULL DEFAULT now(),
  field_name  text        NOT NULL,
  old_value   text,
  new_value   text
);

-- ─── 5. INVOICE AUDIT LOG ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action       text        NOT NULL,
  performed_by uuid,       -- references app_users(id), soft ref
  performed_at timestamptz NOT NULL DEFAULT now(),
  old_status   text,
  new_status   text,
  reason       text,
  metadata     jsonb
);

-- ─── 6. PAYMENT AUDIT LOG ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  action       text        NOT NULL,
  performed_by uuid,       -- references app_users(id), soft ref
  performed_at timestamptz NOT NULL DEFAULT now(),
  old_status   text,
  new_status   text,
  reason       text,
  amount       numeric(15,2),
  metadata     jsonb
);

-- ─── 7. INDEXES ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_audit_client_id   ON client_audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_client_audit_changed_at  ON client_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_invoice_id ON invoice_audit_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_action     ON invoice_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_payment_audit_payment_id ON payment_audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_audit_action     ON payment_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_clients_status           ON clients(status);
CREATE INDEX IF NOT EXISTS idx_payments_status          ON payments(status);
CREATE INDEX IF NOT EXISTS idx_invoices_status          ON invoices(status);

-- ─── 8. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE client_audit_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_log ENABLE ROW LEVEL SECURITY;

-- Open policies (same pattern as other tables — tighten per-role later)
DROP POLICY IF EXISTS "open_client_audit"  ON client_audit_log;
DROP POLICY IF EXISTS "open_invoice_audit" ON invoice_audit_log;
DROP POLICY IF EXISTS "open_payment_audit" ON payment_audit_log;

CREATE POLICY "open_client_audit"  ON client_audit_log  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_invoice_audit" ON invoice_audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "open_payment_audit" ON payment_audit_log FOR ALL USING (true) WITH CHECK (true);

-- ─── 9. CLIENT FILTER RPC ───────────────────────────────────────────────────
-- Used by the advanced client filter panel
CREATE OR REPLACE FUNCTION get_clients_filtered(
  p_search              text    DEFAULT NULL,
  p_status              text[]  DEFAULT NULL,
  p_country             text    DEFAULT NULL,
  p_currency            text    DEFAULT NULL,
  p_has_overdue         boolean DEFAULT NULL,
  p_has_active_projects boolean DEFAULT NULL,
  p_min_outstanding     numeric DEFAULT NULL,
  p_max_outstanding     numeric DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  client_code      text,
  name             text,
  company_name     text,
  contact_person   text,
  email            text,
  phone            text,
  alternate_phone  text,
  address          text,
  city             text,
  country          text,
  tin_number       text,
  currency         text,
  notes            text,
  status           text,
  is_archived      boolean,
  created_at       timestamptz,
  updated_at       timestamptz,
  active_projects  bigint,
  total_outstanding numeric,
  has_overdue      boolean
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id,
    c.client_code,
    c.name,
    c.company_name,
    c.contact_person,
    c.email,
    c.phone,
    c.alternate_phone,
    c.address,
    c.city,
    c.country,
    c.tin_number,
    c.currency,
    c.notes,
    c.status,
    c.is_archived,
    c.created_at,
    c.updated_at,
    COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active')              AS active_projects,
    COALESCE(SUM(i.balance_due) FILTER (
      WHERE i.status NOT IN ('void', 'draft', 'cancelled')
    ), 0)                                                                  AS total_outstanding,
    BOOL_OR(i.status = 'overdue')                                          AS has_overdue
  FROM clients c
  LEFT JOIN projects p ON p.client_id = c.id
  LEFT JOIN invoices i ON i.client_id = c.id
  WHERE
    c.is_archived = false
    AND (p_search   IS NULL OR
         c.name         ILIKE '%' || p_search || '%' OR
         c.company_name ILIKE '%' || p_search || '%' OR
         c.email        ILIKE '%' || p_search || '%' OR
         c.phone        ILIKE '%' || p_search || '%')
    AND (p_status   IS NULL OR c.status = ANY(p_status))
    AND (p_country  IS NULL OR c.country = p_country)
    AND (p_currency IS NULL OR c.currency = p_currency)
  GROUP BY c.id
  HAVING
    (p_has_overdue         IS NULL OR BOOL_OR(i.status = 'overdue') = p_has_overdue)
    AND (p_has_active_projects IS NULL OR
         (COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') > 0) = p_has_active_projects)
    AND (p_min_outstanding IS NULL OR
         COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         >= p_min_outstanding)
    AND (p_max_outstanding IS NULL OR
         COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         <= p_max_outstanding)
  ORDER BY c.name;
$$;

-- ─── 10. PROJECT TOTALS VIEW ─────────────────────────────────────────────────
-- Reusable view for client profile projects tab
CREATE OR REPLACE VIEW project_totals AS
SELECT
  p.id,
  p.client_id,
  p.project_code,
  p.project_name,
  p.description,
  p.billing_type,
  p.status,
  p.total_contract_amount,
  p.project_manager,
  p.start_date,
  p.end_date,
  p.notes,
  p.created_at,
  p.updated_at,
  COALESCE(SUM(i.total_amount) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0)                                                AS total_invoiced,
  COALESCE(SUM(i.total_paid) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0)                                                AS total_paid,
  COALESCE(SUM(i.balance_due) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0)                                                AS outstanding
FROM projects p
LEFT JOIN invoices i ON i.project_id = p.id
GROUP BY p.id;

-- ─── Done ────────────────────────────────────────────────────────────────────
-- Verify with:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'clients';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'payments';
-- SELECT table_name  FROM information_schema.tables   WHERE table_name LIKE '%audit%';
