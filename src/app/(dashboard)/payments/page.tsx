'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Payment } from '@/types';
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, CreditCard } from 'lucide-react';

type PaymentRow = Payment & { invoice: { invoice_number: string; invoice_id: string; client: { name: string } } };

export default function PaymentsPage() {
  const supabase = createClient();
  const [payments, setPayments]           = useState<PaymentRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [methodFilter, setMethodFilter]   = useState('');
  const [statusFilter, setStatusFilter]   = useState('');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('payments')
      .select('*, invoice:invoices(invoice_number, client:clients(name))')
      .order('payment_date', { ascending: false });
    if (methodFilter) query = query.eq('payment_method', methodFilter);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data } = await query;
    setPayments((data || []) as PaymentRow[]);
    setLoading(false);
  }, [methodFilter, statusFilter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const filtered = payments.filter(p =>
    [p.payment_number, p.invoice?.invoice_number, p.invoice?.client?.name, p.reference_number]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Totals — exclude reversed
  const confirmed = payments.filter(p => p.status !== 'reversed');
  const totalReceived  = confirmed.reduce((s, p) => s + p.amount_paid, 0);
  const totalReversed  = payments.filter(p => p.status === 'reversed').reduce((s, p) => s + p.amount_paid, 0);

  const paymentStatusBadge = (status: string) => {
    if (status === 'reversed') return 'bg-red-100 text-red-600';
    if (status === 'failed')   return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={`${payments.length} payment${payments.length !== 1 ? 's' : ''} recorded`}
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
            type="text"
            placeholder="Search payments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
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
          <div className="p-12 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No payments found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Receipt #', 'Date', 'Client', 'Invoice', 'Amount', 'Method', 'Reference', 'Status'].map(h => (
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
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${paymentStatusBadge(pay.status ?? 'confirmed')}`}>
                          {pay.status ?? 'confirmed'}
                        </span>
                      </td>
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
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${paymentStatusBadge(pay.status ?? 'confirmed')}`}>
                      {pay.status ?? 'confirmed'}
                    </span>
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
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
