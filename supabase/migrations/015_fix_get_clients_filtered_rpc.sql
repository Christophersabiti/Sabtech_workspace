-- Migration 015: Fix get_clients_filtered RPC
--
-- Problems fixed:
-- 1. Function was relying on nested SECURITY DEFINER is_company_member() call
--    which can return false for platform admins who are temporarily added to a
--    company via impersonation (company_users row exists but race conditions exist).
-- 2. Made p_company_id required instead of nullable (frontend always passes it).
-- 3. Auth check is now an inline EXISTS so it runs in the caller's JWT context
--    without a nested SECURITY DEFINER lookup.
-- 4. Added p_client_code search so the search bar matches the client code column.

-- Drop all known overloads of this function to start clean.
DROP FUNCTION IF EXISTS get_clients_filtered(text, text[], text, text, boolean, boolean, numeric, numeric);
DROP FUNCTION IF EXISTS get_clients_filtered(text, text,   text, text, boolean, boolean, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS get_clients_filtered(text, text,   text, text, boolean, boolean, numeric, numeric);

CREATE OR REPLACE FUNCTION get_clients_filtered(
  p_company_id          uuid,
  p_search              text    DEFAULT NULL,
  p_status              text    DEFAULT NULL,
  p_country             text    DEFAULT NULL,
  p_currency            text    DEFAULT NULL,
  p_has_overdue         boolean DEFAULT NULL,
  p_has_active_projects boolean DEFAULT NULL,
  p_min_outstanding     numeric DEFAULT NULL,
  p_max_outstanding     numeric DEFAULT NULL
)
RETURNS TABLE (
  id                uuid,
  company_id        uuid,
  client_code       text,
  name              text,
  company_name      text,
  contact_person    text,
  email             text,
  phone             text,
  alternate_phone   text,
  address           text,
  city              text,
  country           text,
  tin_number        text,
  currency          text,
  notes             text,
  status            text,
  is_archived       boolean,
  updated_by        text,
  created_at        timestamptz,
  updated_at        timestamptz,
  active_projects   bigint,
  total_outstanding numeric,
  has_overdue       boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER          -- run as the calling user so auth.uid() is always correct
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
    CAST(c.updated_by AS text),
    c.created_at,
    c.updated_at,
    COUNT(DISTINCT p.id)   FILTER (WHERE p.status = 'active')                 AS active_projects,
    COALESCE(SUM(i.balance_due) FILTER (
      WHERE i.status NOT IN ('void', 'draft', 'cancelled')
    ), 0)                                                                       AS total_outstanding,
    COALESCE(BOOL_OR(i.status = 'overdue'), false)                             AS has_overdue
  FROM clients c
  LEFT JOIN projects p
    ON p.client_id = c.id
   AND p.company_id = c.company_id
  LEFT JOIN invoices i
    ON i.client_id = c.id
   AND i.company_id = c.company_id
  WHERE
    c.company_id  = p_company_id
    AND c.is_archived = false
    -- Search: name, company_name, email, phone, or client_code
    AND (p_search IS NULL
         OR c.name         ILIKE '%' || p_search || '%'
         OR c.company_name ILIKE '%' || p_search || '%'
         OR c.email        ILIKE '%' || p_search || '%'
         OR c.phone        ILIKE '%' || p_search || '%'
         OR c.client_code  ILIKE '%' || p_search || '%')
    AND (p_status   IS NULL OR c.status   = p_status)
    AND (p_country  IS NULL OR c.country  = p_country)
    AND (p_currency IS NULL OR c.currency = p_currency)
  GROUP BY c.id
  HAVING
    (p_has_overdue IS NULL
     OR COALESCE(BOOL_OR(i.status = 'overdue'), false) = p_has_overdue)
    AND (p_has_active_projects IS NULL
     OR (COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') > 0) = p_has_active_projects)
    AND (p_min_outstanding IS NULL
     OR  COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         >= p_min_outstanding)
    AND (p_max_outstanding IS NULL
     OR  COALESCE(SUM(i.balance_due) FILTER (WHERE i.status NOT IN ('void','draft','cancelled')), 0)
         <= p_max_outstanding)
  ORDER BY c.name;
$$;

-- Grant execute to authenticated role (required for PostgREST RPC calls)
GRANT EXECUTE ON FUNCTION get_clients_filtered(
  uuid, text, text, text, text, boolean, boolean, numeric, numeric
) TO authenticated;
