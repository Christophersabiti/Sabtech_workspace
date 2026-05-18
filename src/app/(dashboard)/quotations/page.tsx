'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Quotation, QuotationStatus } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  Plus,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Send,
  ChevronRight,
} from 'lucide-react';

const STATUS_STYLES: Record<QuotationStatus, string> = {
  draft:     'bg-slate-100 text-slate-600',
  sent:      'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  expired:   'bg-amber-100 text-amber-700',
  converted: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft:     'Draft',
  sent:      'Sent',
  approved:  'Approved',
  rejected:  'Rejected',
  expired:   'Expired',
  converted: 'Converted',
};

const ALL_STATUSES: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'];

type QuotationRow = Quotation & { client: { name: string } | null };

export default function QuotationsPage() {
  const supabase = createClient();
  const [quotations, setQuotations] = useState<QuotationRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('quotations')
      .select('*, client:clients(name)')
      .order('created_at', { ascending: false });
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data } = await q;
    setQuotations((data || []) as QuotationRow[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Stats
  const total     = quotations.length;
  const drafts    = quotations.filter(q => q.status === 'draft').length;
  const approved  = quotations.filter(q => q.status === 'approved').length;
  const converted = quotations.filter(q => q.status === 'converted').length;

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Create and manage client quotations before starting a project"
        action={
          <Link
            href="/quotations/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> New Quotation
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total',     value: total,     icon: FileText,    cls: 'text-slate-600 bg-slate-50' },
          { label: 'Draft',     value: drafts,    icon: Clock,       cls: 'text-slate-500 bg-slate-50' },
          { label: 'Approved',  value: approved,  icon: CheckCircle, cls: 'text-green-600 bg-green-50' },
          { label: 'Converted', value: converted, icon: Send,        cls: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <p className="text-xs font-medium text-slate-500 hidden sm:block">{label}</p>
            </div>
            <p className="text-xs font-medium text-slate-500 sm:hidden mb-1">{label}</p>
            <p className="text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            statusFilter === ''
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading quotations…</div>
      ) : quotations.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          {statusFilter ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} quotations.` : 'No quotations yet. Create your first one.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Quote #', 'Client', 'Project', 'Issue Date', 'Valid Until', 'Total', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{q.quotation_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{q.client?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{q.project_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(q.issue_date)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(q.valid_until)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(q.total_amount, q.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[q.status]}`}>
                        {STATUS_LABELS[q.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        View <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {quotations.map(q => (
              <Link key={q.id} href={`/quotations/${q.id}`} className="block bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{q.client?.name || '—'}</p>
                    <p className="text-xs font-mono text-slate-400">{q.quotation_number}</p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_STYLES[q.status]}`}>
                    {STATUS_LABELS[q.status]}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2 truncate">{q.project_name || '—'}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-400">Total</p><p className="font-bold text-slate-900">{formatCurrency(q.total_amount, q.currency)}</p></div>
                  <div><p className="text-slate-400">Issued</p><p className="text-slate-600">{formatDate(q.issue_date)}</p></div>
                  <div><p className="text-slate-400">Valid Until</p><p className="text-slate-600">{formatDate(q.valid_until)}</p></div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
