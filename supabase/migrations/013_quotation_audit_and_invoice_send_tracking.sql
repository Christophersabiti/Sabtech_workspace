-- Migration 013: Quotation audit log + invoice send/reminder tracking + task billable fields
--
-- Goals:
-- - Add quotation_audit_log table with RLS
-- - Add sent_at, last_reminded_at, reminder_count to invoices
-- - Add is_billable, estimated_hours to project_tasks

-- ─── Quotation Audit Log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotation_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quotation_id uuid        NOT NULL,
  action       text        NOT NULL,
  performed_by uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  old_status   text,
  new_status   text,
  reason       text,
  metadata     jsonb,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_audit_company_performed
  ON quotation_audit_log(company_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotation_audit_quotation
  ON quotation_audit_log(quotation_id);

ALTER TABLE quotation_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_quotation_audit_read"
  ON quotation_audit_log
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

CREATE POLICY "tenant_quotation_audit_insert"
  ON quotation_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id));

-- ─── Invoice: Send Tracking Columns ──────────────────────────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS sent_at          timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count   integer NOT NULL DEFAULT 0;

-- ─── Project Tasks: Billable & Hours Columns ─────────────────────────────────

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS is_billable      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_hours  numeric(6,2);

COMMENT ON COLUMN project_tasks.is_billable     IS 'Whether time on this task is billable to the client';
COMMENT ON COLUMN project_tasks.estimated_hours IS 'Estimated hours to complete the task';
