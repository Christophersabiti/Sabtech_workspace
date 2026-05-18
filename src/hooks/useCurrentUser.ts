'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type CurrentUser = {
  id:           string;   // app_users.id
  authId:       string;   // auth.users.id
  email:        string;
  fullName:     string | null;
  avatarUrl:    string | null;
  role:         string;
  status:       string;
};

// Roles that can perform financial corrections (void / reverse)
export const FINANCE_ROLES = ['super_admin', 'admin', 'finance'] as const;
export const ADMIN_ROLES   = ['super_admin', 'admin']            as const;

export type FinanceRole = typeof FINANCE_ROLES[number];
export type AdminRole   = typeof ADMIN_ROLES[number];

/**
 * Returns the current authenticated app user with role helpers.
 *
 * Usage:
 *   const { user, can, loading } = useCurrentUser();
 *   if (can('void_invoice')) { ... }
 */
export function useCurrentUser() {
  const supabase = createClient();
  const [user, setUser]       = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !active) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('app_users')
        .select('id, email, full_name, avatar_url, role, status')
        .eq('auth_user_id', session.user.id)
        .single();

      if (!active) return;

      if (appUser) {
        setUser({
          id:        appUser.id,
          authId:    session.user.id,
          email:     appUser.email,
          fullName:  appUser.full_name,
          avatarUrl: appUser.avatar_url,
          role:      appUser.role,
          status:    appUser.status,
        });
      } else {
        // Fallback: build from session if app_users record doesn't exist yet
        setUser({
          id:        session.user.id,
          authId:    session.user.id,
          email:     session.user.email ?? '',
          fullName:  session.user.user_metadata?.full_name ?? null,
          avatarUrl: session.user.user_metadata?.avatar_url ?? null,
          role:      'staff',
          status:    'active',
        });
      }
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, []);

  /**
   * Permission check helper.
   * Checks whether the current user's role allows a given action.
   */
  function can(action: Permission): boolean {
    if (!user) return false;
    return PERMISSION_MATRIX[action]?.includes(user.role) ?? false;
  }

  function isFinance(): boolean {
    return FINANCE_ROLES.includes(user?.role as FinanceRole);
  }

  function isAdmin(): boolean {
    return ADMIN_ROLES.includes(user?.role as AdminRole);
  }

  return { user, loading, can, isFinance, isAdmin };
}

/**
 * Guard hook — redirects to `redirectTo` if user's role is not in `allowedRoles`.
 * Use at the top of any page that should be restricted.
 *
 * Usage:
 *   const { checking } = useRequireRole(['super_admin', 'admin']);
 *   if (checking) return null;
 */
export function useRequireRole(
  allowedRoles: string[],
  redirectTo = '/',
): { checking: boolean } {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || !allowedRoles.includes(user.role)) {
      router.replace(redirectTo);
    } else {
      setChecking(false);
    }
  }, [user, loading, allowedRoles, redirectTo, router]);

  return { checking: loading || checking };
}

// ─── Permission Matrix ────────────────────────────────────────────────────────

type Permission =
  | 'edit_client'
  | 'create_project'
  | 'void_invoice'
  | 'reverse_payment'
  | 'export_statement'
  | 'view_audit_log'
  | 'view_reconciliation'
  | 'manage_users'
  | 'manage_settings';

const PERMISSION_MATRIX: Record<Permission, string[]> = {
  edit_client:          ['super_admin', 'admin', 'finance'],
  create_project:       ['super_admin', 'admin', 'project_manager'],
  void_invoice:         ['super_admin', 'admin', 'finance'],
  reverse_payment:      ['super_admin', 'admin', 'finance'],
  export_statement:     ['super_admin', 'admin', 'finance', 'project_manager'],
  view_audit_log:       ['super_admin', 'admin', 'finance'],
  view_reconciliation:  ['super_admin', 'admin', 'finance'],
  manage_users:         ['super_admin', 'admin'],
  manage_settings:      ['super_admin', 'admin'],
};
