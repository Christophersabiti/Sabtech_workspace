-- Phase 1 WBS hierarchy hardening
-- Ensures project_tasks.parent_task_id stays inside the same company/project and cannot create cycles.

UPDATE project_tasks child
SET parent_task_id = NULL
WHERE child.parent_task_id IS NOT NULL
  AND (
    child.parent_task_id = child.id
    OR NOT EXISTS (
      SELECT 1
      FROM project_tasks parent
      WHERE parent.id = child.parent_task_id
        AND parent.company_id = child.company_id
        AND parent.project_id IS NOT DISTINCT FROM child.project_id
    )
  );

CREATE OR REPLACE FUNCTION validate_project_task_parent_scope()
RETURNS trigger AS $$
DECLARE
  parent_company_id uuid;
  parent_project_id uuid;
  creates_cycle boolean;
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'A task cannot be its own parent.';
  END IF;

  SELECT company_id, project_id
    INTO parent_company_id, parent_project_id
  FROM project_tasks
  WHERE id = NEW.parent_task_id;

  IF parent_company_id IS NULL THEN
    RAISE EXCEPTION 'Parent task % does not exist.', NEW.parent_task_id;
  END IF;

  IF parent_company_id <> NEW.company_id
     OR parent_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Parent task must belong to the same company and project.';
  END IF;

  WITH RECURSIVE ancestors(id, parent_task_id, path) AS (
    SELECT id, parent_task_id, ARRAY[id]
    FROM project_tasks
    WHERE id = NEW.parent_task_id

    UNION ALL

    SELECT task.id, task.parent_task_id, ancestors.path || task.id
    FROM project_tasks task
    JOIN ancestors ON task.id = ancestors.parent_task_id
    WHERE NOT task.id = ANY(ancestors.path)
  )
  SELECT EXISTS (
    SELECT 1
    FROM ancestors
    WHERE id = NEW.id
  )
    INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'Parent task would create a circular WBS hierarchy.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_project_task_parent_scope_trigger ON project_tasks;
CREATE TRIGGER validate_project_task_parent_scope_trigger
  BEFORE INSERT OR UPDATE OF parent_task_id, company_id, project_id
  ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION validate_project_task_parent_scope();
