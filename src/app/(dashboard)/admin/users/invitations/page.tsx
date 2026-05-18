'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { Invitation } from '@/types';
import { Clock, CheckCircle, XCircle, RefreshCw, AlertCircle, Mail, Loader2, Copy } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  expired:  'bg-slate-100 text-slate-500',
  cancelled:'bg-red-100 text-red-600',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:  Clock,
  accepted: CheckCircle,
  expired:  AlertCircle,
  cancelled: XCircle,
};

export default function InvitationsPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copyingId, setCopyingId]     = useState<string | null>(null);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .order('created_at', { ascending: false });
    setInvitations((data || []) as Invitation[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(id: string) {
    if (!confirm('Cancel this invitation?')) return;
    await supabase.from('invitations').update({ status: 'cancelled' }).eq('id', id);
    showToast('success', 'Invitation cancelled');
    load();
  }

  async function handleResend(inv: Invitation) {
    setResendingId(inv.id);
    try {
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inv.email, role: inv.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('success', `Invitation resent to ${inv.email}`);
      load();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setResendingId(null);
    }
  }

  async function handleCopyLink(inv: Invitation) {
    setCopyingId(inv.id);
    try {
      const res = await fetch('/api/admin/generate-invite-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inv.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      await navigator.clipboard.writeText(data.action_link);
      showToast('success', 'Direct invite link copied to clipboard!');
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Failed to generate link');
    } finally {
      setCopyingId(null);
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invitation History</h1>
        <p className="text-sm text-slate-500 mt-1">Track sent invitations, resend or cancel pending ones.</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : invitations.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
          <Mail className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400">No invitations sent yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Email', 'Role', 'Status', 'Sent', 'Expires', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invitations.map(inv => {
                const StatusIcon = STATUS_ICONS[inv.status] ?? Clock;
                const isExpired  = inv.status === 'pending' && new Date(inv.expires_at) < new Date();
                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-purple-50 text-purple-700 font-semibold px-2 py-1 rounded-full capitalize">
                        {inv.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isExpired ? 'bg-slate-100 text-slate-500' : STATUS_STYLES[inv.status]
                      }`}>
                        <StatusIcon className="h-3 w-3" />
                        {isExpired ? 'expired' : inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.expires_at)}</td>
                    <td className="px-4 py-3">
                      {(inv.status === 'pending' || isExpired) && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyLink(inv)}
                            disabled={copyingId === inv.id}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            title="Copy Direct Invite Link"
                          >
                            {copyingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleResend(inv)}
                            disabled={resendingId === inv.id}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {resendingId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Resend
                          </button>
                          <button
                            onClick={() => handleCancel(inv.id)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-colors"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
