'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { AppUser, Permission, Role } from '@/types';
import {
  ArrowLeft, Shield, CheckCircle, XCircle, Loader2,
  User, Mail, Clock, AlertCircle, Save,
} from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  super_admin:     'bg-red-600',
  admin:           'bg-orange-500',
  finance:         'bg-blue-600',
  project_manager: 'bg-purple-600',
  staff:           'bg-slate-500',
  client:          'bg-green-600',
};

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  invited:   'bg-yellow-100 text-yellow-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-100 text-red-600',
};

export default function UserDetailPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const params  = useParams();
  const router  = useRouter();
  const supabase = createClient();
  const userId  = params.id as string;

  const [user, setUser]               = useState<AppUser | null>(null);
  const [roles, setRoles]             = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms]     = useState<Record<string, Set<string>>>({});
  const [overrides, setOverrides]     = useState<Record<string, boolean>>({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: userData },
      { data: rolesData },
      { data: permsData },
      { data: rpData },
      { data: overrideData },
    ] = await Promise.all([
      supabase.from('app_users').select('*').eq('id', userId).single(),
      supabase.from('roles').select('*').order('created_at'),
      supabase.from('permissions').select('*').order('module').order('action'),
      supabase.from('role_permissions').select('role_id, permission_id'),
      supabase.from('user_permission_overrides').select('permission_id, granted').eq('user_id', userId),
    ]);

    setUser(userData as AppUser | null);
    setRoles((rolesData || []) as Role[]);
    setPermissions((permsData || []) as Permission[]);

    const map: Record<string, Set<string>> = {};
    (rpData || []).forEach((rp: { role_id: string; permission_id: string }) => {
      if (!map[rp.role_id]) map[rp.role_id] = new Set();
      map[rp.role_id].add(rp.permission_id);
    });
    setRolePerms(map);

    const ov: Record<string, boolean> = {};
    (overrideData || []).forEach((o: { permission_id: string; granted: boolean }) => {
      ov[o.permission_id] = o.granted;
    });
    setOverrides(ov);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleChange(newRole: string) {
    if (!user) return;
    await supabase.from('app_users').update({ role: newRole }).eq('id', userId);
    setUser({ ...user, role: newRole });
    showToast('success', 'Role updated');
  }

  async function handleStatusToggle() {
    if (!user) return;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    await supabase.from('app_users').update({ status: newStatus }).eq('id', userId);
    setUser({ ...user, status: newStatus as AppUser['status'] });
    showToast('success', `User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
  }

  function toggleOverride(permId: string, roleHas: boolean) {
    setOverrides(prev => {
      const current = prev[permId];
      // Cycle: no override → grant → deny → no override
      if (current === undefined) {
        // Set opposite of role default
        return { ...prev, [permId]: !roleHas };
      } else if (current === true && roleHas) {
        // Was granted by override (role doesn't have it), remove override
        const next = { ...prev };
        delete next[permId];
        return next;
      } else if (current === false && !roleHas) {
        // Was denied by override (role has it), remove override
        const next = { ...prev };
        delete next[permId];
        return next;
      } else {
        // Remove override
        const next = { ...prev };
        delete next[permId];
        return next;
      }
    });
  }

  async function saveOverrides() {
    setSaving(true);
    try {
      // Delete existing overrides
      await supabase.from('user_permission_overrides').delete().eq('user_id', userId);

      // Insert new overrides
      const rows = Object.entries(overrides).map(([permission_id, granted]) => ({
        user_id: userId,
        permission_id,
        granted,
      }));

      if (rows.length > 0) {
        const { error } = await supabase.from('user_permission_overrides').insert(rows);
        if (error) throw error;
      }
      showToast('success', 'Permission overrides saved');
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const modules = [...new Set(permissions.map(p => p.module))];

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  if (loading) return (
    <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading user…
    </div>
  );

  if (!user) return (
    <div className="py-16 text-center text-slate-400">
      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
      User not found.
    </div>
  );

  const userRolePerms = rolePerms[user.role] ?? new Set<string>();

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
            {user.full_name ? user.full_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{user.full_name ?? 'No Name'}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3.5 w-3.5" /> {user.email}
            </p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_STYLES[user.status]}`}>
          {user.status}
        </span>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Role</p>
          <select
            value={user.role}
            onChange={e => handleRoleChange(e.target.value)}
            className="w-full text-sm font-semibold text-slate-800 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Joined</p>
          <p className="text-sm font-semibold text-slate-800">{formatDate(user.created_at)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-1">Last Login</p>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {formatDate(user.last_login_at)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">Account Status</p>
          <button
            onClick={handleStatusToggle}
            className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
              user.status === 'active'
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {user.status === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Permission Overrides */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-600" />
              Permission Overrides
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Override role defaults for this user. Role permissions are shown; click to grant or deny individually.
            </p>
          </div>
          <button
            onClick={saveOverrides}
            disabled={saving}
            className="inline-flex items-center gap-2 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Overrides
          </button>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-500" /> Role permission (inherited)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-blue-500" /> Granted by override
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-red-400" /> Denied by override
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-slate-200" /> Not granted
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-64">Permission</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-6 h-6 rounded ${ROLE_COLORS[user.role] ?? 'bg-slate-500'} flex items-center justify-center`}>
                      <Shield className="h-3 w-3 text-white" />
                    </div>
                    <span>Role Default</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center">
                      <User className="h-3 w-3 text-white" />
                    </div>
                    <span>Effective</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Override</th>
              </tr>
            </thead>
            <tbody>
              {modules.map(module => (
                <Fragment key={module}>
                  <tr className="bg-slate-50/50">
                    <td colSpan={4} className="px-4 py-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{module}</span>
                    </td>
                  </tr>
                  {permissions
                    .filter(p => p.module === module)
                    .map(perm => {
                      const roleHas = userRolePerms.has(perm.id);
                      const override = overrides[perm.id];
                      const effective = override !== undefined ? override : roleHas;

                      return (
                        <tr key={perm.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-slate-700">
                            <span className="font-medium">{perm.label}</span>
                            <span className="text-slate-400 ml-1 font-mono">({perm.id})</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {roleHas
                              ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              : <XCircle className="h-4 w-4 text-slate-200 mx-auto" />
                            }
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {effective
                              ? <CheckCircle className={`h-4 w-4 mx-auto ${override !== undefined ? 'text-blue-500' : 'text-green-500'}`} />
                              : <XCircle className={`h-4 w-4 mx-auto ${override !== undefined ? 'text-red-400' : 'text-slate-200'}`} />
                            }
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => toggleOverride(perm.id, roleHas)}
                              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                override === undefined
                                  ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                  : override
                                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                  : 'bg-red-50 text-red-600 hover:bg-red-100'
                              }`}
                            >
                              {override === undefined ? 'Inherited' : override ? 'Granted' : 'Denied'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  }
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
