-- ─── Quotation Module ────────────────────────────────────────────────────────
-- Run this in your Supabase SQL editor.

-- 1. Quotations table
CREATE TABLE IF NOT EXISTS quotations (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number  text NOT NULL UNIQUE,
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  project_name      text NOT NULL DEFAULT '',
  issue_date        date NOT NULL,
  valid_until       date NOT NULL,
  currency          text NOT NULL DEFAULT 'UGX',
  notes             text,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  discount          numeric(14,2) NOT NULL DEFAULT 0,
  tax               numeric(14,2) NOT NULL DEFAULT 0,
  total_amount      numeric(14,2) NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 2. Quotation items table
CREATE TABLE IF NOT EXISTS quotation_items (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id   uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_name      text NOT NULL,
  description    text,
  quantity       numeric(10,2) NOT NULL DEFAULT 1,
  unit_price     numeric(14,2) NOT NULL DEFAULT 0,
  line_total     numeric(14,2) NOT NULL DEFAULT 0,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- 3. Project tasks table (quotation-to-task conversion target)
CREATE TABLE IF NOT EXISTS project_tasks (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id          uuid REFERENCES projects(id) ON DELETE SET NULL,
  quotation_id        uuid REFERENCES quotations(id) ON DELETE SET NULL,
  quotation_item_id   uuid REFERENCES quotation_items(id) ON DELETE SET NULL,
  title               text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed','cancelled')),
  created_at          timestamptz DEFAULT now()
);

-- 4. Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_quotations_client_id    ON quotations(client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status       ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quot_id ON quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project   ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_quotation ON project_tasks(quotation_id);

-- 5. Updated_at trigger (reuse pattern from existing tables)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_quotations_updated_at ON quotations;
CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. RLS — authenticated users can read/write their own org's quotations
ALTER TABLE quotations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks  ENABLE ROW LEVEL SECURITY;

-- Simple open policy for authenticated users (matches existing app pattern)
CREATE POLICY "auth_all_quotations"      ON quotations      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_quotation_items" ON quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_project_tasks"   ON project_tasks   FOR ALL TO authenticated USING (true) WITH CHECK (true);
