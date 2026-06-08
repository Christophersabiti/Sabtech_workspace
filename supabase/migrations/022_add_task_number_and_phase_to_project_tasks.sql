-- Migration 022: Add task_number and phase to project_tasks
-- Goals:
-- - Add task_number (integer) and phase (text) columns to project_tasks
-- - Add automated trigger to assign task_number per project on insert if null
-- - Backfill existing tasks with sequential task_number per project

-- 1. Add columns to project_tasks
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS task_number integer,
  ADD COLUMN IF NOT EXISTS phase text;

-- 2. Create helper function to assign task_number per project
CREATE OR REPLACE FUNCTION set_project_task_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.task_number IS NULL THEN
    NEW.task_number := COALESCE(
      (SELECT MAX(task_number) FROM project_tasks WHERE project_id = NEW.project_id),
      0
    ) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create before insert trigger
DROP TRIGGER IF EXISTS trg_set_project_task_number ON project_tasks;
CREATE TRIGGER trg_set_project_task_number
  BEFORE INSERT ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_project_task_number();

-- 4. Backfill existing tasks with 1-based sequential task_number
UPDATE project_tasks
SET task_number = sub.row_num
FROM (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY sort_order, created_at) AS row_num
  FROM project_tasks
) sub
WHERE project_tasks.id = sub.id
  AND project_tasks.task_number IS NULL;
