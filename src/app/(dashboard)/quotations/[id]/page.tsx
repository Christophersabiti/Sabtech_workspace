'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Quotation, QuotationItem, QuotationStatus, Project } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { QuotationStatusBadge } from '@/components/ui/QuotationStatusBadge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  ArrowLeft, Edit2, Send, CheckCircle, XCircle,
  RefreshCw, Zap, FileText, Printer,
} from 'lucide-react';

type FullQuotation = Quotation & {
  client: { name: string; company_name: string | null; email: string | null; address: string | null } | null;
  quotation_items: QuotationItem[];
};

type Toast = { msg: string; ok: boolean };

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const { can } = useCurrentUser();

  const [quotation,        setQuotation]        = useState<FullQuotation | null>(null);
  const [projects,         setProjects]         = useState<Project[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [actionBusy,       setActionBusy]       = useState(false);
  const [converting,       setConverting]       = useState(false);
  const [toast,            setToast]            = useState<Toast | null>(null);
  const [selectedProject,  setSelectedProject]  = useState('');

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    if (companyLoading) return;
    if (!id || id === 'new') return;
    if (!activeCompanyId) {
      setQuotation(null); setProjects([]); setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('quotations')
      .select('*, client:clients(name, company_name, email, address), quotation_items(*)')
      .eq('id', id)
      .eq('company_id', activeCompanyId)
      .order('sort_order', { referencedTable: 'quotation_items', ascending: true })
      .single();

    if (err || !data) {
      setError('Failed to load quotation.');
      setLoading(false);
      return;
    }
    setQuotation(data as FullQuotation);
    setLoading(false);
  }, [activeCompanyId, companyLoading, id, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setQuotation(null); setProjects([]); setSelectedProject('');
      return load();
    });
  }, [load]);

  useEffect(() => {
    if (!quotation?.company_id) return;
    supabase
      .from('projects')
      .select('id, project_name, project_code, status')
      .eq('company_id', quotation.company_id)
      .eq('status', 'active')
      .order('project_name')
      .then(({ data }) => setProjects((data || []) as Project[]));
  }, [quotation?.company_id, supabase]);

  // ── Status change via API ─────────────────────────────────────────────────────
  async function changeStatus(newStatus: QuotationStatus) {
    if (!quotation) return;
    setActionBusy(true);

    const res = await fetch(`/api/quotations/${quotation.id}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: quotation.company_id, status: newStatus }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };

    if (res.ok && data.ok) {
      setQuotation(q => q ? { ...q, status: newStatus } : q);
      showToast(`Status updated to ${newStatus}.`, true);
    } else {
      showToast(data.error ?? 'Action failed.', false);
    }
    setActionBusy(false);
  }

  // ── Convert to Tasks via API ──────────────────────────────────────────────────
  async function handleConvert() {
    if (!quotation || !selectedProject) {
      showToast('Please select a project first.', false);
      return;
    }
    setConverting(true);

    const res = await fetch(`/api/quotations/${quotation.id}/convert`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: quotation.company_id, project_id: selectedProject }),
    });
    const data = await res.json() as { ok?: boolean; tasks_created?: number; error?: string };

    if (res.ok && data.ok) {
      setQuotation(q => q ? { ...q, status: 'converted' } : q);
      showToast(`${data.tasks_created} task${(data.tasks_created ?? 0) !== 1 ? 's' : ''} created successfully.`, true);
    } else {
      showToast(data.error ?? 'Conversion failed.', false);
    }
    setConverting(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading)         return <LoadingSpinner label="Loading quotation…" />;
  if (error || !quotation) return <ErrorState message={error ?? 'Quotation not found.'} retry={load} />;

  const items      = quotation.quotation_items ?? [];
  const canEdit    = quotation.status === 'draft';
  const canSend    = quotation.status === 'draft';
  const canApprove = quotation.status === 'sent' && can('approve_quotation');
  const canReject  = quotation.status === 'sent' || quotation.status === 'approved';
  const canConvert = quotation.status === 'approved';
  const canReopen  = quotation.status === 'rejected' || quotation.status === 'expired';

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="h-4 w-4" /> Back to Quotations
      </button>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-slate-900 font-mono">{quotation.quotation_number}</h1>
              <QuotationStatusBadge status={quotation.status} />
            </div>
            {quotation.project_name && <p className="text-sm text-slate-500">{quotation.project_name}</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/pdf/quotation/${quotation.id}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <FileText className="h-4 w-4" /> View PDF
            </a>
            <a
              href={`/api/pdf/quotation/${quotation.id}?print=1`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            >
              <Printer className="h-4 w-4" /> Print / Download
            </a>

            {canEdit && (
              <Link
                href={`/quotations/${quotation.id}/edit`}
                className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Edit2 className="h-4 w-4" /> Edit
              </Link>
            )}
            {canSend && (
              <button
                onClick={() => changeStatus('sent')}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Mark as Sent
              </button>
            )}
            {canApprove && (
              <button
                onClick={() => changeStatus('approved')}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
            )}
            {canReject && (
              <button
                onClick={() => changeStatus('rejected')}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            )}
            {canReopen && (
              <button
                onClick={() => changeStatus('draft')}
                disabled={actionBusy}
                className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Reopen
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-4 text-sm">
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Client</p>
            <p className="font-semibold text-slate-800">{quotation.client?.name ?? '—'}</p>
            {quotation.client?.company_name && <p className="text-xs text-slate-400">{quotation.client.company_name}</p>}
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Currency</p>
            <p className="font-mono font-semibold text-slate-800">{quotation.currency}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Issue Date</p>
            <p className="text-slate-700">{formatDate(quotation.issue_date)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase mb-1">Valid Until</p>
            <p className="text-slate-700">{formatDate(quotation.valid_until)}</p>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-5">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase">Item</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase hidden md:table-cell">Description</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Unit Price</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No items</td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-900">{item.item_name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{item.description || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.unit_price, quotation.currency)}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.line_total, quotation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-xs ml-auto space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(quotation.subtotal, quotation.currency)}</span></div>
            {quotation.discount > 0 && (
              <div className="flex justify-between text-slate-600"><span>Discount</span><span className="text-red-500">− {formatCurrency(quotation.discount, quotation.currency)}</span></div>
            )}
            {quotation.tax > 0 && (
              <div className="flex justify-between text-slate-600"><span>Tax</span><span>{formatCurrency(quotation.tax, quotation.currency)}</span></div>
            )}
            <div className="flex justify-between text-slate-900 font-bold text-base border-t border-slate-200 pt-2 mt-2">
              <span>Total</span>
              <span>{formatCurrency(quotation.total_amount, quotation.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quotation.notes && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-slate-600 whitespace-pre-line">{quotation.notes}</p>
        </div>
      )}

      {/* Convert to Tasks */}
      {canConvert && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-green-900 mb-1">Convert to Project Tasks</h2>
                <p className="text-xs text-green-700 mb-4">Each line item will become a task. Select the project to attach the tasks to.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="flex-1 border border-green-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">— Select a project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name} ({p.project_code})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleConvert}
                    disabled={converting || !selectedProject}
                    className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {converting
                      ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Converting…</>
                      : <><Zap className="h-4 w-4" /> Convert to Tasks</>}
                  </button>
                </div>
                <p className="text-xs text-green-600 mt-3">{items.length} item{items.length !== 1 ? 's' : ''} will be created as tasks.</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-blue-900 mb-1">Convert to Invoice</h2>
                <p className="text-xs text-blue-700 mb-4">Generate a fresh client invoice directly pre-filled with this quotation&apos;s details and line items. You&apos;ll be able to review and adjust it before saving.</p>
                <Link
                  href={`/invoices/new?client=${quotation.client_id}&quotation=${quotation.id}`}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <FileText className="h-4 w-4" /> Convert to Invoice
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {quotation.status === 'converted' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          This quotation has been successfully converted.
        </div>
      )}
    </div>
  );
}
