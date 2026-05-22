'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Payment } from '@/types';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaymentStatusBadge } from '@/components/ui/PaymentStatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Search, CreditCard, Download, RotateCcw } from 'lucide-react';

type PaymentRow = Payment & { invoice: { invoice_number: string; invoice_id: string; client: { name: string } } };

type Toast = { msg: string; ok: boolean };

export default function PaymentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const { can } = useCurrentUser();

  const [payments,      setPayments]      = useState<PaymentRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [methodFilter,  setMethodFilter]  = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [toast,         setToast]         = useState<Toast | null>(null);

  // Reversal dialog state
  const [reversalTarget, setReversalTarget] = useState<PaymentRow | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalBusy,   setReversalBusy]   = useState(false);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPayments = useCallback(async () => {
    if (!activeCompanyId) {
      if (!companyLoading) { setPayments([]); setLoading(false); }
      return;
    }
    setLoading(true);
    let query = supabase
      .from('payments')
      .select('*, invoice:invoices(invoice_number, client:clients(name))')
      .eq('company_id', activeCompanyId)
      .order('payment_date', { ascending: false });
    if (methodFilter) query = query.eq('payment_method', methodFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data } = await query;
    setPayments((data || []) as PaymentRow[]);
    setLoading(false);
  }, [activeCompanyId, companyLoading, methodFilter, statusFilter, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setPayments([]);
      return fetchPayments();
    });
  }, [fetchPayments]);

  const filtered = payments.filter(p =>
    [p.payment_number, p.invoice?.invoice_number, p.invoice?.client?.name, p.reference_number]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Totals
  const confirmed      = payments.filter(p => p.status !== 'reversed');
  const totalReceived  = confirmed.reduce((s, p) => s + p.amount_paid, 0);
  const totalReversed  = payments.filter(p => p.status === 'reversed').reduce((s, p) => s + p.amount_paid, 0);

  // ── Payment Reversal ──────────────────────────────────────────────────────────
  async function submitReversal() {
    if (!reversalTarget || !reversalReason.trim() || !activeCompanyId) return;
    setReversalBusy(true);

    const res = await fetch(`/api/payments/${reversalTarget.id}/reverse`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: activeCompanyId, reason: reversalReason }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };

    setReversalTarget(null);
    setReversalReason('');

    if (res.ok && data.ok) {
      showToast('Payment reversed successfully.', true);
      await fetchPayments();
    } else {
      showToast(data.error ?? 'Reversal failed.', false);
    }
    setReversalBusy(false);
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Receipt #', 'Date', 'Client', 'Invoice', 'Amount', 'Method', 'Reference', 'Status', 'Note'];
    const rows = filtered.map(p => [
      p.payment_number,
      p.payment_date,
      p.invoice?.client?.name ?? '',
      p.invoice?.invoice_number ?? '',
      p.amount_paid,
      PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method,
      p.reference_number ?? '',
      p.status ?? 'confirmed',
      p.reversal_reason ?? p.note ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canReverse = can('reverse_payment');

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>{toast.msg}</div>
      )}

      <PageHeader
        title="Payments"
        subtitle={`${payments.length} payment${payments.length !== 1 ? 's' : ''} recorded`}
        action={
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm px-4 py-2 rounded-lg"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <CreditCard className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-green-600 font-medium">Total Confirmed</p>
            <p className="text-xl font-bold text-green-800">{formatCurrency(totalReceived)}</p>
          </div>
        </div>
        {totalReversed > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CreditCard className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-red-600 font-medium">Total Reversed</p>
              <p className="text-xl font-bold text-red-700">{formatCurrency(totalReversed)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text" placeholder="Search payments…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="reversed">Reversed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <LoadingSpinner label="Loading payments…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description={search || methodFilter || statusFilter ? 'Try clearing your filters.' : 'Payments will appear here once recorded.'}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Receipt #', 'Date', 'Client', 'Invoice', 'Amount', 'Method', 'Reference', 'Status', canReverse ? 'Action' : ''].filter(Boolean).map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(pay => (
                    <tr key={pay.id} className={`hover:bg-slate-50 ${pay.status === 'reversed' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{pay.payment_number}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(pay.payment_date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{pay.invoice?.client?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${pay.invoice_id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {pay.invoice?.invoice_number}
                        </Link>
                      </td>
                      <td className={`px-4 py-3 font-semibold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                        {formatCurrency(pay.amount_paid)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[pay.payment_method]}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{pay.reference_number || '—'}</td>
                      <td className="px-4 py-3"><PaymentStatusBadge status={pay.status ?? 'confirmed'} /></td>
                      {canReverse && (
                        <td className="px-4 py-3">
                          {pay.status === 'confirmed' && (
                            <button
                              onClick={() => setReversalTarget(pay)}
                              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {filtered.map(pay => (
                <div key={pay.id} className={`p-4 ${pay.status === 'reversed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{pay.invoice?.client?.name || '—'}</p>
                      <Link href={`/invoices/${pay.invoice_id}`} className="font-mono text-xs text-blue-600">
                        {pay.invoice?.invoice_number}
                      </Link>
                    </div>
                    <PaymentStatusBadge status={pay.status ?? 'confirmed'} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className={`text-base font-bold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                      {formatCurrency(pay.amount_paid)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(pay.payment_date)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>{PAYMENT_METHOD_LABELS[pay.payment_method]}</span>
                    {pay.reference_number && <span className="font-mono">{pay.reference_number}</span>}
                    <span className="font-mono text-slate-400">{pay.payment_number}</span>
                  </div>
                  {canReverse && pay.status === 'confirmed' && (
                    <button
                      onClick={() => setReversalTarget(pay)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 border border-red-200 bg-red-50 px-2 py-1 rounded-lg"
                    >
                      <RotateCcw className="h-3 w-3" /> Reverse
                    </button>
                  )}
                  {pay.reversal_reason && (
                    <p className="mt-1 text-xs text-red-400 italic">{pay.reversal_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Reversal Confirm Dialog */}
      <ConfirmDialog
        open={!!reversalTarget}
        onClose={() => { setReversalTarget(null); setReversalReason(''); }}
        onConfirm={submitReversal}
        title={`Reverse payment ${reversalTarget?.payment_number ?? ''}?`}
        description={`This will reverse ${formatCurrency(reversalTarget?.amount_paid ?? 0)} and recalculate the invoice balance. A reason is required.`}
        confirmLabel="Reverse Payment"
        danger
        loading={reversalBusy}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason * (min. 10 characters)</label>
          <textarea
            value={reversalReason}
            onChange={e => setReversalReason(e.target.value)}
            rows={3}
            placeholder="Why is this payment being reversed?"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
          {reversalReason.length > 0 && reversalReason.length < 10 && (
            <p className="text-xs text-red-500 mt-1">{10 - reversalReason.length} more characters required.</p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
