-- Migration 027: Phase 1 task dependency integrity
-- Ensures task dependencies stay within the same tenant/project and cannot point to themselves.

DELETE FROM task_dependencies
WHERE task_id = depends_on_task_id;

DO $$
BEGIN
  ALTER TABLE task_dependencies
    ADD CONSTRAINT task_dependencies_no_self_reference
    CHECK (task_id <> depends_on_task_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION validate_task_dependency_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_task record;
  dependency_task record;
BEGIN
  IF NEW.task_id = NEW.depends_on_task_id THEN
    RAISE EXCEPTION 'A task cannot depend on itself.';
  END IF;

  SELECT company_id, project_id
    INTO source_task
  FROM project_tasks
  WHERE id = NEW.task_id;

  SELECT company_id, project_id
    INTO dependency_task
  FROM project_tasks
  WHERE id = NEW.depends_on_task_id;

  IF source_task.company_id IS NULL OR dependency_task.company_id IS NULL THEN
    RAISE EXCEPTION 'Dependency tasks must exist.';
  END IF;

  IF source_task.company_id <> NEW.company_id OR dependency_task.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Dependency tasks must belong to the dependency company.';
  END IF;

  IF source_task.project_id IS DISTINCT FROM dependency_task.project_id THEN
    RAISE EXCEPTION 'Dependency tasks must belong to the same project.';
  END IF;

  NEW.project_id := source_task.project_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_dependency_scope ON task_dependencies;
CREATE TRIGGER trg_validate_task_dependency_scope
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION validate_task_dependency_scope();
