-- Migration 012: Platform company onboarding and tenant expenses
--
-- Adds the fields needed for Super Admin-created companies and introduces a
-- tenant-scoped expense module with renewal tracking.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS primary_contact_name text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS full_name text;

CREATE INDEX IF NOT EXISTS idx_companies_plan ON companies(plan);
CREATE INDEX IF NOT EXISTS idx_companies_status_plan ON companies(status, plan);

CREATE TABLE IF NOT EXISTS expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id              uuid REFERENCES clients(id) ON DELETE SET NULL,
  project_id             uuid REFERENCES projects(id) ON DELETE SET NULL,
  category_id            uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount                 numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency               text NOT NULL DEFAULT 'UGX',
  expense_date           date NOT NULL DEFAULT current_date,
  vendor                 text,
  description            text,
  receipt_url            text,
  recurrence             text NOT NULL DEFAULT 'one_off'
                         CHECK (recurrence IN ('one_off', 'monthly', 'annual')),
  is_system_subscription boolean NOT NULL DEFAULT false,
  renewal_date           date,
  created_by             uuid REFERENCES app_users(id) ON DELETE SET NULL,
  approved_by            uuid REFERENCES app_users(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (
    NOT is_system_subscription
    OR recurrence IN ('monthly', 'annual')
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_company
  ON expense_categories(company_id, name);
CREATE INDEX IF NOT EXISTS idx_expenses_company_date
  ON expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_company_client
  ON expenses(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_project
  ON expenses(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_category
  ON expenses(company_id, category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_renewal
  ON expenses(company_id, renewal_date)
  WHERE is_system_subscription = true;

DROP TRIGGER IF EXISTS trg_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER trg_expense_categories_updated_at
  BEFORE UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO expense_categories (company_id, name, is_system)
SELECT c.id, v.name, true
FROM companies c
CROSS JOIN (
  VALUES
    ('Purchases'),
    ('Subscriptions'),
    ('Utilities'),
    ('Salaries'),
    ('Transport'),
    ('Maintenance'),
    ('Internet'),
    ('Marketing'),
    ('Tax'),
    ('Miscellaneous')
) AS v(name)
ON CONFLICT (company_id, name) DO NOTHING;

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_expense_categories_all" ON expense_categories;
CREATE POLICY "tenant_expense_categories_all"
  ON expense_categories FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS "tenant_expenses_all" ON expenses;
CREATE POLICY "tenant_expenses_all"
  ON expenses FOR ALL TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
