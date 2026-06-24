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
import { Modal } from '@/components/ui/Modal';
import { Search, CreditCard, Download, RotateCcw, Eye, Printer, Pencil } from 'lucide-react';

const PAYMENT_METHODS = ['bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other'] as const;

type PaymentRow = Payment & {
  invoice: {
    invoice_number: string;
    currency: string;
    balance_due: number;
    client: { name: string };
  } | null;
};

type Toast = { msg: string; ok: boolean };
type EditPaymentForm = {
  amount_paid: string;
  actual_received: string;
  wht_withheld: string;
  payment_date: string;
  payment_method: typeof PAYMENT_METHODS[number];
  reference_number: string;
  note: string;
  wht_certificate_number: string;
};

export default function PaymentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const { can, isAdmin } = useCurrentUser();

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

  // Admin edit + confirm state. A payment must be reversed before this modal opens.
  const [editTarget, setEditTarget] = useState<PaymentRow | null>(null);
  const [editForm, setEditForm] = useState<EditPaymentForm>({
    amount_paid: '',
    actual_received: '',
    wht_withheld: '',
    payment_date: '',
    payment_method: 'bank_transfer',
    reference_number: '',
    note: '',
    wht_certificate_number: '',
  });
  const [editBusy, setEditBusy] = useState(false);

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
      .select('*, invoice:invoices(invoice_number, currency, balance_due, client:clients(name))')
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
  function openReceipt(paymentId: string, print = false) {
    window.open(`/api/pdf/receipt/${paymentId}${print ? '?print=1' : ''}`, '_blank', 'noopener,noreferrer');
  }

  function openEditPayment(payment: PaymentRow) {
    if (payment.status !== 'reversed') {
      showToast('Reverse the payment before editing it.', false);
      return;
    }

    setEditTarget(payment);
    setEditForm({
      amount_paid: String(payment.amount_paid ?? ''),
      actual_received: String(payment.actual_received ?? payment.amount_paid ?? ''),
      wht_withheld: String(payment.wht_withheld ?? 0),
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      reference_number: payment.reference_number ?? '',
      note: payment.note ?? '',
      wht_certificate_number: payment.wht_certificate_number ?? '',
    });
  }

  async function submitPaymentEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget || !activeCompanyId) return;

    const amountPaid = parseFloat(editForm.amount_paid);
    const actualReceived = editForm.actual_received.trim()
      ? parseFloat(editForm.actual_received)
      : amountPaid;
    const whtWithheld = editForm.wht_withheld.trim()
      ? parseFloat(editForm.wht_withheld)
      : 0;

    if (!amountPaid || amountPaid <= 0) {
      showToast('Enter a payment amount greater than zero.', false);
      return;
    }

    if (Number.isNaN(actualReceived) || actualReceived < 0 || Number.isNaN(whtWithheld) || whtWithheld < 0) {
      showToast('Payment and WHT amounts must be valid numbers.', false);
      return;
    }

    setEditBusy(true);
    const res = await fetch(`/api/payments/${editTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: activeCompanyId,
        payment_date: editForm.payment_date,
        amount_paid: amountPaid,
        actual_received: actualReceived,
        wht_withheld: whtWithheld,
        payment_method: editForm.payment_method,
        reference_number: editForm.reference_number,
        note: editForm.note,
        wht_certificate_number: editForm.wht_certificate_number || null,
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };

    if (res.ok && data.ok) {
      setEditTarget(null);
      showToast('Payment edited and confirmed again.', true);
      await fetchPayments();
    } else {
      showToast(data.error ?? 'Payment edit failed.', false);
    }
    setEditBusy(false);
  }

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
  const canEditPayment = isAdmin();

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
                    {['Receipt #', 'Date', 'Client', 'Invoice', 'Amount', 'Method', 'Reference', 'Actions', 'Status'].map(h => (
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
                          {pay.invoice?.invoice_number ?? '-'}
                        </Link>
                      </td>
                      <td className={`px-4 py-3 font-semibold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                        {formatCurrency(pay.amount_paid, pay.invoice?.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[pay.payment_method] ?? pay.payment_method}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{pay.reference_number || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openReceipt(pay.id)}
                            title="View Receipt"
                            aria-label={`View receipt ${pay.payment_number}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openReceipt(pay.id, true)}
                            title="Print Receipt"
                            aria-label={`Print receipt ${pay.payment_number}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          {canEditPayment && (
                            <button
                              type="button"
                              onClick={() => openEditPayment(pay)}
                              disabled={pay.status !== 'reversed'}
                              title={pay.status === 'reversed' ? 'Edit and confirm payment' : 'Reverse before editing'}
                              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs transition-colors ${
                                pay.status === 'reversed'
                                  ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'border-slate-200 text-slate-300 cursor-not-allowed'
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                          {canReverse && pay.status === 'confirmed' && (
                            <button
                              type="button"
                              onClick={() => setReversalTarget(pay)}
                              className="inline-flex h-8 items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 px-2 rounded-lg transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" /> Reverse
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><PaymentStatusBadge status={pay.status ?? 'confirmed'} /></td>
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
                        {pay.invoice?.invoice_number ?? '-'}
                      </Link>
                    </div>
                    <PaymentStatusBadge status={pay.status ?? 'confirmed'} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className={`text-base font-bold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                      {formatCurrency(pay.amount_paid, pay.invoice?.currency)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(pay.payment_date)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>{PAYMENT_METHOD_LABELS[pay.payment_method] ?? pay.payment_method}</span>
                    {pay.reference_number && <span className="font-mono">{pay.reference_number}</span>}
                    <span className="font-mono text-slate-400">{pay.payment_number}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openReceipt(pay.id)}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 bg-white px-2 py-1.5 rounded-lg"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button
                      type="button"
                      onClick={() => openReceipt(pay.id, true)}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 border border-slate-200 bg-white px-2 py-1.5 rounded-lg"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                    {canEditPayment && (
                      <button
                        type="button"
                        onClick={() => openEditPayment(pay)}
                        disabled={pay.status !== 'reversed'}
                        className={`inline-flex items-center gap-1 text-xs border px-2 py-1.5 rounded-lg ${
                          pay.status === 'reversed'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-300'
                        }`}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {canReverse && pay.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => setReversalTarget(pay)}
                        className="inline-flex items-center gap-1 text-xs text-red-500 border border-red-200 bg-red-50 px-2 py-1.5 rounded-lg"
                      >
                        <RotateCcw className="h-3 w-3" /> Reverse
                      </button>
                    )}
                  </div>
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

      <Modal
        open={!!editTarget}
        onClose={() => { if (!editBusy) setEditTarget(null); }}
        title={`Edit payment ${editTarget?.payment_number ?? ''}`}
        maxWidth="lg"
      >
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-sm font-medium text-blue-900">Admin correction workflow</p>
          <p className="text-xs text-blue-700 mt-1">
            This payment has been reversed. Saving these changes will confirm it again and recalculate the connected invoice balance.
          </p>
          {editTarget?.invoice && (
            <p className="text-xs text-slate-600 mt-2">
              Invoice <span className="font-mono font-semibold">{editTarget.invoice.invoice_number}</span>
              {' '}current balance: <span className="font-semibold">{formatCurrency(editTarget.invoice.balance_due, editTarget.invoice.currency)}</span>
            </p>
          )}
        </div>
        <form onSubmit={submitPaymentEdit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Amount *</label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={editForm.amount_paid}
                onChange={e => setEditForm(f => ({ ...f, amount_paid: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier Received</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.actual_received}
                onChange={e => setEditForm(f => ({ ...f, actual_received: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">WHT Withheld</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.wht_withheld}
                onChange={e => setEditForm(f => ({ ...f, wht_withheld: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
              <input
                required
                type="date"
                value={editForm.payment_date}
                onChange={e => setEditForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method *</label>
              <select
                required
                value={editForm.payment_method}
                onChange={e => setEditForm(f => ({ ...f, payment_method: e.target.value as typeof PAYMENT_METHODS[number] }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_METHODS.map(method => (
                  <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
              <input
                type="text"
                value={editForm.reference_number}
                onChange={e => setEditForm(f => ({ ...f, reference_number: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">WHT Certificate Number</label>
            <input
              type="text"
              value={editForm.wht_certificate_number}
              onChange={e => setEditForm(f => ({ ...f, wht_certificate_number: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <textarea
              value={editForm.note}
              onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              disabled={editBusy}
              className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editBusy}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {editBusy ? 'Confirming...' : 'Save and Confirm'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
