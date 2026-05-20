-- Migration 011: Platform admin impersonation audit
--
-- Super Admin support access must be explicit, reasoned, and reversible. Normal
-- company users should not use a company switcher to cross tenant boundaries.

CREATE TABLE IF NOT EXISTS platform_impersonation_sessions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_app_user_id   uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  super_admin_auth_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id               uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reason                   text NOT NULL CHECK (length(trim(reason)) >= 10),
  stop_reason              text CHECK (stop_reason IS NULL OR length(trim(stop_reason)) >= 10),
  created_membership       boolean NOT NULL DEFAULT false,
  started_at               timestamptz NOT NULL DEFAULT now(),
  stopped_at               timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_impersonation_company
  ON platform_impersonation_sessions(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_impersonation_actor
  ON platform_impersonation_sessions(super_admin_auth_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_impersonation_open
  ON platform_impersonation_sessions(super_admin_auth_user_id, company_id)
  WHERE stopped_at IS NULL;

ALTER TABLE platform_impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_impersonation_own_select" ON platform_impersonation_sessions;
CREATE POLICY "platform_impersonation_own_select"
  ON platform_impersonation_sessions FOR SELECT TO authenticated
  USING (super_admin_auth_user_id = auth.uid());
