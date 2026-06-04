'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Invoice, InvoiceItem, Payment } from '@/types';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PaymentStatusBadge } from '@/components/ui/PaymentStatusBadge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  ArrowLeft, Download, Printer, Plus, CreditCard,
  CheckCircle, Smartphone, Building2, Send, Ban, RotateCcw, Bell,
} from 'lucide-react';

const PAYMENT_METHODS = ['bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other'] as const;

type Toast = { msg: string; ok: boolean };
type PayFormState = {
  actual_received: string;
  wht_withheld: string;
  payment_date: string;
  payment_method: typeof PAYMENT_METHODS[number];
  reference_number: string;
  note: string;
  wht_certificate_number: string;
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const { can } = useCurrentUser();

  const [invoice,  setInvoice]  = useState<Invoice | null>(null);
  const [items,    setItems]    = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [toast,    setToast]    = useState<Toast | null>(null);

  // Payment modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState<PayFormState>({
    actual_received:       '',
    wht_withheld:          '',
    payment_date:          new Date().toISOString().split('T')[0],
    payment_method:        'bank_transfer',
    reference_number:      '',
    note:                  '',
    wht_certificate_number: '',
  });
  const [savingPay, setSavingPay] = useState(false);

  // Cancel / Void confirm dialog state
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmVoid,   setConfirmVoid]   = useState(false);
  const [voidReason,    setVoidReason]    = useState('');
  const [actionBusy,    setActionBusy]    = useState(false);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (companyLoading) return;
    if (!activeCompanyId) {
      setInvoice(null); setItems([]); setPayments([]); setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const [{ data: inv, error: invErr }, { data: inv_items }, { data: pays }] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, client:clients(*), project:projects(project_name, project_code)')
        .eq('id', id)
        .eq('company_id', activeCompanyId)
        .single(),
      supabase
        .from('invoice_items')
        .select('*, service:services(service_name)')
        .eq('invoice_id', id)
        .eq('company_id', activeCompanyId)
        .order('sort_order'),
      supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .eq('company_id', activeCompanyId)
        .order('payment_date', { ascending: false }),
    ]);

    if (invErr) { setError(invErr.message); setLoading(false); return; }
    setInvoice(inv as Invoice);
    setItems(inv_items ?? []);
    setPayments(pays ?? []);
    setLoading(false);
  }, [activeCompanyId, companyLoading, id, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setInvoice(null); setItems([]); setPayments([]);
      return load();
    });
  }, [load]);

  // ── Record Payment ────────────────────────────────────────────────────────────
  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    const actualReceived = parseFloat(payForm.actual_received);
    const whtWithheld = parseFloat(payForm.wht_withheld) || 0;
    if (!actualReceived || actualReceived <= 0) return;
    // amount_paid = actual_received; WHT withheld is tracked separately for URA reporting
    // The trigger reconciles balance as: net_payable_amount - sum(amount_paid)
    setSavingPay(true);

    const res = await fetch(`/api/invoices/${id}/payments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        company_id:             invoice.company_id,
        payment_date:           payForm.payment_date,
        amount_paid:            actualReceived,
        actual_received:        actualReceived,
        wht_withheld:           whtWithheld,
        payment_method:         payForm.payment_method,
        reference_number:       payForm.reference_number,
        note:                   payForm.note,
        wht_certificate_number: payForm.wht_certificate_number || null,
      }),
    });

    const data = await res.json() as { ok?: boolean; error?: string };

    if (res.ok && data.ok) {
      setShowPayModal(false);
      setPayForm({
        actual_received: '', wht_withheld: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank_transfer', reference_number: '', note: '',
        wht_certificate_number: '',
      });
      showToast('Payment recorded successfully.', true);
      await load();
    } else {
      showToast(data.error ?? 'Failed to record payment.', false);
    }
    setSavingPay(false);
  }

  // ── Mark as Sent ──────────────────────────────────────────────────────────────
  async function markSent() {
    if (!invoice) return;
    setActionBusy(true);
    const res = await fetch(`/api/invoices/${id}/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: invoice.company_id }),
    });
    const data = await res.json() as { ok?: boolean; is_reminder?: boolean; error?: string };
    if (res.ok && data.ok) {
      showToast(data.is_reminder ? 'Reminder sent.' : 'Invoice marked as sent.', true);
      await load();
    } else {
      showToast(data.error ?? 'Action failed.', false);
    }
    setActionBusy(false);
  }

  // ── Cancel Invoice ─────────────────────────────────────────────────────────────
  async function cancelInvoice() {
    if (!invoice) return;
    setActionBusy(true);
    const res = await fetch(`/api/invoices/${id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: invoice.company_id, status: 'cancelled' }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setConfirmCancel(false);
    if (res.ok && data.ok) {
      showToast('Invoice cancelled.', true);
      await load();
    } else {
      showToast(data.error ?? 'Could not cancel invoice.', false);
    }
    setActionBusy(false);
  }

  // ── Void Invoice ──────────────────────────────────────────────────────────────
  async function voidInvoice() {
    if (!invoice || !voidReason.trim()) return;
    setActionBusy(true);
    const res = await fetch(`/api/invoices/${id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: invoice.company_id, status: 'void', reason: voidReason }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    setConfirmVoid(false);
    setVoidReason('');
    if (res.ok && data.ok) {
      showToast('Invoice voided.', true);
      await load();
    } else {
      showToast(data.error ?? 'Could not void invoice.', false);
    }
    setActionBusy(false);
  }

  function downloadPDF()  { window.open(`/api/pdf/invoice/${id}?print=1`, '_blank'); }
  function printInvoice() { window.open(`/api/pdf/invoice/${id}`, '_blank'); }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner label="Loading invoice…" />;
  if (error)   return <ErrorState message={error} retry={load} />;
  if (!invoice) return <ErrorState message="Invoice not found." />;

  const client  = invoice.client as Invoice['client'] & { name: string; company_name?: string; email?: string; phone?: string; address?: string };
  const project = invoice.project as { project_name: string; project_code: string } | null;

  const canSend    = invoice.status === 'draft' && can('send_invoice');
  const canRemind  = invoice.status === 'sent'  && can('send_reminder');
  const canPay     = !['paid', 'cancelled', 'void'].includes(invoice.status) && can('record_payment');
  const canCancel  = !['cancelled', 'paid', 'void'].includes(invoice.status);
  const canVoid    = can('void_invoice') && !['void', 'cancelled'].includes(invoice.status);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.ok ? <CheckCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">{invoice.invoice_number}</h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-slate-500">
              Issued {formatDate(invoice.issue_date)}
              {invoice.due_date && ` · Due ${formatDate(invoice.due_date)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSend && (
              <button
                onClick={markSent}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Mark as Sent
              </button>
            )}
            {canRemind && (
              <button
                onClick={markSent}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
              >
                <Bell className="h-4 w-4" /> Send Reminder
              </button>
            )}
            {canPay && (
              <button
                onClick={() => setShowPayModal(true)}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg"
              >
                <Plus className="h-4 w-4" /> Record Payment
              </button>
            )}
            <button
              onClick={printInvoice}
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm px-4 py-2 rounded-lg"
            >
              <Printer className="h-4 w-4" /> Preview
            </button>
            <button
              onClick={downloadPDF}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-lg font-semibold"
            >
              <Download className="h-4 w-4" /> Download PDF
            </button>
            {canVoid && (
              <button
                onClick={() => setConfirmVoid(true)}
                className="inline-flex items-center gap-2 text-sm text-amber-600 hover:text-amber-800 border border-amber-200 bg-amber-50 px-3 py-2 rounded-lg"
              >
                <RotateCcw className="h-4 w-4" /> Void
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="text-sm text-red-500 hover:text-red-700 px-2"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Billed To */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Billed To</p>
                <p className="font-semibold text-slate-900">{client?.name}</p>
                {client?.company_name && <p className="text-sm text-slate-600">{client.company_name}</p>}
                {client?.email && <p className="text-sm text-slate-500">{client.email}</p>}
                {client?.phone && <p className="text-sm text-slate-500">{client.phone}</p>}
                {client?.address && <p className="text-sm text-slate-500 mt-1 whitespace-pre-line">{client.address}</p>}
              </div>
              {project && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Project</p>
                  <p className="font-semibold text-slate-900">{project.project_name}</p>
                  <p className="text-sm text-slate-500 font-mono">{project.project_code}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Invoice Items</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Service', 'Description', 'Qty', 'Unit Price', 'Disc %', 'Tax %', 'Total'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No line items</td></tr>
                  ) : items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-500">{(item.service as { service_name: string } | undefined)?.service_name || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{item.item_name}</p>
                        {item.description && <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                      <td className="px-4 py-3 text-slate-700">{formatCurrency(item.unit_price, invoice.currency)}</td>
                      <td className="px-4 py-3 text-slate-500">{item.discount_percent}%</td>
                      <td className="px-4 py-3 text-slate-500">{item.tax_percent}%</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(item.line_total, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Payment History</p>
              <span className="text-xs text-slate-400">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
            </div>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Payment #', 'Date', 'Amount', 'Method', 'Reference', 'Status', 'Note'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No payments recorded yet</td></tr>
                  ) : payments.map(pay => (
                    <tr key={pay.id} className={`hover:bg-slate-50 ${pay.status === 'reversed' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs">{pay.payment_number}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(pay.payment_date)}</td>
                      <td className={`px-4 py-3 font-semibold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                        {formatCurrency(pay.amount_paid, invoice.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[pay.payment_method]}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{pay.reference_number || '—'}</td>
                      <td className="px-4 py-3"><PaymentStatusBadge status={pay.status ?? 'confirmed'} /></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{pay.reversal_reason ?? pay.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {payments.length === 0 ? (
                <p className="p-8 text-center text-slate-400 text-sm">No payments recorded yet</p>
              ) : payments.map(pay => (
                <div key={pay.id} className={`p-4 ${pay.status === 'reversed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-slate-500">{pay.payment_number}</span>
                    <PaymentStatusBadge status={pay.status ?? 'confirmed'} />
                  </div>
                  <p className={`text-base font-bold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                    {formatCurrency(pay.amount_paid, invoice.currency)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(pay.payment_date)} · {PAYMENT_METHOD_LABELS[pay.payment_method]}</p>
                  {pay.reversal_reason && <p className="text-xs text-red-500 mt-1">{pay.reversal_reason}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 lg:sticky top-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Financial Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-medium text-green-600">-{formatCurrency(invoice.discount_amount, invoice.currency)}</span>
                </div>
              )}
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">VAT / Tax</span>
                  <span className="font-medium">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                </div>
              )}
              {invoice.apply_wht && (
                <>
                  <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between">
                    <span className="font-semibold text-slate-900">
                      {invoice.wht_treatment === 'GROSS_UP' ? 'Gross Invoice Total' : 'Invoice Total'}
                    </span>
                    <span className="font-bold text-slate-900">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Withholding Tax</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">WHT Rate</span>
                      <span className="font-medium">{invoice.wht_rate}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Taxable Base</span>
                      <span className="font-medium">{formatCurrency(invoice.wht_taxable_amount, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">WHT Amount</span>
                      <span className="font-semibold text-red-600">- {formatCurrency(invoice.wht_amount, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-amber-200 pt-2">
                      <span className="text-amber-700">Remit to URA</span>
                      <span className="text-amber-700">{formatCurrency(invoice.wht_amount, invoice.currency)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2">
                    <span className="font-semibold text-green-800">Net Payable to Supplier</span>
                    <span className="font-bold text-green-700">{formatCurrency(invoice.net_payable_amount, invoice.currency)}</span>
                  </div>
                  {invoice.ura_wht_remittance_status !== 'NOT_APPLICABLE' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">URA Remittance Status</span>
                      <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                        invoice.ura_wht_remittance_status === 'REMITTED'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {invoice.ura_wht_remittance_status === 'REMITTED' ? 'Remitted' : 'Pending'}
                      </span>
                    </div>
                  )}
                </>
              )}
              {!invoice.apply_wht && (
                <div className="border-t border-slate-200 pt-3 flex justify-between">
                  <span className="font-semibold text-slate-900">Invoice Total</span>
                  <span className="font-bold text-slate-900">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-green-600 font-medium">Amount Paid</span>
                <span className="font-bold text-green-700">{formatCurrency(invoice.total_paid, invoice.currency)}</span>
              </div>
              <div className={`flex justify-between rounded-lg p-3 ${invoice.balance_due > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                <span className={`font-semibold ${invoice.balance_due > 0 ? 'text-amber-700' : 'text-green-700'}`}>Balance Due</span>
                <span className={`font-bold text-lg ${invoice.balance_due > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {formatCurrency(invoice.balance_due, invoice.currency)}
                </span>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-2">
              <button
                onClick={downloadPDF}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-2.5 rounded-lg font-semibold"
              >
                <Download className="h-4 w-4" /> Download PDF
              </button>
              <button
                onClick={printInvoice}
                className="w-full inline-flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm px-4 py-2.5 rounded-lg"
              >
                <Printer className="h-4 w-4" /> Preview / Print
              </button>
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-4">Payment Instructions</h3>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <Smartphone className="h-3 w-3 text-yellow-900" />
                </div>
                <span className="text-xs font-bold text-slate-800">MTN Mobile Money</span>
              </div>
              <div className="pl-8 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Number:</span><span className="font-mono font-bold text-slate-800">0777 293 933</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Account Name:</span><span className="font-semibold text-slate-700">Christopher Sabiti</span></div>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-bold text-slate-800">Bank Transfer — Centenary Bank</span>
              </div>
              <div className="pl-8 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Account #:</span><span className="font-mono font-bold text-slate-800">3200051550</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Account Name:</span><span className="font-semibold text-slate-700">Christopher Sabiti</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Branch:</span><span className="font-semibold text-slate-700">Kasese</span></div>
              </div>
            </div>
            <div className="border-t border-purple-200 pt-3">
              <p className="text-xs text-purple-700">Use <span className="font-mono font-bold">{invoice.invoice_number}</span> as reference.</p>
              <p className="text-xs text-slate-500 mt-1">TIN: <span className="font-mono font-bold text-slate-700">1009345230</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Record Payment" maxWidth="md">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <p className="text-xs text-slate-500">Invoice <span className="font-mono font-medium">{invoice.invoice_number}</span></p>
          {invoice.apply_wht ? (
            <div className="space-y-0.5 mt-1">
              <p className="text-sm font-medium text-slate-700">Gross Total: <span className="text-slate-900">{formatCurrency(invoice.total_amount, invoice.currency)}</span></p>
              <p className="text-sm font-medium text-slate-700">WHT ({invoice.wht_rate}%): <span className="text-red-600">- {formatCurrency(invoice.wht_amount, invoice.currency)}</span></p>
              <p className="text-sm font-medium text-slate-700">Net Payable: <span className="text-amber-700">{formatCurrency(invoice.net_payable_amount, invoice.currency)}</span></p>
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-700">Balance Due: <span className="text-amber-700">{formatCurrency(invoice.balance_due, invoice.currency)}</span></p>
          )}
        </div>
        <form onSubmit={recordPayment} className="p-6 space-y-4">
          {invoice.apply_wht ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received by Supplier *</label>
                  <input
                    required type="number" min="0.01" step="0.01"
                    value={payForm.actual_received}
                    onChange={e => setPayForm(f => ({ ...f, actual_received: e.target.value }))}
                    placeholder={`Net: ${invoice.net_payable_amount}`}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WHT Withheld (for URA)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={payForm.wht_withheld}
                    onChange={e => setPayForm(f => ({ ...f, wht_withheld: e.target.value }))}
                    placeholder={String(invoice.wht_amount)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              {payForm.actual_received && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  Client total disbursement (cash + WHT): {formatCurrency(
                    (parseFloat(payForm.actual_received) || 0) + (parseFloat(payForm.wht_withheld) || 0),
                    invoice.currency
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received *</label>
              <input
                required type="number" min="0.01" step="0.01" max={invoice.balance_due}
                value={payForm.actual_received}
                onChange={e => setPayForm(f => ({ ...f, actual_received: e.target.value }))}
                placeholder={`Max: ${invoice.balance_due}`}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
              <input
                type="date" value={payForm.payment_date}
                onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={payForm.payment_method}
                onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value as typeof PAYMENT_METHODS[number] }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number</label>
            <input
              type="text" value={payForm.reference_number}
              onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))}
              placeholder="Transaction ID, cheque #, etc."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {invoice.apply_wht && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">WHT Certificate Number</label>
              <input
                type="text" value={payForm.wht_certificate_number}
                onChange={e => setPayForm(f => ({ ...f, wht_certificate_number: e.target.value }))}
                placeholder="Certificate # from URA (optional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <textarea
              value={payForm.note}
              onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={savingPay} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {savingPay ? 'Recording…' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Confirm */}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancelInvoice}
        title="Cancel this invoice?"
        description="The invoice will be marked as cancelled. This can be reversed by voiding or re-editing."
        confirmLabel="Yes, Cancel Invoice"
        cancelLabel="Keep Invoice"
        danger
        loading={actionBusy}
      />

      {/* Void Confirm */}
      <ConfirmDialog
        open={confirmVoid}
        onClose={() => { setConfirmVoid(false); setVoidReason(''); }}
        onConfirm={voidInvoice}
        title="Void this invoice?"
        description="Voiding permanently marks the invoice invalid. A reason is required."
        confirmLabel="Void Invoice"
        danger
        loading={actionBusy}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason *</label>
          <textarea
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            rows={3}
            placeholder="Why is this invoice being voided?"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
