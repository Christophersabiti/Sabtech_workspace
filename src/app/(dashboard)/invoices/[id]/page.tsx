'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Invoice, InvoiceItem, Payment } from '@/types';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ArrowLeft, Download, Printer, Plus, X, CreditCard, CheckCircle, Smartphone, Building2 } from 'lucide-react';

const PAYMENT_METHODS = ['bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other'] as const;

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    amount_paid: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer' as typeof PAYMENT_METHODS[number],
    reference_number: '',
    note: '',
  });
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: inv }, { data: inv_items }, { data: pays }] = await Promise.all([
      supabase.from('invoices').select('*, client:clients(*), project:projects(project_name, project_code)').eq('id', id).single(),
      supabase.from('invoice_items').select('*, service:services(service_name)').eq('invoice_id', id).order('sort_order'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date', { ascending: false }),
    ]);
    setInvoice(inv as Invoice);
    setItems(inv_items || []);
    setPayments(pays || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function nextPaymentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RCP-${year}-`;
    const { data: latest } = await supabase
      .from('payments')
      .select('payment_number')
      .like('payment_number', `${prefix}%`)
      .order('payment_number', { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (latest && latest.length > 0) {
      const parsed = parseInt(latest[0].payment_number.replace(prefix, ''), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payForm.amount_paid || parseFloat(payForm.amount_paid) <= 0) return;
    setSavingPay(true);

    const payNum = await nextPaymentNumber();

    const { error } = await supabase.from('payments').insert({
      payment_number: payNum,
      invoice_id: id,
      payment_date: payForm.payment_date,
      amount_paid: parseFloat(payForm.amount_paid),
      payment_method: payForm.payment_method,
      reference_number: payForm.reference_number || null,
      note: payForm.note || null,
      is_confirmed: true,
    });

    if (!error) {
      setShowPayModal(false);
      setPayForm({ amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'bank_transfer', reference_number: '', note: '' });
      load(); // Reload to get updated balances from DB triggers
    } else {
      alert('Error: ' + error.message);
    }
    setSavingPay(false);
  }

  async function markStatus(status: 'sent' | 'cancelled') {
    if (status === 'cancelled' && !confirm('Cancel this invoice? This cannot be undone easily.')) return;
    await supabase.from('invoices').update({ status }).eq('id', id);
    load();
  }

  function downloadPDF() {
    // Opens branded HTML invoice in new tab with auto-print → user saves as PDF
    window.open(`/api/pdf/invoice/${id}?print=1`, '_blank');
  }

  function printInvoice() {
    window.open(`/api/pdf/invoice/${id}`, '_blank');
  }

  if (loading) return <div className="p-12 text-center text-slate-400">Loading...</div>;
  if (!invoice) return <div className="p-12 text-center text-red-500">Invoice not found</div>;

  const client = invoice.client as Invoice['client'] & { name: string; company_name?: string; email?: string; phone?: string; address?: string };
  const project = invoice.project as { project_name: string; project_code: string } | null;

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </button>
        <div className="flex items-start justify-between">
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
          <div className="flex items-center gap-2">
            {invoice.status === 'draft' && (
              <button
                onClick={() => markStatus('sent')}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
              >
                <CheckCircle className="h-4 w-4" /> Mark as Sent
              </button>
            )}
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
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
            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <button
                onClick={() => markStatus('cancelled')}
                className="text-sm text-red-500 hover:text-red-700 px-2"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Billed To */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="grid grid-cols-2 gap-6">
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
                    <td className="px-4 py-3 text-xs text-slate-500">{(item.service as { service_name: string })?.service_name || '—'}</td>
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

          {/* Payment History */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Payment History</p>
              <span className="text-xs text-slate-400">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Payment #', 'Date', 'Amount', 'Method', 'Reference', 'Note'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No payments recorded yet</td></tr>
                ) : payments.map(pay => (
                  <tr key={pay.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{pay.payment_number}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(pay.payment_date)}</td>
                    <td className="px-4 py-3 font-semibold text-green-700">{formatCurrency(pay.amount_paid, invoice.currency)}</td>
                    <td className="px-4 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[pay.payment_method]}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{pay.reference_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{pay.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sticky top-6">
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
                  <span className="text-slate-500">Tax</span>
                  <span className="font-medium">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="font-semibold text-slate-900">Invoice Total</span>
                <span className="font-bold text-slate-900">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
              </div>
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

            {/* Download actions */}
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

          {/* Payment Instructions Card */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
            <h3 className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-4">Payment Instructions</h3>

            {/* MTN Mobile Money */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <Smartphone className="h-3 w-3 text-yellow-900" />
                </div>
                <span className="text-xs font-bold text-slate-800">MTN Mobile Money</span>
              </div>
              <div className="pl-8 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Number:</span>
                  <span className="font-mono font-bold text-slate-800">0777 293 933</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Account Name:</span>
                  <span className="font-semibold text-slate-700">Christopher Sabiti</span>
                </div>
              </div>
            </div>

            {/* MOMO Merchant */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-yellow-900 text-xs font-black">M</span>
                </div>
                <span className="text-xs font-bold text-slate-800">MOMO Merchant</span>
              </div>
              <div className="pl-8 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Merchant Code:</span>
                  <span className="font-mono font-bold text-slate-800">876997</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Account Name:</span>
                  <span className="font-semibold text-slate-700">Christopher Sabiti</span>
                </div>
              </div>
            </div>

            {/* Bank Transfer */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-bold text-slate-800">Bank Transfer</span>
              </div>
              <div className="pl-8 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Bank:</span>
                  <span className="font-semibold text-slate-700">Centenary Bank</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Account Name:</span>
                  <span className="font-semibold text-slate-700">Christopher Sabiti</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Account #:</span>
                  <span className="font-mono font-bold text-slate-800">3200051550</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Branch:</span>
                  <span className="font-semibold text-slate-700">Kasese</span>
                </div>
              </div>
            </div>

            <div className="border-t border-purple-200 pt-3 mt-3">
              <p className="text-xs text-purple-700 leading-relaxed">
                Use <span className="font-mono font-bold">{invoice.invoice_number}</span> as payment reference.
              </p>
              <p className="text-xs text-slate-500 mt-1">TIN: <span className="font-mono font-bold text-slate-700">1009345230</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Record Payment</h2>
              </div>
              <button onClick={() => setShowPayModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-xs text-slate-500">Invoice <span className="font-mono font-medium">{invoice.invoice_number}</span></p>
              <p className="text-sm font-medium text-slate-700">Balance Due: <span className="text-amber-700">{formatCurrency(invoice.balance_due, invoice.currency)}</span></p>
            </div>
            <form onSubmit={recordPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received *</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={invoice.balance_due}
                  value={payForm.amount_paid}
                  onChange={e => setPayForm(f => ({ ...f, amount_paid: e.target.value }))}
                  placeholder={`Max: ${invoice.balance_due}`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payForm.payment_date}
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
                  type="text"
                  value={payForm.reference_number}
                  onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))}
                  placeholder="Transaction ID, cheque #, etc."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
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
                  {savingPay ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
