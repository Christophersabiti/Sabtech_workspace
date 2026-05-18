'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { AppUser } from '@/types';
import {
  UserCog, Plus, Search, X, Mail, CheckCircle,
  AlertCircle, Shield, MoreVertical, UserCheck, UserX,
  RefreshCw, Clock, Loader2,
} from 'lucide-react';
import Link from 'next/link';

const ROLES = [
  { value: 'super_admin',     label: 'Super Admin',     color: 'bg-red-100 text-red-700' },
  { value: 'admin',           label: 'Admin',           color: 'bg-orange-100 text-orange-700' },
  { value: 'finance',         label: 'Finance',         color: 'bg-blue-100 text-blue-700' },
  { value: 'project_manager', label: 'Project Manager', color: 'bg-purple-100 text-purple-700' },
  { value: 'staff',           label: 'Staff',           color: 'bg-slate-100 text-slate-600' },
  { value: 'client',          label: 'Client',          color: 'bg-green-100 text-green-700' },
];

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  invited:   'bg-yellow-100 text-yellow-700',
  inactive:  'bg-slate-100 text-slate-500',
  suspended: 'bg-red-100 text-red-700',
};

function getRoleBadge(role: string) {
  return ROLES.find(r => r.value === role) ?? { label: role, color: 'bg-slate-100 text-slate-600' };
}

function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name ?? ''} className="w-9 h-9 rounded-full object-cover" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

export default function UsersPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [users, setUsers]             = useState<AppUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('staff');
  const [inviting, setInviting]       = useState(false);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers((data || []) as AppUser[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const matchSearch = search === '' ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchSearch && matchStatus;
  });

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to invite');
      showToast('success', `Invitation sent to ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('staff');
      load();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  }

  async function updateStatus(userId: string, status: AppUser['status']) {
    setActionUserId(userId);
    await supabase.from('app_users').update({ status, updated_at: new Date().toISOString() }).eq('id', userId);
    showToast('success', `User ${status}`);
    load();
    setActionUserId(null);
  }

  async function updateRole(userId: string, role: string) {
    await supabase.from('app_users').update({ role, updated_at: new Date().toISOString() }).eq('id', userId);
    showToast('success', 'Role updated');
    load();
  }

  const stats = {
    total:    users.length,
    active:   users.filter(u => u.status === 'active').length,
    invited:  users.filter(u => u.status === 'invited').length,
    inactive: users.filter(u => u.status === 'inactive' || u.status === 'suspended').length,
  };

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage team access, roles, and permissions.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users/roles"
            className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium">
            <Shield className="h-4 w-4" /> Roles
          </Link>
          <Link href="/admin/users/invitations"
            className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium">
            <Clock className="h-4 w-4" /> Invitations
          </Link>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            <Plus className="h-4 w-4" /> Invite User
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Users', value: stats.total, color: 'text-slate-700' },
          { label: 'Active',      value: stats.active,   color: 'text-green-600' },
          { label: 'Invited',     value: stats.invited,  color: 'text-yellow-600' },
          { label: 'Inactive',    value: stats.inactive, color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        {(['all', 'active', 'invited', 'inactive', 'suspended'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-purple-600 text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading users…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <UserCog className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">
              {users.length === 0 ? 'No users yet. Invite your first team member.' : 'No users match your filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['User', 'Role', 'Status', 'Last Login', 'Invited', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(user => {
                const roleMeta = getRoleBadge(user.role);
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.full_name} avatarUrl={user.avatar_url} />
                        <div>
                          <p className="font-semibold text-slate-900">{user.full_name ?? '—'}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={e => updateRole(user.id, e.target.value)}
                        className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 ${roleMeta.color}`}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[user.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {user.status}
                      </span>
                    </td>
                    {/* Last Login */}
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    {/* Invited */}
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {user.invited_at
                        ? new Date(user.invited_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/users/${user.id}`}
                          className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="View Details">
                          <MoreVertical className="h-4 w-4" />
                        </Link>
                        {user.status === 'active' ? (
                          <button onClick={() => updateStatus(user.id, 'inactive')} disabled={actionUserId === user.id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Deactivate">
                            {actionUserId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                          </button>
                        ) : user.status === 'inactive' ? (
                          <button onClick={() => updateStatus(user.id, 'active')} disabled={actionUserId === user.id}
                            className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Activate">
                            {actionUserId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                          </button>
                        ) : user.status === 'invited' ? (
                          <button onClick={() => {
                            setInviteEmail(user.email);
                            setInviteRole(user.role);
                            setShowInvite(true);
                          }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Resend Invite">
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Mail className="h-5 w-5 text-purple-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Invite Team Member</h2>
              </div>
              <button onClick={() => setShowInvite(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address *</label>
                <input
                  type="email" required autoFocus
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Assign Role *</label>
                <select
                  value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-xs text-slate-400 mt-1.5">
                  {inviteRole === 'super_admin' && '⚠ Full access including role management.'}
                  {inviteRole === 'admin' && 'Full access to all modules except role management.'}
                  {inviteRole === 'finance' && 'Can manage invoices, payments, and view reports.'}
                  {inviteRole === 'project_manager' && 'Can manage clients, projects, and view invoices.'}
                  {inviteRole === 'staff' && 'Read-only access to assigned modules.'}
                  {inviteRole === 'client' && 'Can only view their own invoices and payments.'}
                </p>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-700">
                An invitation email will be sent. The link expires in <strong>7 days</strong>.
                The user can sign in with Google, Apple, or create a password.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={inviting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  {inviting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Mail className="h-4 w-4" /> Send Invite</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
