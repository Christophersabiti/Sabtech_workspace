'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Invoice, Payment } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileText, CheckCircle, TrendingUp, AlertCircle, Download } from 'lucide-react';

function exportInvoicesCSV(invoices: InvoiceRow[]) {
  const headers = ['Invoice #', 'Client', 'Project', 'Date', 'Total', 'Paid', 'Balance', 'Status', 'Currency'];
  const rows = invoices.map(inv => [
    inv.invoice_number,
    inv.client?.name ?? '',
    inv.project?.project_name ?? '',
    inv.issue_date,
    inv.total_amount,
    inv.total_paid,
    inv.balance_due,
    inv.status,
    inv.currency,
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPaymentsCSV(payments: (Payment & { invoice: { invoice_number: string } | null })[]) {
  const headers = ['Receipt #', 'Date', 'Invoice', 'Amount', 'Method', 'Reference', 'Status'];
  const rows = payments.map(p => [
    p.payment_number,
    p.payment_date,
    p.invoice?.invoice_number ?? '',
    p.amount_paid,
    p.payment_method,
    p.reference_number ?? '',
    p.status ?? 'confirmed',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `payments-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportClientsCSV(clientRows: { name: string; billed: number; paid: number; outstanding: number }[]) {
  const headers = ['Client', 'Total Billed', 'Total Collected', 'Outstanding'];
  const rows = clientRows.map(r => [r.name, r.billed, r.paid, r.outstanding]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `clients-revenue-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

type InvoiceRow = Invoice & { client: { name: string } | null; project: { project_name: string } | null };
type Tab = 'overview' | 'invoices' | 'payments' | 'clients';

export default function ReportsPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<(Payment & { invoice: { invoice_number: string } | null })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('overview');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    let invQ = supabase
      .from('invoices')
      .select('*, client:clients(name), project:projects(project_name)')
      .order('issue_date', { ascending: false });
    if (dateFrom) invQ = invQ.gte('issue_date', dateFrom);
    if (dateTo)   invQ = invQ.lte('issue_date', dateTo);

    let payQ = supabase
      .from('payments')
      .select('*, invoice:invoices(invoice_number)')
      .order('payment_date', { ascending: false });
    if (dateFrom) payQ = payQ.gte('payment_date', dateFrom);
    if (dateTo)   payQ = payQ.lte('payment_date', dateTo);

    const [{ data: inv }, { data: pay }] = await Promise.all([invQ, payQ]);
    setInvoices((inv || []) as InvoiceRow[]);
    setPayments((pay || []) as (Payment & { invoice: { invoice_number: string } | null })[]);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregates — exclude void from financial totals
  const activeInvoices  = invoices.filter(i => i.status !== 'void' && i.status !== 'cancelled');
  const confirmedPayments = payments.filter(p => p.status !== 'reversed');
  const totalInvoiced   = activeInvoices.reduce((s, i) => s + i.total_amount, 0);
  const totalOutstanding = activeInvoices.reduce((s, i) => s + i.balance_due, 0);
  const totalReceived   = confirmedPayments.reduce((s, p) => s + p.amount_paid, 0);

  const countByStatus = invoices.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {});

  const clientMap: Record<string, { name: string; billed: number; paid: number; outstanding: number }> = {};
  activeInvoices.forEach(inv => {
    const name = inv.client?.name || 'Unknown';
    if (!clientMap[name]) clientMap[name] = { name, billed: 0, paid: 0, outstanding: 0 };
    clientMap[name].billed      += inv.total_amount;
    clientMap[name].paid        += inv.total_paid;
    clientMap[name].outstanding += inv.balance_due;
  });
  const clientRows = Object.values(clientMap).sort((a, b) => b.billed - a.billed);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'invoices',  label: `Invoices (${invoices.length})` },
    { id: 'payments',  label: `Payments (${payments.length})` },
    { id: 'clients',   label: 'By Client' },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Financial overview, invoice analytics, and collection summary"
      />

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <span className="text-sm text-slate-500 whitespace-nowrap">Date range:</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-sm text-slate-400 hover:text-slate-600 underline">Clear</button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'Total Invoiced',   value: formatCurrency(totalInvoiced),   icon: FileText,     border: 'border-t-blue-500',  iconCls: 'bg-blue-50 text-blue-600' },
          { label: 'Total Collected',  value: formatCurrency(totalReceived),   icon: CheckCircle,  border: 'border-t-green-500', iconCls: 'bg-green-50 text-green-600' },
          { label: 'Outstanding',      value: formatCurrency(totalOutstanding), icon: TrendingUp,   border: 'border-t-amber-500', iconCls: 'bg-amber-50 text-amber-600' },
          { label: 'Overdue Invoices', value: `${countByStatus['overdue'] || 0}`, icon: AlertCircle, border: 'border-t-red-500', iconCls: 'bg-red-50 text-red-600' },
        ].map(({ label, value, icon: Icon, border, iconCls }) => (
          <div key={label} className={`bg-white border border-slate-200 border-t-4 ${border} rounded-xl p-4 shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconCls}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-medium text-slate-500 hidden sm:block">{label}</p>
            </div>
            <p className="text-xs font-medium text-slate-500 sm:hidden mb-1">{label}</p>
            <p className="text-base md:text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
        {[
          { label: 'Draft',     key: 'draft',          cls: 'bg-slate-100 text-slate-700' },
          { label: 'Sent',      key: 'sent',           cls: 'bg-blue-100 text-blue-700' },
          { label: 'Partial',   key: 'partially_paid', cls: 'bg-amber-100 text-amber-700' },
          { label: 'Paid',      key: 'paid',           cls: 'bg-green-100 text-green-700' },
          { label: 'Overdue',   key: 'overdue',        cls: 'bg-red-100 text-red-700' },
          { label: 'Void',      key: 'void',           cls: 'bg-red-200 text-red-800' },
          { label: 'Cancelled', key: 'cancelled',      cls: 'bg-slate-200 text-slate-500' },
        ].map(({ label, key, cls }) => (
          <div key={key} className={`rounded-xl px-3 py-2.5 ${cls} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5`}>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-lg sm:text-xl font-bold">{countByStatus[key] || 0}</span>
          </div>
        ))}
      </div>

      {/* Tabs — horizontal scroll on mobile */}
      <div className="border-b border-slate-200 mb-6 -mx-4 md:mx-0 px-4 md:px-0">
        <nav className="flex gap-4 sm:gap-6 overflow-x-auto pb-px hide-scrollbar">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading...</div>
      ) : tab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Recent Invoices</h3>
            <div className="space-y-2">
              {invoices.slice(0, 10).map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="min-w-0 mr-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{inv.client?.name || '—'}</p>
                    <p className="text-xs text-slate-400 font-mono">{inv.invoice_number}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold">{formatCurrency(inv.total_amount, inv.currency)}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
              {invoices.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">No invoices yet</p>}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Top Clients by Revenue</h3>
            <div className="space-y-2">
              {clientRows.slice(0, 10).map(row => (
                <div key={row.name} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <p className="text-sm font-medium text-slate-800 truncate mr-2">{row.name}</p>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(row.billed)}</p>
                    {row.outstanding > 0 && <p className="text-xs text-amber-600">{formatCurrency(row.outstanding)} due</p>}
                  </div>
                </div>
              ))}
              {clientRows.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">No data yet</p>}
            </div>
          </div>
        </div>
      ) : tab === 'invoices' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex justify-end px-4 py-2 border-b border-slate-100">
            <button
              onClick={() => exportInvoicesCSV(invoices)}
              disabled={invoices.length === 0}
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Invoice #', 'Client', 'Project', 'Date', 'Total', 'Paid', 'Balance', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No invoices</td></tr>
                ) : invoices.map(inv => (
                  <tr key={inv.id} className={`hover:bg-slate-50 ${inv.status === 'void' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.client?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inv.project?.project_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(inv.total_amount, inv.currency)}</td>
                    <td className="px-4 py-3 text-green-700">{formatCurrency(inv.total_paid, inv.currency)}</td>
                    <td className="px-4 py-3 text-amber-700 font-medium">{formatCurrency(inv.balance_due, inv.currency)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="md:hidden divide-y divide-slate-100">
            {invoices.map(inv => (
              <div key={inv.id} className={`p-4 ${inv.status === 'void' ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium text-slate-900">{inv.client?.name || '—'}</p>
                    <p className="font-mono text-xs text-slate-400">{inv.invoice_number}</p></div>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-400">Total</p><p className="font-semibold">{formatCurrency(inv.total_amount, inv.currency)}</p></div>
                  <div><p className="text-slate-400">Paid</p><p className="text-green-700">{formatCurrency(inv.total_paid, inv.currency)}</p></div>
                  <div><p className="text-slate-400">Balance</p><p className="text-amber-700">{formatCurrency(inv.balance_due, inv.currency)}</p></div>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{formatDate(inv.issue_date)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'payments' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex justify-end px-4 py-2 border-b border-slate-100">
            <button
              onClick={() => exportPaymentsCSV(payments)}
              disabled={payments.length === 0}
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Receipt #', 'Date', 'Invoice', 'Amount', 'Method', 'Reference', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No payments</td></tr>
                ) : payments.map(pay => (
                  <tr key={pay.id} className={`hover:bg-slate-50 ${pay.status === 'reversed' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs">{pay.payment_number}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(pay.payment_date)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{pay.invoice?.invoice_number || '—'}</td>
                    <td className={`px-4 py-3 font-semibold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                      {formatCurrency(pay.amount_paid)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{pay.payment_method.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{pay.reference_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${pay.status === 'reversed' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                        {pay.status ?? 'confirmed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="sm:hidden divide-y divide-slate-100">
            {payments.map(pay => (
              <div key={pay.id} className={`p-4 ${pay.status === 'reversed' ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-mono text-xs text-blue-600">{pay.invoice?.invoice_number || '—'}</p>
                    <p className={`text-base font-bold ${pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-green-700'}`}>{formatCurrency(pay.amount_paid)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${pay.status === 'reversed' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                      {pay.status ?? 'confirmed'}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(pay.payment_date)}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1 capitalize">{pay.payment_method.replace(/_/g, ' ')}{pay.reference_number && ` · ${pay.reference_number}`}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex justify-end px-4 py-2 border-b border-slate-100">
            <button
              onClick={() => exportClientsCSV(clientRows)}
              disabled={clientRows.length === 0}
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Client', 'Total Billed', 'Total Collected', 'Outstanding'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No data</td></tr>
                ) : clientRows.map(row => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(row.billed)}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{formatCurrency(row.paid)}</td>
                    <td className="px-4 py-3 text-amber-700 font-medium">{formatCurrency(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden divide-y divide-slate-100">
            {clientRows.map(row => (
              <div key={row.name} className="p-4">
                <p className="font-semibold text-slate-900">{row.name}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-400">Billed</p><p className="font-semibold text-slate-900">{formatCurrency(row.billed)}</p></div>
                  <div><p className="text-slate-400">Collected</p><p className="text-green-700">{formatCurrency(row.paid)}</p></div>
                  <div><p className="text-slate-400">Outstanding</p><p className="text-amber-700">{formatCurrency(row.outstanding)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
