-- Migration 016: Timesheets & Billable Expenses
--
-- Goals:
-- 1. Create task_time_logs table for time-tracking on tasks.
-- 2. Extend expenses table with is_billable, markup_percent, is_invoiced, invoice_id.
-- 3. Apply tenant-safe RLS using the is_company_member() security definer helper.
-- 4. Create database indexes for performance.

-- ─── 1. Create task_time_logs Table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_time_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hours_logged  numeric(5,2) NOT NULL CHECK (hours_logged > 0),
  log_date      date NOT NULL DEFAULT current_date,
  description   text,
  is_billable   boolean NOT NULL DEFAULT true,
  is_invoiced   boolean NOT NULL DEFAULT false,
  invoice_id    uuid REFERENCES invoices(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Extend expenses Table ────────────────────────────────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS markup_percent integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_invoiced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- ─── 3. Setup Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_time_logs_company_task
  ON task_time_logs(company_id, task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_log_date
  ON task_time_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_billable
  ON expenses(company_id, is_billable)
  WHERE is_billable = true;

-- ─── 4. Apply Row Level Security (RLS) ───────────────────────────────────────

ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_time_logs_all" ON task_time_logs;
CREATE POLICY "tenant_time_logs_all"
  ON task_time_logs FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
