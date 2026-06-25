-- Migration 030: Portfolio and Project Synchronization Triggers

-- 1. Helper function to update a single portfolio's metrics
CREATE OR REPLACE FUNCTION update_single_portfolio_metrics(p_portfolio_id uuid)
RETURNS void AS $$
DECLARE
  v_budget_total numeric(15,2) := 0;
  v_progress_percent integer := 0;
  v_project_count integer := 0;
  v_completed_count integer := 0;
BEGIN
  -- Calculate sum of project contract amounts
  SELECT COALESCE(SUM(p.total_contract_amount), 0), COUNT(p.id)
  INTO v_budget_total, v_project_count
  FROM portfolio_projects pp
  JOIN projects p ON p.id = pp.project_id
  WHERE pp.portfolio_id = p_portfolio_id;

  -- Calculate progress percentage based on completed projects
  SELECT COUNT(p.id)
  INTO v_completed_count
  FROM portfolio_projects pp
  JOIN projects p ON p.id = pp.project_id
  WHERE pp.portfolio_id = p_portfolio_id AND p.status = 'completed';

  IF v_project_count > 0 THEN
    v_progress_percent := ROUND((v_completed_count::numeric / v_project_count::numeric) * 100);
  ELSE
    v_progress_percent := 0;
  END IF;

  -- Update the portfolios table
  UPDATE portfolios
  SET budget_total = v_budget_total,
      progress_percent = v_progress_percent,
      updated_at = now()
  WHERE id = p_portfolio_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger function to handle portfolio project and project status changes
CREATE OR REPLACE FUNCTION sync_portfolio_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_portfolio_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'portfolio_projects' THEN
    IF TG_OP = 'DELETE' THEN
      v_portfolio_id := OLD.portfolio_id;
    ELSE
      v_portfolio_id := NEW.portfolio_id;
    END IF;
    
    IF v_portfolio_id IS NOT NULL THEN
      PERFORM update_single_portfolio_metrics(v_portfolio_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    FOR v_portfolio_id IN 
      SELECT portfolio_id FROM portfolio_projects WHERE project_id = COALESCE(NEW.id, OLD.id)
    LOOP
      PERFORM update_single_portfolio_metrics(v_portfolio_id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create triggers
DROP TRIGGER IF EXISTS trg_sync_portfolio_projects_metrics ON portfolio_projects;
CREATE TRIGGER trg_sync_portfolio_projects_metrics
  AFTER INSERT OR UPDATE OR DELETE ON portfolio_projects
  FOR EACH ROW EXECUTE FUNCTION sync_portfolio_metrics();

DROP TRIGGER IF EXISTS trg_sync_projects_metrics_to_portfolio ON projects;
CREATE TRIGGER trg_sync_projects_metrics_to_portfolio
  AFTER UPDATE OF total_contract_amount, status ON projects
  FOR EACH ROW EXECUTE FUNCTION sync_portfolio_metrics();

-- 4. Backfill metrics for all existing portfolios
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM portfolios LOOP
    PERFORM update_single_portfolio_metrics(r.id);
  END LOOP;
END;
$$;
