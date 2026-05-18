'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Client, Project, Service } from '@/types';
import { formatCurrency, calculateLineTotal } from '@/lib/utils';
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

function genId() { return Math.random().toString(36).slice(2); }

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState({
    client_id: searchParams.get('client') || '',
    project_id: searchParams.get('project') || '',
    schedule_id: searchParams.get('schedule') || '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    currency: 'UGX',
    notes: '',
    footer_note: 'Thank you for your business. Payment details: Stanbic Bank | Sabtech Online | Acc: 9030016540799',
  });

  const [items, setItems] = useState<LineItem[]>([{
    id: genId(),
    service_id: '',
    item_name: '',
    description: '',
    quantity: 1,
    unit_price: searchParams.get('amount') ? parseFloat(searchParams.get('amount')!) : 0,
    discount_percent: 0,
    tax_percent: 0,
  }]);

  const [discountAmount, setDiscountAmount] = useState(0);

  // Generate next invoice number by querying the highest existing one for this year
  async function fetchNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data: latest } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `${prefix}%`)
      .order('invoice_number', { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (latest && latest.length > 0) {
      const parsed = parseInt(latest[0].invoice_number.replace(prefix, ''), 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  // Load data
  useEffect(() => {
    async function load() {
      const [{ data: cl }, { data: svc }, nextNum] = await Promise.all([
        supabase.from('clients').select('*').eq('is_archived', false).order('name'),
        supabase.from('services').select('*').eq('is_active', true).order('category').order('service_name'),
        fetchNextInvoiceNumber(),
      ]);
      setClients(cl || []);
      setServices(svc || []);
      setInvoiceNumber(nextNum);
    }
    load();
  }, []);

  // Load projects when client changes
  useEffect(() => {
    if (!header.client_id) { setProjects([]); return; }
    supabase
      .from('projects')
      .select('*')
      .eq('client_id', header.client_id)
      .eq('status', 'active')
      .order('project_name')
      .then(({ data }) => setProjects(data || []));
  }, [header.client_id]);

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
  const totalAmount = subtotal - discountAmount + taxTotal;

  async function handleSave(status: 'draft' | 'sent') {
    if (!header.client_id) { alert('Please select a client'); return; }
    if (items.length === 0 || items.every(i => !i.item_name.trim())) { alert('Add at least one line item'); return; }
    setSaving(true);

    // Always re-fetch the latest number at save time to avoid stale duplicates.
    // If a race condition still causes a duplicate key error, retry once with a
    // freshly generated number before surfacing the error to the user.
    const freshNumber = await fetchNextInvoiceNumber();
    setInvoiceNumber(freshNumber);

    async function attemptInsert(invNum: string) {
      return supabase.from('invoices').insert({
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
        balance_due: totalAmount,
        status,
        notes: header.notes || null,
        footer_note: header.footer_note || null,
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
      await supabase.from('invoice_schedules').update({ status: 'invoiced', generated_invoice_id: inv.id }).eq('id', header.schedule_id);
    }

    router.push(`/invoices/${inv.id}`);
  }

  const inputCls = 'border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full';

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
              <div className="flex justify-between">
                <span className="text-slate-500">Tax</span>
                <span className="font-medium">{formatCurrency(taxTotal, header.currency)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(totalAmount, header.currency)}</span>
              </div>
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
