'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, LogOut, X } from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { usePlatformImpersonation } from '@/hooks/usePlatformImpersonation';

export function ImpersonationBanner() {
  const router = useRouter();
  const { clearActiveCompanyId } = useActiveCompany();
  const { impersonation, clearStoredImpersonation } = usePlatformImpersonation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!impersonation) return null;

  async function stopImpersonation() {
    if (!impersonation || reason.trim().length < 10) return;
    setSaving(true);
    setError(null);

    const res = await fetch('/api/platform/impersonation/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: impersonation.sessionId,
        companyId: impersonation.companyId,
        reason,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? 'Could not stop impersonation.');
      setSaving(false);
      return;
    }

    clearStoredImpersonation();
    clearActiveCompanyId();
    setReason('');
    setOpen(false);
    setSaving(false);
    router.push('/admin/platform');
  }

  return (
    <>
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                Super Admin support mode: {impersonation.companyName}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                You are viewing tenant data under audited impersonation. Stop access when support work is complete.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            <LogOut className="h-4 w-4" />
            Stop Impersonating
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Stop Impersonating</h2>
                <p className="text-sm text-slate-500">Close support access to {impersonation.companyName}.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Stop reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  placeholder="Example: Resolved the invoice export issue and confirmed with the company admin."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <p className="text-xs text-slate-500">The stop reason is stored with the impersonation audit record.</p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopImpersonation}
                disabled={saving || reason.trim().length < 10}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Stopping...
                  </span>
                ) : (
                  'Stop Impersonating'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
