'use client';

import { useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useEntitlements } from '@/hooks/useEntitlements';
import { FeatureBlockedState } from '@/components/billing/FeatureBlockedState';
import { Client, InvoiceSchedule, Project, Service, WhtTreatment, WhtTaxableBaseType } from '@/types';
import { formatCurrency, calculateLineTotal } from '@/lib/utils';
import { computeWHT, WHT_TREATMENT_LABELS, WHT_BASE_LABELS } from '@/lib/whtUtils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

type LineItem = {
  id: string;
  service_id: string;
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
};

type SchedulePrefill = InvoiceSchedule & {
  project?: {
    total_contract_amount: number | null;
    client_id: string;
    project_name: string;
  } | null;
};

function genId() { return Math.random().toString(36).slice(2); }

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const { loading: entitlementLoading, canUse } = useEntitlements();
  const scheduleIdFromQuery = searchParams.get('schedule') || '';
  const quotationIdFromQuery = searchParams.get('quotation') || '';
  const amountFromQuery = searchParams.get('amount');

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefilledScheduleId, setPrefilledScheduleId] = useState('');
  const [prefilledQuotationId, setPrefilledQuotationId] = useState('');

  const [header, setHeader] = useState({
    client_id: searchParams.get('client') || '',
    project_id: searchParams.get('project') || '',
    schedule_id: scheduleIdFromQuery,
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency: 'UGX',
    notes: '',
    footer_note: 'Thank you for your business. Payment details: Attached | Sabtech Online',
  });

  const [items, setItems] = useState<LineItem[]>([{
    id: genId(),
    service_id: '',
    item_name: '',
    description: '',
    quantity: 1,
    unit_price: amountFromQuery ? parseFloat(amountFromQuery) : 0,
    discount_percent: 0,
    tax_percent: 0,
  }]);

  const [discountAmount, setDiscountAmount] = useState(0);

  // WHT state
  const [whtSettings, setWhtSettings] = useState({
    apply_wht: false,
    wht_rate: 6,
    wht_treatment: 'STANDARD_DEDUCTION' as WhtTreatment,
    wht_taxable_base_type: 'SUBTOTAL_EXCL_VAT' as WhtTaxableBaseType,
    wht_manual_amount: 0,
  });

  // Generate next invoice number by querying the highest existing one for this year
  const fetchNextInvoiceNumber = useCallback(async (): Promise<string> => {
    if (!activeCompanyId) return '';
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data: latest } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('company_id', activeCompanyId)
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (latest && latest.length > 0) {
      const parsed = parseInt(latest[0].invoice_number.replace(prefix, ''), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }, [activeCompanyId, supabase]);

  // Load data
  useEffect(() => {
    async function load() {
      if (!activeCompanyId) return;

      const [{ data: cl }, { data: svc }, nextNum] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_archived', false)
          .order('name'),
        supabase
          .from('services')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .order('category')
          .order('service_name'),
        fetchNextInvoiceNumber(),
      ]);
      setClients(cl || []);
      setServices(svc || []);
      setInvoiceNumber(nextNum);
    }
    load();
  }, [activeCompanyId, fetchNextInvoiceNumber, supabase]);

  // Load projects when client changes
  useEffect(() => {
    if (!header.client_id) { setProjects([]); return; }
    if (!activeCompanyId) { setProjects([]); return; }
    supabase
      .from('projects')
      .select('*')
      .eq('company_id', activeCompanyId)
      .eq('client_id', header.client_id)
      .eq('status', 'active')
      .order('project_name')
      .then(({ data }) => setProjects(data || []));
  }, [activeCompanyId, header.client_id, supabase]);

  useEffect(() => {
    if (!activeCompanyId || !header.schedule_id || prefilledScheduleId === header.schedule_id) return;

    async function loadSchedulePrefill() {
      const { data } = await supabase
        .from('invoice_schedules')
        .select('*, project:projects(total_contract_amount, client_id, project_name)')
        .eq('id', header.schedule_id)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      const schedule = data as SchedulePrefill | null;
      if (!schedule) {
        setPrefilledScheduleId(header.schedule_id);
        return;
      }

      const queryAmount = amountFromQuery ? Number(amountFromQuery) : NaN;
      const computedAmount = Number.isFinite(queryAmount)
        ? queryAmount
        : schedule.fixed_amount != null
          ? Number(schedule.fixed_amount)
          : schedule.project?.total_contract_amount != null && schedule.percentage != null
            ? Number(schedule.project.total_contract_amount) * Number(schedule.percentage) / 100
            : 0;

      setHeader(prev => ({
        ...prev,
        project_id: prev.project_id || schedule.project_id,
        due_date: prev.due_date || schedule.due_date || '',
      }));

      setItems(prev => prev.map((item, idx) => {
        if (idx !== 0) return item;
        return {
          ...item,
          item_name: item.item_name || schedule.schedule_name,
          description: item.description || schedule.description || '',
          unit_price: item.unit_price || computedAmount,
        };
      }));

      setPrefilledScheduleId(header.schedule_id);
    }

    void loadSchedulePrefill();
  }, [activeCompanyId, amountFromQuery, header.schedule_id, prefilledScheduleId, supabase]);

  useEffect(() => {
    if (!activeCompanyId || !quotationIdFromQuery || prefilledQuotationId === quotationIdFromQuery) return;

    async function loadQuotationPrefill() {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, quotation_items(*)')
        .eq('id', quotationIdFromQuery)
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (error || !data) {
        console.error('Error prefilling from quotation:', error);
        setPrefilledQuotationId(quotationIdFromQuery);
        return;
      }

      const quot = data;
      // Calculate tax percent if there's any tax
      let taxPercent = 0;
      if (quot.tax > 0 && quot.subtotal > 0) {
        taxPercent = Math.round((quot.tax / quot.subtotal) * 100 * 100) / 100;
      }

      setHeader(prev => ({
        ...prev,
        client_id: quot.client_id || prev.client_id,
        currency: quot.currency || prev.currency,
        notes: quot.notes || prev.notes,
      }));

      if (quot.discount > 0) {
        setDiscountAmount(quot.discount);
      }

      if (quot.quotation_items && quot.quotation_items.length > 0) {
        const mappedItems: LineItem[] = quot.quotation_items.map((item: any) => ({
          id: genId(),
          service_id: '',
          item_name: item.item_name,
          description: item.description || '',
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          discount_percent: 0,
          tax_percent: taxPercent,
        }));
        setItems(mappedItems);
      }

      setPrefilledQuotationId(quotationIdFromQuery);
    }

    void loadQuotationPrefill();
  }, [activeCompanyId, quotationIdFromQuery, prefilledQuotationId, supabase]);

  function addItem() {
    setItems(prev => [...prev, { id: genId(), service_id: '', item_name: '', description: '', quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 0 }]);
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      // Auto-fill from service
      if (field === 'service_id') {
        const svc = services.find(s => s.id === String(value));
        if (svc) {
          updated.item_name = svc.service_name;
          updated.unit_price = svc.default_price;
          updated.tax_percent = svc.tax_percent;
        }
      }
      return updated;
    }));
  }

  // Calculations
  const subtotal = items.reduce((s, item) => s + calculateLineTotal(item.quantity, item.unit_price, item.discount_percent), 0);
  const taxTotal = items.reduce((s, item) => {
    const lineNet = calculateLineTotal(item.quantity, item.unit_price, item.discount_percent);
    return s + lineNet * (item.tax_percent / 100);
  }, 0);
  const baseTotal = subtotal - discountAmount + taxTotal;

  const whtResult = whtSettings.apply_wht
    ? computeWHT({
        treatment: whtSettings.wht_treatment,
        rate: whtSettings.wht_rate,
        taxableBaseType: whtSettings.wht_taxable_base_type,
        subtotalExclVat: subtotal - discountAmount,
        totalInclVat: baseTotal,
        manualAmount: whtSettings.wht_manual_amount,
      })
    : null;

  // For GROSS_UP, invoice face value = grossed-up amount; for others, it's the base total
  const totalAmount = whtResult?.grossedUpAmount ?? baseTotal;

  async function handleSave(status: 'draft' | 'sent') {
    if (companyLoading) return;
    if (!activeCompanyId) { alert('Select a company workspace before creating an invoice'); return; }
    if (!header.client_id) { alert('Please select a client'); return; }
    if (items.length === 0 || items.every(i => !i.item_name.trim())) { alert('Add at least one line item'); return; }
    setSaving(true);

    // Always re-fetch the latest number at save time to avoid stale duplicates.
    // If a race condition still causes a duplicate key error, retry once with a
    // freshly generated number before surfacing the error to the user.
    const freshNumber = await fetchNextInvoiceNumber();
    setInvoiceNumber(freshNumber);

    async function attemptInsert(invNum: string) {
      const netPayable = whtResult ? whtResult.netPayable : totalAmount;
      return supabase.from('invoices').insert({
        company_id: activeCompanyId,
        invoice_number: invNum,
        client_id: header.client_id,
        project_id: header.project_id || null,
        schedule_id: header.schedule_id || null,
        issue_date: header.issue_date,
        due_date: header.due_date || null,
        currency: header.currency,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxTotal,
        total_amount: totalAmount,
        total_paid: 0,
        balance_due: netPayable,
        status,
        notes: header.notes || null,
        footer_note: header.footer_note || null,
        // WHT fields
        apply_wht: whtSettings.apply_wht,
        wht_rate: whtSettings.wht_rate,
        wht_treatment: whtSettings.wht_treatment,
        wht_taxable_base_type: whtSettings.wht_taxable_base_type,
        wht_taxable_amount: whtResult?.taxableBase ?? 0,
        wht_amount: whtResult?.whtAmount ?? 0,
        net_payable_amount: netPayable,
        grossed_up_amount: whtResult?.grossedUpAmount ?? null,
        ura_wht_remittance_status: whtSettings.apply_wht ? 'PENDING' : 'NOT_APPLICABLE',
      }).select().single();
    }

    let { data: inv, error: invErr } = await attemptInsert(freshNumber);

    // Auto-retry once on duplicate key constraint
    if (invErr?.code === '23505' && invErr.message.includes('invoice_number')) {
      const retryNumber = await fetchNextInvoiceNumber();
      setInvoiceNumber(retryNumber);
      ({ data: inv, error: invErr } = await attemptInsert(retryNumber));
    }

    if (invErr || !inv) {
      alert('Error creating invoice: ' + invErr?.message);
      setSaving(false);
      return;
    }

    const lineItems = items
      .filter(i => i.item_name.trim())
      .map((item, idx) => ({
        invoice_id: inv.id,
        company_id: activeCompanyId,
        service_id: item.service_id || null,
        item_name: item.item_name,
        description: item.description || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
        tax_percent: item.tax_percent,
        line_total: calculateLineTotal(item.quantity, item.unit_price, item.discount_percent),
        sort_order: idx,
      }));

    if (lineItems.length > 0) {
      const { error: itemErr } = await supabase.from('invoice_items').insert(lineItems);
      if (itemErr) {
        alert('Error saving items: ' + itemErr.message);
        setSaving(false);
        return;
      }
    }

    // Update schedule line if linked
    if (header.schedule_id) {
      await supabase
        .from('invoice_schedules')
        .update({ status: 'invoiced', generated_invoice_id: inv.id })
        .eq('id', header.schedule_id)
        .eq('company_id', activeCompanyId);
    }

    // Update quotation status if linked
    if (quotationIdFromQuery) {
      await supabase
        .from('quotations')
        .update({ status: 'converted' })
        .eq('id', quotationIdFromQuery)
        .eq('company_id', activeCompanyId);
    }

    router.push(`/invoices/${inv.id}`);
  }

  const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full';

  if (!entitlementLoading && !canUse('invoices.create')) {
    return (
      <FeatureBlockedState
        title="Invoice creation is paused"
        description="This company package or billing status does not currently allow new invoices. Existing invoices remain available."
      />
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <PageHeader title="New Invoice" subtitle={invoiceNumber} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main form */}
        <div className="col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Invoice Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Number</label>
                <input type="text" value={invoiceNumber} readOnly className={`${inputCls} bg-slate-50 font-mono`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select value={header.currency} onChange={e => setHeader(h => ({ ...h, currency: e.target.value }))} className={inputCls}>
                  {['UGX', 'USD', 'EUR', 'GBP', 'KES'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <select
                  required
                  value={header.client_id}
                  onChange={e => setHeader(h => ({ ...h, client_id: e.target.value, project_id: '' }))}
                  className={inputCls}
                >
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` — ${c.company_name}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                <select
                  value={header.project_id}
                  onChange={e => setHeader(h => ({ ...h, project_id: e.target.value }))}
                  className={inputCls}
                  disabled={!header.client_id}
                >
                  <option value="">No project / standalone</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
                <input type="date" value={header.issue_date} onChange={e => setHeader(h => ({ ...h, issue_date: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                <input type="date" value={header.due_date} onChange={e => setHeader(h => ({ ...h, due_date: e.target.value }))} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Line Items</h2>
              <button onClick={addItem} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                <Plus className="h-4 w-4" /> Add Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Service', 'Item Name', 'Qty', 'Unit Price', 'Disc %', 'Tax %', 'Total', ''].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map(item => {
                    const lineNet = calculateLineTotal(item.quantity, item.unit_price, item.discount_percent);
                    const lineTax = lineNet * (item.tax_percent / 100);
                    return (
                      <tr key={item.id}>
                        <td className="py-2 px-2 min-w-36">
                          <select
                            value={item.service_id}
                            onChange={e => updateItem(item.id, 'service_id', e.target.value)}
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Custom...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.service_name}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2 min-w-40">
                          <input
                            type="text"
                            value={item.item_name}
                            onChange={e => updateItem(item.id, 'item_name', e.target.value)}
                            placeholder="Item name"
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 w-16">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={e => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 w-28">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 w-16">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.discount_percent}
                            onChange={e => updateItem(item.id, 'discount_percent', parseFloat(e.target.value) || 0)}
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 w-16">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.tax_percent}
                            onChange={e => updateItem(item.id, 'tax_percent', parseFloat(e.target.value) || 0)}
                            className="border border-slate-200 rounded px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-2 px-2 w-28 text-right font-medium text-slate-700">
                          {formatCurrency(lineNet + lineTax, header.currency)}
                        </td>
                        <td className="py-2 px-2 w-8">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Withholding Tax */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Withholding Tax (WHT)</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-slate-600">Apply WHT</span>
                <div
                  role="checkbox"
                  aria-checked={whtSettings.apply_wht}
                  tabIndex={0}
                  onClick={() => setWhtSettings(s => ({ ...s, apply_wht: !s.apply_wht }))}
                  onKeyDown={e => e.key === ' ' && setWhtSettings(s => ({ ...s, apply_wht: !s.apply_wht }))}
                  className={`w-10 h-5 rounded-full cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${whtSettings.apply_wht ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full mt-0.5 shadow transition-transform ${whtSettings.apply_wht ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>

            {whtSettings.apply_wht && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WHT Rate (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={whtSettings.wht_rate}
                    onChange={e => setWhtSettings(s => ({ ...s, wht_rate: parseFloat(e.target.value) || 0 }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WHT Treatment</label>
                  <select
                    value={whtSettings.wht_treatment}
                    onChange={e => setWhtSettings(s => ({ ...s, wht_treatment: e.target.value as WhtTreatment }))}
                    className={inputCls}
                  >
                    {(Object.keys(WHT_TREATMENT_LABELS) as WhtTreatment[]).map(k => (
                      <option key={k} value={k}>{WHT_TREATMENT_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Taxable Base</label>
                  <select
                    value={whtSettings.wht_taxable_base_type}
                    onChange={e => setWhtSettings(s => ({ ...s, wht_taxable_base_type: e.target.value as WhtTaxableBaseType }))}
                    className={inputCls}
                  >
                    {(Object.keys(WHT_BASE_LABELS) as WhtTaxableBaseType[]).map(k => (
                      <option key={k} value={k}>{WHT_BASE_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                {whtSettings.wht_taxable_base_type === 'MANUAL' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Manual Taxable Amount</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={whtSettings.wht_manual_amount}
                      onChange={e => setWhtSettings(s => ({ ...s, wht_manual_amount: parseFloat(e.target.value) || 0 }))}
                      className={inputCls}
                    />
                  </div>
                )}
                {whtResult && (
                  <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Taxable Base</span>
                      <span>{formatCurrency(whtResult.taxableBase, header.currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>WHT @ {whtSettings.wht_rate}%</span>
                      <span className="text-red-600">- {formatCurrency(whtResult.whtAmount, header.currency)}</span>
                    </div>
                    {whtResult.grossedUpAmount && (
                      <div className="flex justify-between text-slate-600">
                        <span>Grossed-up Invoice Total</span>
                        <span className="font-semibold">{formatCurrency(whtResult.grossedUpAmount, header.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-slate-800 border-t border-amber-200 pt-1 mt-1">
                      <span>Net Payable to Supplier</span>
                      <span className="text-green-700">{formatCurrency(whtResult.netPayable, header.currency)}</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      WHT amount of {formatCurrency(whtResult.whtAmount, header.currency)} to be remitted to URA.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Notes & Footer</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Internal Notes</label>
              <textarea
                value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                rows={2}
                placeholder="Internal notes (not shown on PDF)"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Footer / Payment Instructions</label>
              <textarea
                value={header.footer_note}
                onChange={e => setHeader(h => ({ ...h, footer_note: e.target.value }))}
                rows={3}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Totals sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal, header.currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Discount (manual)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="border border-slate-200 rounded px-2 py-1 text-xs w-28 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {taxTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">VAT / Tax</span>
                  <span className="font-medium">{formatCurrency(taxTotal, header.currency)}</span>
                </div>
              )}
              {whtResult && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">WHT Rate</span>
                    <span className="font-medium">{whtSettings.wht_rate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">WHT Amount</span>
                    <span className="font-medium text-red-600">- {formatCurrency(whtResult.whtAmount, header.currency)}</span>
                  </div>
                  {whtResult.grossedUpAmount && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Invoice Total</span>
                      <span className="font-medium">{formatCurrency(whtResult.grossedUpAmount, header.currency)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="font-semibold text-slate-900">{whtResult ? 'Gross Invoice Total' : 'Total'}</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(totalAmount, header.currency)}</span>
              </div>
              {whtResult && (
                <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2">
                  <span className="font-semibold text-green-800">Net Payable to Supplier</span>
                  <span className="font-bold text-green-700">{formatCurrency(whtResult.netPayable, header.currency)}</span>
                </div>
              )}
              {whtResult && (
                <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span className="text-amber-700 font-medium">Remit to URA</span>
                  <span className="font-bold text-amber-700">{formatCurrency(whtResult.whtAmount, header.currency)}</span>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => handleSave('sent')}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save & Mark Sent'}
              </button>
              <button
                onClick={() => handleSave('draft')}
                disabled={saving}
                className="w-full border border-slate-200 text-slate-700 hover:bg-slate-50 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading...</div>}>
      <NewInvoiceForm />
    </Suspense>
  );
}
