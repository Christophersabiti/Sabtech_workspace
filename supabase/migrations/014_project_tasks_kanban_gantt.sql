-- Migration 014: Project Tasks Kanban & Gantt Enhancement
-- Goals:
-- - Extend project_tasks with priority, progress, sort_order, parent_task_id, tags
-- - Extend task status values: add backlog, in_review, blocked
-- - Create task_dependencies table
-- - Create kanban_columns table (with default columns seeded per company)
-- - Create task_activity_logs table
-- - Add performance indexes
-- - Apply tenant-safe RLS using existing is_company_member() function

-- ─── 1. Extend project_tasks status check constraint ─────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop any existing check constraint on the status column
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'project_tasks'
      AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) ILIKE '%pending%'
  LOOP
    EXECUTE 'ALTER TABLE project_tasks DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE project_tasks
  ADD CONSTRAINT project_tasks_status_check
  CHECK (status IN (
    'backlog',
    'pending',
    'in_progress',
    'in_review',
    'blocked',
    'completed',
    'cancelled'
  ));

-- ─── 2. Add new columns to project_tasks ─────────────────────────────────────

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS priority      text NOT NULL DEFAULT 'medium'
                                         CHECK (priority IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS progress      integer NOT NULL DEFAULT 0
                                         CHECK (progress >= 0 AND progress <= 100),
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES project_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags          text[] NOT NULL DEFAULT '{}';

-- ─── 3. task_dependencies table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_dependencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id           uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  dependency_type   text NOT NULL DEFAULT 'finish_to_start'
                    CHECK (dependency_type IN (
                      'finish_to_start',
                      'start_to_start',
                      'finish_to_finish',
                      'start_to_finish'
                    )),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (task_id, depends_on_task_id)
);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_task_dependencies_all" ON task_dependencies;
CREATE POLICY "tenant_task_dependencies_all"
  ON task_dependencies FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── 4. kanban_columns table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kanban_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status_key  text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  wip_limit   integer,
  color       text NOT NULL DEFAULT '#6b7280',
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_kanban_columns_all" ON kanban_columns;
CREATE POLICY "tenant_kanban_columns_all"
  ON kanban_columns FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── 5. task_activity_logs table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_id     uuid REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_task_activity_logs_all" ON task_activity_logs;
CREATE POLICY "tenant_task_activity_logs_all"
  ON task_activity_logs FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- ─── 6. Performance indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_project_tasks_company_project
  ON project_tasks(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_priority
  ON project_tasks(company_id, priority);
CREATE INDEX IF NOT EXISTS idx_project_tasks_sort_order
  ON project_tasks(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date
  ON project_tasks(company_id, end_date)
  WHERE end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_parent
  ON project_tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_deps_task
  ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on
  ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_company
  ON task_dependencies(company_id);

CREATE INDEX IF NOT EXISTS idx_task_activity_task
  ON task_activity_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_project
  ON task_activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_company
  ON task_activity_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kanban_columns_company
  ON kanban_columns(company_id);

-- ─── 7. Backfill sort_order for existing tasks ───────────────────────────────

UPDATE project_tasks
SET sort_order = row_number
FROM (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1 AS row_number
  FROM project_tasks
) sub
WHERE project_tasks.id = sub.id
  AND project_tasks.sort_order = 0;

-- ─── 8. Seed default Kanban columns for all existing companies ───────────────

INSERT INTO kanban_columns (company_id, name, status_key, sort_order, color, is_default)
SELECT
  c.id,
  col.name,
  col.status_key,
  col.sort_order,
  col.color,
  true
FROM companies c
CROSS JOIN (VALUES
  ('Backlog',     'backlog',     0, '#94a3b8'),
  ('Not Started', 'pending',     1, '#64748b'),
  ('In Progress', 'in_progress', 2, '#3b82f6'),
  ('In Review',   'in_review',   3, '#8b5cf6'),
  ('Blocked',     'blocked',     4, '#ef4444'),
  ('Completed',   'completed',   5, '#22c55e'),
  ('Cancelled',   'cancelled',   6, '#6b7280')
) AS col(name, status_key, sort_order, color)
WHERE NOT EXISTS (
  SELECT 1 FROM kanban_columns kc
  WHERE kc.company_id = c.id
    AND kc.is_default = true
    AND kc.status_key = col.status_key
);

-- ─── 9. Auto-update trigger for kanban_columns ───────────────────────────────

CREATE OR REPLACE FUNCTION update_kanban_columns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kanban_columns_updated_at ON kanban_columns;
CREATE TRIGGER trg_kanban_columns_updated_at
  BEFORE UPDATE ON kanban_columns
  FOR EACH ROW EXECUTE FUNCTION update_kanban_columns_updated_at();
