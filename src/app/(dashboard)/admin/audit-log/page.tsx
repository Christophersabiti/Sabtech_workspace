'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
import { Shield, FileText, CreditCard, FileCheck } from 'lucide-react';

type AuditTab = 'invoices' | 'payments' | 'quotations' | 'clients';

type InvoiceAuditRow = {
  id: string;
  invoice_id: string;
  action: string;
  performed_by: string | null;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
  performed_at: string;
};

type PaymentAuditRow = {
  id: string;
  payment_id: string;
  action: string;
  performed_by: string | null;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
  amount: number | null;
  performed_at: string;
};

type QuotationAuditRow = {
  id: string;
  quotation_id: string;
  action: string;
  performed_by: string | null;
  old_status: string | null;
  new_status: string | null;
  performed_at: string;
};

type ClientAuditRow = {
  id: string;
  client_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
};

const ACTION_COLORS: Record<string, string> = {
  created:          'bg-green-100 text-green-700',
  sent:             'bg-blue-100 text-blue-700',
  payment_applied:  'bg-green-100 text-green-700',
  payment_reversed: 'bg-red-100 text-red-600',
  voided:           'bg-red-100 text-red-600',
  status_changed:   'bg-amber-100 text-amber-700',
  reversed:         'bg-red-100 text-red-600',
  confirmed:        'bg-green-100 text-green-700',
  converted:        'bg-purple-100 text-purple-700',
  updated:          'bg-slate-100 text-slate-600',
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const { checking } = useRequireRole(['super_admin', 'admin', 'finance']);
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  const [tab,     setTab]     = useState<AuditTab>('invoices');
  const [loading, setLoading] = useState(true);

  const [invoiceLogs,   setInvoiceLogs]   = useState<InvoiceAuditRow[]>([]);
  const [paymentLogs,   setPaymentLogs]   = useState<PaymentAuditRow[]>([]);
  const [quotationLogs, setQuotationLogs] = useState<QuotationAuditRow[]>([]);
  const [clientLogs,    setClientLogs]    = useState<ClientAuditRow[]>([]);

  const load = useCallback(async () => {
    if (companyLoading || !activeCompanyId) {
      if (!companyLoading) { setLoading(false); }
      return;
    }
    setLoading(true);

    const [
      { data: invLogs },
      { data: payLogs },
      { data: quotLogs },
      { data: cliLogs },
    ] = await Promise.all([
      supabase
        .from('invoice_audit_log')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('performed_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('payment_audit_log')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('performed_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('quotation_audit_log')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('performed_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('client_audit_log')
        .select('*')
        .eq('company_id', activeCompanyId)
        .order('changed_at', { ascending: false })
        .limit(PAGE_SIZE),
    ]);

    setInvoiceLogs((invLogs ?? []) as InvoiceAuditRow[]);
    setPaymentLogs((payLogs ?? []) as PaymentAuditRow[]);
    setQuotationLogs((quotLogs ?? []) as QuotationAuditRow[]);
    setClientLogs((cliLogs ?? []) as ClientAuditRow[]);
    setLoading(false);
  }, [activeCompanyId, companyLoading, supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (checking) return null;

  const TABS: { id: AuditTab; label: string; count: number; icon: React.ElementType }[] = [
    { id: 'invoices',   label: 'Invoices',   count: invoiceLogs.length,   icon: FileText },
    { id: 'payments',   label: 'Payments',   count: paymentLogs.length,   icon: CreditCard },
    { id: 'quotations', label: 'Quotations', count: quotationLogs.length,  icon: FileCheck },
    { id: 'clients',    label: 'Clients',    count: clientLogs.length,    icon: Shield },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Track all actions performed across invoices, payments, quotations, and clients."
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white shadow text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count > 0 && (
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-xs font-semibold">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <LoadingSpinner label="Loading audit log…" />
        ) : (
          <>
            {tab === 'invoices' && (
              invoiceLogs.length === 0 ? (
                <EmptyState icon={FileText} title="No invoice audit entries" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Invoice', 'Action', 'Status Change', 'Reason', 'Performed By', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoiceLogs.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.invoice_id.slice(0, 8)}…</td>
                          <td className="px-4 py-3"><ActionBadge action={row.action} /></td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.old_status && row.new_status
                              ? <>{row.old_status} → <span className="font-medium text-slate-700">{row.new_status}</span></>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{row.reason || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{row.performed_by?.slice(0, 8) ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.performed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'payments' && (
              paymentLogs.length === 0 ? (
                <EmptyState icon={CreditCard} title="No payment audit entries" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Payment', 'Action', 'Amount', 'Status Change', 'Reason', 'Performed By', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paymentLogs.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.payment_id.slice(0, 8)}…</td>
                          <td className="px-4 py-3"><ActionBadge action={row.action} /></td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                            {row.amount != null ? row.amount.toLocaleString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.old_status && row.new_status
                              ? <>{row.old_status} → <span className="font-medium text-slate-700">{row.new_status}</span></>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{row.reason || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{row.performed_by?.slice(0, 8) ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.performed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'quotations' && (
              quotationLogs.length === 0 ? (
                <EmptyState icon={FileCheck} title="No quotation audit entries" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Quotation', 'Action', 'Status Change', 'Performed By', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotationLogs.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.quotation_id.slice(0, 8)}…</td>
                          <td className="px-4 py-3"><ActionBadge action={row.action} /></td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.old_status && row.new_status
                              ? <>{row.old_status} → <span className="font-medium text-slate-700">{row.new_status}</span></>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{row.performed_by?.slice(0, 8) ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.performed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tab === 'clients' && (
              clientLogs.length === 0 ? (
                <EmptyState icon={Shield} title="No client audit entries" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Client', 'Field', 'Old Value', 'New Value', 'Changed By', 'Date'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {clientLogs.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.client_id.slice(0, 8)}…</td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">{row.field_name}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{row.old_value ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">{row.new_value ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{row.changed_by?.slice(0, 8) ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.changed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400 text-right">
              Showing last {PAGE_SIZE} entries per category
            </div>
          </>
        )}
      </div>
    </div>
  );
}
