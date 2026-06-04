'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { Client, Project } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { ArrowLeft, Upload, Plus, Trash2, CheckCircle } from 'lucide-react';

type MigrateRow = {
  id: string;
  original_invoice_number: string;
  original_issue_date: string;
  original_due_date: string;
  client_id: string;
  project_id: string;
  currency: string;
  subtotal: string;
  vat_amount: string;
  discount_amount: string;
  wht_applied: boolean;
  wht_rate: string;
  wht_amount: string;
  gross_invoice_total: string;
  amount_paid: string;
  payment_date: string;
  payment_method: string;
  payment_reference: string;
  original_receipt_number: string;
  wht_certificate_number: string;
  migration_remarks: string;
  migration_source: string;
};

function genId() { return Math.random().toString(36).slice(2); }

function emptyRow(): MigrateRow {
  return {
    id: genId(),
    original_invoice_number: '',
    original_issue_date: '',
    original_due_date: '',
    client_id: '',
    project_id: '',
    currency: 'UGX',
    subtotal: '',
    vat_amount: '0',
    discount_amount: '0',
    wht_applied: false,
    wht_rate: '6',
    wht_amount: '',
    gross_invoice_total: '',
    amount_paid: '',
    payment_date: '',
    payment_method: 'bank_transfer',
    payment_reference: '',
    original_receipt_number: '',
    wht_certificate_number: '',
    migration_remarks: '',
    migration_source: 'manual_migration',
  };
}

const PAYMENT_METHODS = ['bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other'];
const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES'];

export default function MigrateInvoicesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Record<string, Project[]>>({});
  const [rows, setRows] = useState<MigrateRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    supabase
      .from('clients')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setClients(data || []));
  }, [activeCompanyId, supabase]);

  async function loadProjectsForClient(clientId: string) {
    if (!activeCompanyId || !clientId || projects[clientId]) return;
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('client_id', clientId)
      .order('project_name');
    setProjects(prev => ({ ...prev, [clientId]: data || [] }));
  }

  function updateRow(id: string, field: keyof MigrateRow, value: string | boolean) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'client_id') {
        updated.project_id = '';
        loadProjectsForClient(value as string);
      }
      // Auto-compute gross total from subtotal + vat - discount
      if (['subtotal', 'vat_amount', 'discount_amount'].includes(field)) {
        const sub  = parseFloat(field === 'subtotal' ? value as string : updated.subtotal) || 0;
        const vat  = parseFloat(field === 'vat_amount' ? value as string : updated.vat_amount) || 0;
        const disc = parseFloat(field === 'discount_amount' ? value as string : updated.discount_amount) || 0;
        updated.gross_invoice_total = String(sub + vat - disc);
      }
      return updated;
    }));
  }

  async function handleSave() {
    if (!activeCompanyId) return;
    const validRows = rows.filter(r => r.original_invoice_number.trim() && r.original_issue_date && r.client_id);
    if (validRows.length === 0) {
      setError('At least one row with an invoice number, issue date, and client is required.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();

    for (const r of validRows) {
      const subtotal     = parseFloat(r.subtotal)            || 0;
      const vatAmount    = parseFloat(r.vat_amount)          || 0;
      const discAmount   = parseFloat(r.discount_amount)     || 0;
      const grossTotal   = parseFloat(r.gross_invoice_total) || (subtotal + vatAmount - discAmount);
      const amountPaid   = parseFloat(r.amount_paid)         || 0;
      const whtRate      = r.wht_applied ? (parseFloat(r.wht_rate)   || 0) : 0;
      const whtAmt       = r.wht_applied ? (parseFloat(r.wht_amount) || 0) : 0;
      const netPayable   = r.wht_applied ? grossTotal - whtAmt : grossTotal;
      const balanceDue   = netPayable - amountPaid;

      // 1. Insert into main invoices table so it shows in UI and client summaries
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          company_id:                  activeCompanyId,
          invoice_number:              r.original_invoice_number.trim(),
          client_id:                   r.client_id,
          project_id:                  r.project_id || null,
          issue_date:                  r.original_issue_date,
          due_date:                    r.original_due_date || null,
          currency:                    r.currency,
          subtotal,
          discount_amount:             discAmount,
          tax_amount:                  vatAmount,
          total_amount:                grossTotal,
          total_paid:                  amountPaid,
          balance_due:                 balanceDue,
          status:                      'migrated',
          notes:                       r.migration_remarks || null,
          // WHT
          apply_wht:                   r.wht_applied,
          wht_rate:                    whtRate,
          wht_treatment:               'STANDARD_DEDUCTION',
          wht_taxable_base_type:       'SUBTOTAL_EXCL_VAT',
          wht_taxable_amount:          r.wht_applied ? subtotal : 0,
          wht_amount:                  whtAmt,
          net_payable_amount:          netPayable,
          ura_wht_remittance_status:   r.wht_applied ? 'PENDING' : 'NOT_APPLICABLE',
          ura_wht_certificate_number:  r.wht_certificate_number || null,
          // Migration provenance
          migrated_by:                 user?.id ?? null,
          migrated_at:                 now,
          migration_source:            r.migration_source || 'manual_migration',
        })
        .select('id')
        .single();

      if (invErr || !inv) {
        setError(`Row "${r.original_invoice_number}": ${invErr?.message ?? 'Failed to create invoice'}`);
        setSaving(false);
        return;
      }

      // 2. Insert a single line item so the invoice is complete
      await supabase.from('invoice_items').insert({
        company_id:      activeCompanyId,
        invoice_id:      inv.id,
        item_name:       `Historical Invoice — ${r.original_invoice_number.trim()}`,
        description:     r.migration_remarks || null,
        quantity:        1,
        unit_price:      subtotal,
        discount_percent: discAmount > 0 && subtotal > 0 ? (discAmount / subtotal) * 100 : 0,
        tax_percent:     subtotal > 0 ? (vatAmount / subtotal) * 100 : 0,
        line_total:      subtotal,
        sort_order:      0,
      });

      // 3. Insert payment record if amount was paid
      if (amountPaid > 0 && r.payment_date) {
        // Generate payment number
        const year   = new Date(r.payment_date).getFullYear();
        const prefix = `RCP-${year}-`;
        const { data: latest } = await supabase
          .from('payments')
          .select('payment_number')
          .eq('company_id', activeCompanyId)
          .like('payment_number', `${prefix}%`)
          .order('payment_number', { ascending: false })
          .limit(1);
        let nextNum = 1;
        if (latest && latest.length > 0) {
          const parsed = parseInt(latest[0].payment_number.replace(prefix, ''), 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        const paymentNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;

        await supabase.from('payments').insert({
          company_id:              activeCompanyId,
          payment_number:          r.original_receipt_number?.trim() || paymentNumber,
          invoice_id:              inv.id,
          payment_date:            r.payment_date,
          amount_paid:             amountPaid,
          actual_received:         amountPaid,
          wht_withheld:            whtAmt,
          payment_method:          r.payment_method || 'bank_transfer',
          reference_number:        r.payment_reference || null,
          wht_certificate_number:  r.wht_certificate_number || null,
          note:                    'Imported historical payment',
          is_confirmed:            true,
          status:                  'confirmed',
        });
      }

      // 4. Save audit record in migrated_invoices with link back to the invoice
      await supabase.from('migrated_invoices').insert({
        company_id:              activeCompanyId,
        original_invoice_number: r.original_invoice_number.trim(),
        mapped_invoice_id:       inv.id,
        original_issue_date:     r.original_issue_date,
        original_due_date:       r.original_due_date || null,
        client_id:               r.client_id || null,
        project_id:              r.project_id || null,
        currency:                r.currency,
        subtotal,
        vat_amount:              vatAmount,
        discount_amount:         discAmount,
        wht_applied:             r.wht_applied,
        wht_rate:                r.wht_applied ? whtRate : null,
        wht_amount:              r.wht_applied ? whtAmt : null,
        gross_invoice_total:     grossTotal,
        amount_paid:             amountPaid,
        payment_date:            r.payment_date || null,
        payment_method:          r.payment_method || null,
        payment_reference:       r.payment_reference || null,
        original_receipt_number: r.original_receipt_number || null,
        wht_certificate_number:  r.wht_certificate_number || null,
        migration_remarks:       r.migration_remarks || null,
        migration_source:        r.migration_source || 'manual_migration',
        migrated_by:             user?.id ?? null,
        status:                  'MIGRATED',
      });

      // 5. Link invoice back to its migration record
      await supabase
        .from('invoices')
        .update({ migrated_at: now })
        .eq('id', inv.id);
    }

    setSaved(true);
    setSaving(false);
  }

  const inputCls = 'border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500';

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <h2 className="text-xl font-bold text-slate-800">Migration Saved</h2>
        <p className="text-slate-500 text-sm">
          {rows.filter(r => r.original_invoice_number.trim() && r.client_id).length} invoice(s) imported and now visible in the Invoices list and client summaries.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { setRows([emptyRow()]); setSaved(false); }}
            className="border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm"
          >
            Add More
          </button>
          <button
            onClick={() => router.push('/invoices')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <PageHeader
          title="Import Historical Invoices"
          subtitle="Record old invoices with their original dates and numbers for audit trail"
        />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>Note:</strong> Each imported invoice will appear in the main Invoices list and client summaries,
        tagged <code className="bg-amber-100 px-1 rounded">Migrated</code>. The original invoice number and date
        are preserved for audit trail. Old dates are accepted without validation.
        <strong> Invoice Number, Issue Date, and Client are required per row.</strong>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: '1400px' }}>
          <thead>
            <tr className="bg-slate-50">
              {[
                'Invoice #*', 'Issue Date*', 'Due Date', 'Client', 'Project', 'Currency',
                'Subtotal', 'VAT', 'Discount', 'WHT?', 'WHT Rate%', 'WHT Amount',
                'Gross Total', 'Amount Paid', 'Pay Date', 'Pay Method', 'Pay Ref',
                'Old Receipt #', 'WHT Cert #', 'Remarks', '',
              ].map(h => (
                <th key={h} className="text-left px-2 py-2 text-xs font-medium text-slate-500 border-b border-slate-200 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-1 py-1.5 min-w-28">
                  <input type="text" value={row.original_invoice_number}
                    onChange={e => updateRow(row.id, 'original_invoice_number', e.target.value)}
                    placeholder="INV-2024-0001" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-28">
                  <input type="date" value={row.original_issue_date}
                    onChange={e => updateRow(row.id, 'original_issue_date', e.target.value)}
                    className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-28">
                  <input type="date" value={row.original_due_date}
                    onChange={e => updateRow(row.id, 'original_due_date', e.target.value)}
                    className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-36">
                  <select value={row.client_id}
                    onChange={e => updateRow(row.id, 'client_id', e.target.value)}
                    className={inputCls}>
                    <option value="">Select...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5 min-w-32">
                  <select value={row.project_id}
                    onChange={e => updateRow(row.id, 'project_id', e.target.value)}
                    className={inputCls}
                    disabled={!row.client_id}>
                    <option value="">None</option>
                    {(projects[row.client_id] || []).map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5 w-16">
                  <select value={row.currency}
                    onChange={e => updateRow(row.id, 'currency', e.target.value)}
                    className={inputCls}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="number" min="0" step="0.01" value={row.subtotal}
                    onChange={e => updateRow(row.id, 'subtotal', e.target.value)}
                    placeholder="0" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-20">
                  <input type="number" min="0" step="0.01" value={row.vat_amount}
                    onChange={e => updateRow(row.id, 'vat_amount', e.target.value)}
                    placeholder="0" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-20">
                  <input type="number" min="0" step="0.01" value={row.discount_amount}
                    onChange={e => updateRow(row.id, 'discount_amount', e.target.value)}
                    placeholder="0" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 w-12 text-center">
                  <input type="checkbox" checked={row.wht_applied}
                    onChange={e => updateRow(row.id, 'wht_applied', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300" />
                </td>
                <td className="px-1 py-1.5 w-16">
                  <input type="number" min="0" max="100" step="0.01"
                    value={row.wht_rate}
                    disabled={!row.wht_applied}
                    onChange={e => updateRow(row.id, 'wht_rate', e.target.value)}
                    placeholder="6" className={`${inputCls} disabled:opacity-40`} />
                </td>
                <td className="px-1 py-1.5 min-w-20">
                  <input type="number" min="0" step="0.01"
                    value={row.wht_amount}
                    disabled={!row.wht_applied}
                    onChange={e => updateRow(row.id, 'wht_amount', e.target.value)}
                    placeholder="0" className={`${inputCls} disabled:opacity-40`} />
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="number" min="0" step="0.01" value={row.gross_invoice_total}
                    onChange={e => updateRow(row.id, 'gross_invoice_total', e.target.value)}
                    placeholder="Auto" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="number" min="0" step="0.01" value={row.amount_paid}
                    onChange={e => updateRow(row.id, 'amount_paid', e.target.value)}
                    placeholder="0" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-28">
                  <input type="date" value={row.payment_date}
                    onChange={e => updateRow(row.id, 'payment_date', e.target.value)}
                    className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-28">
                  <select value={row.payment_method}
                    onChange={e => updateRow(row.id, 'payment_method', e.target.value)}
                    className={inputCls}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="text" value={row.payment_reference}
                    onChange={e => updateRow(row.id, 'payment_reference', e.target.value)}
                    placeholder="Ref #" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="text" value={row.original_receipt_number}
                    onChange={e => updateRow(row.id, 'original_receipt_number', e.target.value)}
                    placeholder="RCP-..." className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-24">
                  <input type="text" value={row.wht_certificate_number}
                    onChange={e => updateRow(row.id, 'wht_certificate_number', e.target.value)}
                    placeholder="Cert #" className={inputCls} />
                </td>
                <td className="px-1 py-1.5 min-w-32">
                  <input type="text" value={row.migration_remarks}
                    onChange={e => updateRow(row.id, 'migration_remarks', e.target.value)}
                    placeholder="Remarks..." className={inputCls} />
                </td>
                <td className="px-1 py-1.5 w-8">
                  {rows.length > 1 && (
                    <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      className="text-slate-300 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setRows(prev => [...prev, emptyRow()])}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            <Plus className="h-4 w-4" /> Add Row
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{rows.filter(r => r.original_invoice_number.trim()).length} row(s) ready</span>
            <button
              onClick={handleSave}
              disabled={saving || companyLoading}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Migration'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview of totals */}
      {rows.some(r => r.gross_invoice_total) && (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total Gross</p>
            <p className="font-bold text-slate-900">
              {formatCurrency(rows.reduce((s, r) => s + (parseFloat(r.gross_invoice_total) || 0), 0))}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total Paid</p>
            <p className="font-bold text-green-700">
              {formatCurrency(rows.reduce((s, r) => s + (parseFloat(r.amount_paid) || 0), 0))}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Total WHT</p>
            <p className="font-bold text-amber-700">
              {formatCurrency(rows.reduce((s, r) => s + (r.wht_applied ? (parseFloat(r.wht_amount) || 0) : 0), 0))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
