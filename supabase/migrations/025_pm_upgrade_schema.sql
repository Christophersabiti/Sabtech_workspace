-- ============================================================================
-- Migration 025: PM Upgrade Schema
-- Adds: portfolios, milestones, RAID log, change requests, task comments,
--        task attachments, saved report templates, report audit log.
-- Alters: projects (charter fields), project_tasks (visibility/financial),
--         task_time_logs (rate/approval).
-- ============================================================================

BEGIN;

-- ─── A. ALTER projects — Charter / setup fields ─────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS objective          text,
  ADD COLUMN IF NOT EXISTS scope              text,
  ADD COLUMN IF NOT EXISTS deliverables       text,
  ADD COLUMN IF NOT EXISTS assumptions        text,
  ADD COLUMN IF NOT EXISTS exclusions         text,
  ADD COLUMN IF NOT EXISTS baseline_start_date date,
  ADD COLUMN IF NOT EXISTS baseline_due_date   date,
  ADD COLUMN IF NOT EXISTS revised_due_date    date,
  ADD COLUMN IF NOT EXISTS budget             numeric(15,2),
  ADD COLUMN IF NOT EXISTS currency           text DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS sponsor            text,
  ADD COLUMN IF NOT EXISTS approval_status    text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS project_health     text DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS project_phase      text,
  ADD COLUMN IF NOT EXISTS internal_only      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_visible     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS financial_visible  boolean DEFAULT false;

-- CHECK constraints (separate ALTER for safety)
DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT chk_projects_approval_status
    CHECK (approval_status IN ('draft','pending_approval','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE projects ADD CONSTRAINT chk_projects_health
    CHECK (project_health IN ('on_track','at_risk','off_track','completed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── B. ALTER project_tasks — Visibility + financial fields ─────────────────

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS client_id             uuid REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS assignee_id           uuid,
  ADD COLUMN IF NOT EXISTS completed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS internal_only         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_visible        boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS financial_visible     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_status        text DEFAULT 'not_invoiced',
  ADD COLUMN IF NOT EXISTS payment_status        text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS cost_estimate         numeric(15,2),
  ADD COLUMN IF NOT EXISTS actual_cost           numeric(15,2),
  ADD COLUMN IF NOT EXISTS billed_amount         numeric(15,2),
  ADD COLUMN IF NOT EXISTS paid_amount           numeric(15,2),
  ADD COLUMN IF NOT EXISTS balance_amount        numeric(15,2),
  ADD COLUMN IF NOT EXISTS report_note           text,
  ADD COLUMN IF NOT EXISTS last_update_summary   text,
  ADD COLUMN IF NOT EXISTS baseline_start_date   date,
  ADD COLUMN IF NOT EXISTS baseline_due_date     date,
  ADD COLUMN IF NOT EXISTS revised_due_date      date,
  ADD COLUMN IF NOT EXISTS actual_start_date     date,
  ADD COLUMN IF NOT EXISTS actual_completion_date date,
  ADD COLUMN IF NOT EXISTS is_critical_path      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_blocker            boolean DEFAULT false;

DO $$ BEGIN
  ALTER TABLE project_tasks ADD CONSTRAINT chk_task_invoice_status
    CHECK (invoice_status IN ('not_invoiced','pending','invoiced','paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_tasks ADD CONSTRAINT chk_task_payment_status
    CHECK (payment_status IN ('unpaid','partial','paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── C. ALTER task_time_logs — Rate + approval ──────────────────────────────

ALTER TABLE task_time_logs
  ADD COLUMN IF NOT EXISTS rate            numeric(10,2),
  ADD COLUMN IF NOT EXISTS amount          numeric(15,2),
  ADD COLUMN IF NOT EXISTS approved_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by     uuid,
  ADD COLUMN IF NOT EXISTS approved_at     timestamptz;

DO $$ BEGIN
  ALTER TABLE task_time_logs ADD CONSTRAINT chk_time_log_approved_status
    CHECK (approved_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── D. CREATE portfolios ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES clients(id) ON DELETE SET NULL,
  name             text NOT NULL,
  description      text,
  owner_id         uuid,
  start_date       date,
  end_date         date,
  status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','on_hold','completed','archived')),
  health_status    text NOT NULL DEFAULT 'on_track'
                     CHECK (health_status IN ('on_track','at_risk','off_track','completed')),
  budget_total     numeric(15,2) DEFAULT 0,
  progress_percent integer DEFAULT 0
                     CHECK (progress_percent BETWEEN 0 AND 100),
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_company ON portfolios(company_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_client  ON portfolios(client_id);


-- ─── E. CREATE portfolio_projects ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portfolio_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id  uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_projects_portfolio ON portfolio_projects(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_project   ON portfolio_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_company   ON portfolio_projects(company_id);


-- ─── F. CREATE milestones ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  target_date     date,
  actual_date     date,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','missed','cancelled')),
  progress        integer DEFAULT 0
                    CHECK (progress BETWEEN 0 AND 100),
  remarks         text,
  client_visible  boolean DEFAULT true,
  sort_order      integer DEFAULT 0,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestones_company ON milestones(company_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);


-- ─── G. CREATE milestone_tasks ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS milestone_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id  uuid NOT NULL REFERENCES milestones(id)     ON DELETE CASCADE,
  task_id       uuid NOT NULL REFERENCES project_tasks(id)  ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_tasks_milestone ON milestone_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_task      ON milestone_tasks(task_id);


-- ─── H. CREATE raid_log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raid_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  type            text NOT NULL
                    CHECK (type IN ('risk','assumption','issue','decision')),
  title           text NOT NULL,
  description     text,
  owner_id        uuid,
  severity        text DEFAULT 'medium'
                    CHECK (severity IN ('low','medium','high','critical')),
  probability     text DEFAULT 'medium'
                    CHECK (probability IN ('low','medium','high')),
  impact          text,
  mitigation      text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','mitigated','resolved','closed','accepted')),
  due_date        date,
  resolution_note text,
  client_visible  boolean DEFAULT false,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raid_log_company ON raid_log(company_id);
CREATE INDEX IF NOT EXISTS idx_raid_log_project ON raid_log(project_id);
CREATE INDEX IF NOT EXISTS idx_raid_log_type    ON raid_log(type);


-- ─── I. CREATE change_requests ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS change_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  request_number       text NOT NULL,
  title                text NOT NULL,
  description          text,
  requested_by         uuid,
  scope_impact         text,
  cost_impact          numeric(15,2),
  timeline_impact      text,
  approval_status      text NOT NULL DEFAULT 'pending'
                         CHECK (approval_status IN ('pending','approved','rejected','deferred')),
  approved_by          uuid,
  approved_date        timestamptz,
  linked_invoice_id    uuid REFERENCES invoices(id)    ON DELETE SET NULL,
  linked_quotation_id  uuid REFERENCES quotations(id)  ON DELETE SET NULL,
  client_visible       boolean DEFAULT false,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_change_requests_company ON change_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_project ON change_requests(project_id);


-- ─── J. CREATE task_comments ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES project_tasks(id)  ON DELETE CASCADE,
  user_id         uuid,
  content         text NOT NULL,
  is_internal     boolean DEFAULT true,
  client_visible  boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task    ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_company ON task_comments(company_id);


-- ─── K. CREATE task_attachments ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id)      ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES project_tasks(id)  ON DELETE CASCADE,
  uploaded_by     uuid,
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  file_size       integer,
  mime_type       text,
  is_internal     boolean DEFAULT true,
  client_visible  boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task    ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_company ON task_attachments(company_id);


-- ─── L. CREATE saved_report_templates ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS saved_report_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  template_type       text NOT NULL DEFAULT 'custom'
                        CHECK (template_type IN (
                          'client_weekly','client_monthly','internal_health',
                          'financial','task_completion','overdue_tasks',
                          'milestone','custom'
                        )),
  filters             jsonb NOT NULL DEFAULT '{}',
  visibility_options  jsonb NOT NULL DEFAULT '{}',
  financial_options   jsonb NOT NULL DEFAULT '{}',
  selected_fields     jsonb DEFAULT '[]',
  is_system           boolean DEFAULT false,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_company ON saved_report_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_type    ON saved_report_templates(company_id, template_type);


-- ─── M. CREATE report_audit_log ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_audit_log (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id                     uuid,
  action                      text NOT NULL
                                CHECK (action IN ('generated','exported_pdf','exported_csv','shared','template_used')),
  report_type                 text,
  filters_used                jsonb,
  financial_visibility_enabled boolean DEFAULT false,
  client_id                   uuid REFERENCES clients(id)  ON DELETE SET NULL,
  project_ids                 uuid[],
  export_format               text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_audit_company ON report_audit_log(company_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper: re-use existing is_company_member(uuid) function from migration 009

-- ─── Portfolios ─────────────────────────────────────────────────────────────
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_portfolios_all ON portfolios
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Portfolio Projects ─────────────────────────────────────────────────────
ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_portfolio_projects_all ON portfolio_projects
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Milestones ─────────────────────────────────────────────────────────────
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_milestones_all ON milestones
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Milestone Tasks ────────────────────────────────────────────────────────
ALTER TABLE milestone_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_milestone_tasks_all ON milestone_tasks
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── RAID Log ───────────────────────────────────────────────────────────────
ALTER TABLE raid_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_raid_log_all ON raid_log
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Change Requests ────────────────────────────────────────────────────────
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_change_requests_all ON change_requests
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Task Comments ──────────────────────────────────────────────────────────
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_task_comments_all ON task_comments
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Task Attachments ───────────────────────────────────────────────────────
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_task_attachments_all ON task_attachments
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Saved Report Templates ────────────────────────────────────────────────
ALTER TABLE saved_report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_report_templates_all ON saved_report_templates
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── Report Audit Log ──────────────────────────────────────────────────────
ALTER TABLE report_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_report_audit_all ON report_audit_log
  FOR ALL USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));


-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Re-use existing update_updated_at() trigger function from migration 001

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_raid_log_updated_at
  BEFORE UPDATE ON raid_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_change_requests_updated_at
  BEFORE UPDATE ON change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_saved_report_templates_updated_at
  BEFORE UPDATE ON saved_report_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── Auto-generate change_request.request_number ────────────────────────────

CREATE OR REPLACE FUNCTION set_change_request_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(request_number, '^CR-\d{4}-', ''), '') AS integer)
  ), 0) + 1
  INTO next_num
  FROM change_requests
  WHERE company_id = NEW.company_id;

  NEW.request_number := 'CR-' || to_char(now(), 'YYYY') || '-' || lpad(next_num::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_change_request_number
  BEFORE INSERT ON change_requests
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION set_change_request_number();


-- ═══════════════════════════════════════════════════════════════════════════════
-- AGGREGATION VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Portfolio financial aggregation view
CREATE OR REPLACE VIEW portfolio_financials AS
SELECT
  pp.portfolio_id,
  p.company_id,
  COUNT(DISTINCT p.id)                       AS project_count,
  COALESCE(SUM(p.total_contract_amount), 0)  AS budget_total,
  COALESCE(SUM(pt.total_invoiced), 0)        AS invoiced_total,
  COALESCE(SUM(pt.total_paid), 0)            AS paid_total,
  COALESCE(SUM(pt.outstanding), 0)           AS outstanding_total,
  CASE
    WHEN COUNT(DISTINCT p.id) = 0 THEN 0
    ELSE ROUND(
      (COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'completed'))::numeric
      / COUNT(DISTINCT p.id) * 100
    )
  END AS progress_percent
FROM portfolio_projects pp
JOIN projects p ON p.id = pp.project_id
LEFT JOIN project_totals pt ON pt.id = p.id
GROUP BY pp.portfolio_id, p.company_id;


-- Project financial summary view (includes expenses + time costs)
CREATE OR REPLACE VIEW project_financial_summary AS
SELECT
  p.id AS project_id,
  p.company_id,
  p.total_contract_amount                                         AS budget,
  COALESCE(pt.total_invoiced, 0)                                  AS invoiced,
  COALESCE(pt.total_paid, 0)                                      AS paid,
  COALESCE(pt.outstanding, 0)                                     AS outstanding,
  COALESCE(exp.total_expenses, 0)                                 AS total_expenses,
  COALESCE(tl.total_time_cost, 0)                                 AS total_time_cost,
  COALESCE(pt.total_paid, 0) - COALESCE(exp.total_expenses, 0)
    - COALESCE(tl.total_time_cost, 0)                             AS estimated_profit,
  CASE
    WHEN COALESCE(pt.total_paid, 0) = 0 THEN 0
    ELSE ROUND(
      ((COALESCE(pt.total_paid, 0) - COALESCE(exp.total_expenses, 0)
        - COALESCE(tl.total_time_cost, 0))
       / NULLIF(COALESCE(pt.total_paid, 0), 0) * 100)::numeric, 1
    )
  END AS profit_margin_percent
FROM projects p
LEFT JOIN project_totals pt ON pt.id = p.id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS total_expenses
  FROM expenses
  WHERE status IN ('approved','paid')
  GROUP BY project_id
) exp ON exp.project_id = p.id
LEFT JOIN (
  SELECT pt2.project_id,
         SUM(COALESCE(ttl.amount, ttl.hours_logged * COALESCE(ttl.rate, 0))) AS total_time_cost
  FROM task_time_logs ttl
  JOIN project_tasks pt2 ON pt2.id = ttl.task_id
  WHERE ttl.is_billable = true
  GROUP BY pt2.project_id
) tl ON tl.project_id = p.id;

COMMIT;
