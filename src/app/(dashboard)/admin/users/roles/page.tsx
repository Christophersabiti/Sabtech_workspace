'use client';

import { useEffect, useState, Fragment, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { Role, Permission } from '@/types';
import { Shield, Loader2, CheckCircle, XCircle, Lock } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  super_admin:     'bg-red-600',
  admin:           'bg-orange-500',
  finance:         'bg-blue-600',
  project_manager: 'bg-purple-600',
  staff:           'bg-slate-500',
  client:          'bg-green-600',
};

export default function RolesPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [roles, setRoles]             = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms]     = useState<Record<string, Set<string>>>({});
  const [loading, setLoading]         = useState(true);
  const [currentRole, setCurrentRole] = useState<string>('');
  const [toggling, setToggling]       = useState<string | null>(null); // 'roleId::permId'
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);

  const isSuperAdmin = currentRole === 'super_admin';

  const load = useCallback(async () => {
    const [
      { data: { session } },
      { data: rolesData },
      { data: permsData },
      { data: rpData },
    ] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from('roles').select('*').order('created_at'),
      supabase.from('permissions').select('*').order('module').order('action'),
      supabase.from('role_permissions').select('role_id, permission_id'),
    ]);

    // Fetch current user role
    if (session?.user.id) {
      const { data: appUser } = await supabase
        .from('app_users')
        .select('role')
        .eq('auth_user_id', session.user.id)
        .single();
      setCurrentRole(appUser?.role ?? 'staff');
    }

    setRoles((rolesData || []) as Role[]);
    setPermissions((permsData || []) as Permission[]);

    const map: Record<string, Set<string>> = {};
    (rpData || []).forEach((rp: { role_id: string; permission_id: string }) => {
      if (!map[rp.role_id]) map[rp.role_id] = new Set();
      map[rp.role_id].add(rp.permission_id);
    });
    setRolePerms(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleToggle(roleId: string, permId: string, roleIsSystem: boolean) {
    if (!isSuperAdmin) return;

    // Protect super_admin from being stripped of all permissions accidentally
    if (roleIsSystem && roleId === 'super_admin') {
      const remaining = rolePerms[roleId]?.size ?? 0;
      const has = rolePerms[roleId]?.has(permId);
      if (has && remaining <= 1) {
        setToast({ msg: 'Cannot remove last permission from Super Admin', ok: false });
        return;
      }
    }

    const key = `${roleId}::${permId}`;
    setToggling(key);

    const has = rolePerms[roleId]?.has(permId);

    let error;
    if (has) {
      ({ error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permId));
    } else {
      ({ error } = await supabase
        .from('role_permissions')
        .insert({ role_id: roleId, permission_id: permId }));
    }

    if (error) {
      setToast({ msg: `Error: ${error.message}`, ok: false });
    } else {
      // Optimistic update
      setRolePerms(prev => {
        const next: Record<string, Set<string>> = { ...prev };
        next[roleId] = new Set(prev[roleId] ?? []);
        if (has) next[roleId].delete(permId);
        else next[roleId].add(permId);
        return next;
      });
      setToast({ msg: has ? 'Permission revoked' : 'Permission granted', ok: true });
    }

    setToggling(null);
  }

  // Group permissions by module
  const modules = [...new Set(permissions.map(p => p.module))];

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;
  if (loading) return (
    <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading roles…
    </div>
  );

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.ok
            ? <CheckCircle className="h-4 w-4" />
            : <XCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Roles & Permissions</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSuperAdmin
            ? 'Click any cell to grant or revoke a permission for that role. Per-user overrides are on the User Detail page.'
            : 'Permission matrix showing what each role can do. Only Super Admins can edit this.'}
        </p>
        {isSuperAdmin && (
          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-700">
            <Shield className="h-3.5 w-3.5" /> Editing mode active — changes save instantly
          </div>
        )}
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        {roles.map(role => (
          <div key={role.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ROLE_COLORS[role.id] ?? 'bg-slate-500'}`}>
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 text-sm">{role.label}</p>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{role.description}</p>
              <p className="text-xs text-purple-600 mt-1 font-medium">
                {rolePerms[role.id]?.size ?? 0} permissions
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Permission Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-56 sticky left-0 bg-slate-50 z-10">
                  Permission
                </th>
                {roles.map(r => (
                  <th key={r.id} className="px-3 py-3 text-center font-semibold text-slate-600 min-w-[90px]">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded ${ROLE_COLORS[r.id] ?? 'bg-slate-500'} flex items-center justify-center`}>
                        <Shield className="h-3 w-3 text-white" />
                      </div>
                      <span className="leading-tight">{r.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map(module => (
                <Fragment key={module}>
                  {/* Module header row */}
                  <tr className="bg-slate-50/80">
                    <td colSpan={roles.length + 1} className="px-4 py-2 sticky left-0">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{module}</span>
                    </td>
                  </tr>

                  {permissions
                    .filter(p => p.module === module)
                    .map(perm => (
                      <tr key={perm.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-700 sticky left-0 bg-white">
                          <span className="font-medium">{perm.label}</span>
                          <br />
                          <span className="text-slate-400 font-mono text-[10px]">{perm.id}</span>
                        </td>

                        {roles.map(r => {
                          const has = rolePerms[r.id]?.has(perm.id) ?? false;
                          const key = `${r.id}::${perm.id}`;
                          const busy = toggling === key;

                          return (
                            <td key={r.id} className="px-3 py-2.5 text-center">
                              {isSuperAdmin ? (
                                <button
                                  onClick={() => handleToggle(r.id, perm.id, r.is_system)}
                                  disabled={busy}
                                  title={has ? `Revoke from ${r.label}` : `Grant to ${r.label}`}
                                  className={`mx-auto flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                                    busy
                                      ? 'opacity-50 cursor-wait'
                                      : has
                                      ? 'bg-green-100 hover:bg-red-50 text-green-600 hover:text-red-500'
                                      : 'bg-slate-100 hover:bg-green-50 text-slate-300 hover:text-green-500'
                                  }`}
                                >
                                  {busy
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : has
                                    ? <CheckCircle className="h-4 w-4" />
                                    : <XCircle className="h-4 w-4" />}
                                </button>
                              ) : (
                                has
                                  ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                  : <XCircle className="h-4 w-4 text-slate-200 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {!isSuperAdmin && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5" />
            Only Super Admins can edit role permissions
          </div>
        )}
      </div>
    </div>
  );
}
