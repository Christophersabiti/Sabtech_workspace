'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { Invoice } from '@/types';
import { formatCurrency, formatDate, STATUS_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plus, Search, FileText, TrendingUp, CheckCircle, AlertCircle, Download } from 'lucide-react';

const ALL_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void'] as const;

type InvoiceRow = Invoice & { client: { name: string }; project: { project_name: string } | null };

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const [invoices, setInvoices]       = useState<InvoiceRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');

  const fetchInvoices = useCallback(async () => {
    if (!activeCompanyId) {
      if (!companyLoading) {
        setInvoices([]);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    let query = supabase
      .from('invoices')
      .select('*, client:clients(name), project:projects(project_name)')
      .eq('company_id', activeCompanyId)
      .order('issue_date', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    if (dateFrom)     query = query.gte('issue_date', dateFrom);
    if (dateTo)       query = query.lte('issue_date', dateTo);
    const { data } = await query;
    setInvoices((data || []) as InvoiceRow[]);
    setLoading(false);
  }, [activeCompanyId, companyLoading, dateFrom, dateTo, statusFilter, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setInvoices([]);
      return fetchInvoices();
    });
  }, [fetchInvoices]);

  const filtered = invoices.filter(inv =>
    [inv.invoice_number, inv.client?.name, inv.project?.project_name]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Exclude void from financial totals
  const activeInvoices = invoices.filter(i => i.status !== 'void' && i.status !== 'cancelled');
  const totalInvoiced    = activeInvoices.reduce((s, i) => s + i.total_amount, 0);
  const totalPaid        = activeInvoices.reduce((s, i) => s + i.total_paid, 0);
  const totalOutstanding = activeInvoices.reduce((s, i) => s + i.balance_due, 0);
  const totalOverdue     = activeInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.balance_due, 0);

  const hasFilters = !!(statusFilter || dateFrom || dateTo);

  function exportCSV() {
    const headers = ['Invoice #', 'Client', 'Project', 'Issue Date', 'Due Date', 'Currency', 'Total', 'Paid', 'Balance', 'Status'];
    const rows = filtered.map(inv => [
      inv.invoice_number,
      (inv.client as { name: string } | undefined)?.name ?? '',
      (inv.project as { project_name: string } | null)?.project_name ?? '',
      inv.issue_date,
      inv.due_date ?? '',
      inv.currency,
      inv.total_amount,
      inv.total_paid,
      inv.balance_due,
      inv.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a   = document.createElement('a');
    a.href    = url;
    a.download = `invoices-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm px-3 py-2 rounded-lg"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" /> New Invoice
            </Link>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'Total Invoiced', value: formatCurrency(totalInvoiced),    icon: FileText,     color: 'text-blue-600 bg-blue-50' },
          { label: 'Total Paid',     value: formatCurrency(totalPaid),        icon: CheckCircle,  color: 'text-green-600 bg-green-50' },
          { label: 'Outstanding',    value: formatCurrency(totalOutstanding),  icon: TrendingUp,   color: 'text-amber-600 bg-amber-50' },
          { label: 'Overdue',        value: formatCurrency(totalOverdue),      icon: AlertCircle,  color: 'text-red-600 bg-red-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-medium text-slate-500 hidden sm:block">{label}</p>
            </div>
            <p className="text-xs font-medium text-slate-500 sm:hidden mb-1">{label}</p>
            <p className="text-base md:text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-6">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="flex-1 sm:flex-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {hasFilters && (
            <button
              onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); }}
              className="text-sm text-slate-500 hover:text-slate-700 underline whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table / Cards */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <LoadingSpinner label="Loading invoices…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices found"
            description={hasFilters || search ? 'Try clearing your filters.' : 'Create your first invoice to get started.'}
            action={!hasFilters && !search ? (
              <Link href="/invoices/new" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
                <Plus className="h-4 w-4" /> New Invoice
              </Link>
            ) : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Invoice #', 'Client', 'Project', 'Issue Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(inv => (
                    <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${inv.status === 'void' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{inv.client?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-32 truncate">{inv.project?.project_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.issue_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(inv.total_amount, inv.currency)}</td>
                      <td className="px-4 py-3 text-green-700">{formatCurrency(inv.total_paid, inv.currency)}</td>
                      <td className="px-4 py-3 font-medium text-amber-700">{formatCurrency(inv.balance_due, inv.currency)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-xs">View →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map(inv => (
                <div key={inv.id} className={`p-4 ${inv.status === 'void' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{inv.client?.name || '—'}</p>
                      <p className="font-mono text-xs text-slate-400 mt-0.5">{inv.invoice_number}</p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-400">Total</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(inv.total_amount, inv.currency)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Paid</p>
                      <p className="font-medium text-green-700">{formatCurrency(inv.total_paid, inv.currency)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Balance</p>
                      <p className="font-medium text-amber-700">{formatCurrency(inv.balance_due, inv.currency)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-slate-400">{formatDate(inv.issue_date)}{inv.due_date && ` · Due ${formatDate(inv.due_date)}`}</p>
                    <Link href={`/invoices/${inv.id}`} className="text-blue-600 text-xs font-medium">View →</Link>
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
