-- Migration 010: Phase 3 security, access control, and tenant-safe aggregates
--
-- Goals:
-- - Make reporting/aggregate surfaces carry company_id.
-- - Ensure client filtering cannot aggregate projects/invoices across tenants.
-- - Keep audit logs queryable by tenant and indexed for monitoring.

DROP FUNCTION IF EXISTS get_clients_filtered(
  text,
  text[],
  text,
  text,
  boolean,
  boolean,
  numeric,
  numeric
);

CREATE OR REPLACE FUNCTION get_clients_filtered(
  p_search              text    DEFAULT NULL,
  p_status              text    DEFAULT NULL,
  p_country             text    DEFAULT NULL,
  p_currency            text    DEFAULT NULL,
  p_has_overdue         boolean DEFAULT NULL,
  p_has_active_projects boolean DEFAULT NULL,
  p_min_outstanding     numeric DEFAULT NULL,
  p_max_outstanding     numeric DEFAULT NULL,
  p_company_id          uuid    DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  company_id       uuid,
  client_code      text,
  name             text,
  company_name     text,
  contact_person   text,
  email            text,
  phone            text,
  alternate_phone  text,
  address          text,
  city             text,
  country          text,
  tin_number       text,
  currency         text,
  notes            text,
  status           text,
  is_archived      boolean,
  created_at       timestamptz,
  updated_at       timestamptz,
  active_projects  bigint,
  total_outstanding numeric,
  has_overdue      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.company_id,
    c.client_code,
    c.name,
    c.company_name,
    c.contact_person,
    c.email,
    c.phone,
    c.alternate_phone,
    c.address,
    c.city,
    c.country,
    c.tin_number,
    c.currency,
    c.notes,
    c.status,
    c.is_archived,
    c.created_at,
    c.updated_at,
    COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') AS active_projects,
    COALESCE(SUM(i.balance_due) FILTER (
      WHERE i.status NOT IN ('void', 'draft', 'cancelled')
    ), 0) AS total_outstanding,
    COALESCE(BOOL_OR(i.status = 'overdue'), false) AS has_overdue
  FROM clients c
  LEFT JOIN projects p
    ON p.client_id = c.id
   AND p.company_id = c.company_id
  LEFT JOIN invoices i
    ON i.client_id = c.id
   AND i.company_id = c.company_id
  WHERE
    c.is_archived = false
    AND (
      (p_company_id IS NOT NULL AND c.company_id = p_company_id AND is_company_member(p_company_id))
      OR
      (p_company_id IS NULL AND is_company_member(c.company_id))
    )
    AND (p_search IS NULL OR
         c.name         ILIKE '%' || p_search || '%' OR
         c.company_name ILIKE '%' || p_search || '%' OR
         c.email        ILIKE '%' || p_search || '%' OR
         c.phone        ILIKE '%' || p_search || '%')
    AND (p_status   IS NULL OR c.status = p_status)
    AND (p_country  IS NULL OR c.country = p_country)
    AND (p_currency IS NULL OR c.currency = p_currency)
  GROUP BY c.id
  HAVING
    (p_has_overdue IS NULL OR COALESCE(BOOL_OR(i.status = 'overdue'), false) = p_has_overdue)
    AND (p_has_active_projects IS NULL OR
         (COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') > 0) = p_has_active_projects)
    AND (p_min_outstanding IS NULL OR
         COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         >= p_min_outstanding)
    AND (p_max_outstanding IS NULL OR
         COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         <= p_max_outstanding)
  ORDER BY c.name;
$$;

CREATE OR REPLACE VIEW project_totals AS
SELECT
  p.id,
  p.company_id,
  p.client_id,
  p.project_code,
  p.project_name,
  p.description,
  p.billing_type,
  p.status,
  p.total_contract_amount,
  p.project_manager,
  p.start_date,
  p.end_date,
  p.notes,
  p.created_at,
  p.updated_at,
  COALESCE(SUM(i.total_amount) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0) AS total_invoiced,
  COALESCE(SUM(i.total_paid) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0) AS total_paid,
  COALESCE(SUM(i.balance_due) FILTER (
    WHERE i.status NOT IN ('void', 'draft', 'cancelled')
  ), 0) AS outstanding
FROM projects p
LEFT JOIN invoices i
  ON i.project_id = p.id
 AND i.company_id = p.company_id
GROUP BY p.id;

CREATE INDEX IF NOT EXISTS idx_audit_log_company_created
  ON audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_audit_company_changed
  ON client_audit_log(company_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_company_performed
  ON invoice_audit_log(company_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_audit_company_performed
  ON payment_audit_log(company_id, performed_at DESC);
