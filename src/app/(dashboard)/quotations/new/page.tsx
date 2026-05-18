'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Client } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, Plus, Trash2, Save, Send } from 'lucide-react';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];

type LineItem = {
  id: string; // temp key for React
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

function emptyItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    item_name: '',
    description: '',
    quantity: 1,
    unit_price: 0,
    line_total: 0,
  };
}

async function fetchNextQuotationNumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `QUO-${year}-`;
  const { data } = await supabase
    .from('quotations')
    .select('quotation_number')
    .like('quotation_number', `${prefix}%`)
    .order('quotation_number', { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const parsed = parseInt(data[0].quotation_number.replace(prefix, ''), 10);
    if (!isNaN(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export default function NewQuotationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [clients, setClients]       = useState<Client[]>([]);
  const [saving, setSaving]         = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');

  // Header fields
  const today = new Date().toISOString().slice(0, 10);
  const inThirty = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [header, setHeader] = useState({
    client_id:    searchParams.get('client') ?? '',
    project_name: '',
    issue_date:   today,
    valid_until:  inThirty,
    currency:     'UGX',
    notes:        '',
    discount:     0,
    tax_percent:  0,   // percent e.g. 18 means 18%
  });

  // Line items
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);

  // Load clients
  useEffect(() => {
    supabase.from('clients').select('id, name, currency, status').eq('status', 'active').order('name')
      .then(({ data }) => setClients((data || []) as Client[]));
  }, []);

  // Auto-set currency when client changes
  useEffect(() => {
    if (!header.client_id) return;
    const c = clients.find(cl => cl.id === header.client_id);
    if (c) setHeader(h => ({ ...h, currency: c.currency }));
  }, [header.client_id, clients]);

  const patchHeader = <K extends keyof typeof header>(k: K, v: (typeof header)[K]) =>
    setHeader(h => ({ ...h, [k]: v }));

  // Line item helpers
  function patchItem(id: string, field: keyof LineItem, raw: string | number) {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, [field]: raw };
      updated.line_total = updated.quantity * updated.unit_price;
      return updated;
    }));
  }

  function addItem() { setItems(p => [...p, emptyItem()]); }
  function removeItem(id: string) { setItems(p => p.filter(it => it.id !== id)); }

  // Totals
  const subtotal = items.reduce((s, it) => s + it.line_total, 0);
  const taxAmount = subtotal * (header.tax_percent / 100);
  const total = subtotal - header.discount + taxAmount;

  // Save
  const handleSave = useCallback(async (status: 'draft' | 'sent') => {
    if (!header.client_id) { setErrorMsg('Please select a client.'); return; }
    if (items.every(it => !it.item_name.trim())) { setErrorMsg('Add at least one item.'); return; }
    setErrorMsg('');
    setSaving(true);

    const quotationNumber = await fetchNextQuotationNumber(supabase);

    const { data: quot, error: qErr } = await supabase
      .from('quotations')
      .insert({
        quotation_number: quotationNumber,
        client_id:    header.client_id || null,
        project_name: header.project_name,
        issue_date:   header.issue_date,
        valid_until:  header.valid_until,
        currency:     header.currency,
        notes:        header.notes || null,
        status,
        subtotal,
        discount: header.discount,
        tax:      taxAmount,
        total_amount: total,
      })
      .select('id')
      .single();

    if (qErr || !quot) {
      setErrorMsg(qErr?.message ?? 'Failed to save quotation.');
      setSaving(false);
      return;
    }

    const validItems = items
      .filter(it => it.item_name.trim())
      .map((it, i) => ({
        quotation_id: quot.id,
        item_name:    it.item_name.trim(),
        description:  it.description.trim() || null,
        quantity:     it.quantity,
        unit_price:   it.unit_price,
        line_total:   it.line_total,
        sort_order:   i,
      }));

    if (validItems.length > 0) {
      const { error: iErr } = await supabase.from('quotation_items').insert(validItems);
      if (iErr) {
        setErrorMsg(iErr.message);
        setSaving(false);
        return;
      }
    }

    router.push(`/quotations/${quot.id}`);
  }, [header, items, subtotal, taxAmount, total, supabase, router]);

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-5xl">
      {/* Back */}
      <Link href="/quotations" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowLeft className="h-4 w-4" /> Back to Quotations
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">New Quotation</h1>
      <p className="text-sm text-slate-500 mb-6">Fill in the details and add line items.</p>

      {errorMsg && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      )}

      {/* Header fields */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Quotation Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client <span className="text-red-500">*</span></label>
            <select value={header.client_id} onChange={e => patchHeader('client_id', e.target.value)} className={inputCls}>
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` (${c.company_name})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project / Scope Name</label>
            <input
              type="text"
              value={header.project_name}
              onChange={e => patchHeader('project_name', e.target.value)}
              placeholder="e.g. Website Redesign Phase 1"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issue Date</label>
            <input type="date" value={header.issue_date} onChange={e => patchHeader('issue_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
            <input type="date" value={header.valid_until} onChange={e => patchHeader('valid_until', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
            <select value={header.currency} onChange={e => patchHeader('currency', e.target.value)} className={inputCls}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={header.notes}
              onChange={e => patchHeader('notes', e.target.value)}
              placeholder="Scope of work, terms, or any relevant notes…"
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Line Items</h2>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 uppercase border-b border-slate-100">
                <th className="pb-2 pr-3 w-[28%]">Item Name</th>
                <th className="pb-2 pr-3 w-[30%]">Description</th>
                <th className="pb-2 pr-3 w-[10%] text-right">Qty</th>
                <th className="pb-2 pr-3 w-[15%] text-right">Unit Price</th>
                <th className="pb-2 pr-3 w-[12%] text-right">Total</th>
                <th className="pb-2 w-[5%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={item.item_name}
                      onChange={e => patchItem(item.id, 'item_name', e.target.value)}
                      placeholder={`Item ${idx + 1}`}
                      className={inputCls}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => patchItem(item.id, 'description', e.target.value)}
                      placeholder="Optional description"
                      className={inputCls}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.quantity}
                      onChange={e => patchItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      className={`${inputCls} text-right`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => patchItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className={`${inputCls} text-right`}
                    />
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold text-slate-700">
                    {formatCurrency(item.line_total, header.currency)}
                  </td>
                  <td className="py-2 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile item cards */}
        <div className="md:hidden space-y-3 mb-3">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Item {idx + 1}</span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <input type="text" value={item.item_name} onChange={e => patchItem(item.id, 'item_name', e.target.value)} placeholder="Item name" className={inputCls} />
              <input type="text" value={item.description} onChange={e => patchItem(item.id, 'description', e.target.value)} placeholder="Description (optional)" className={inputCls} />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Qty</p>
                  <input type="number" min={0} value={item.quantity} onChange={e => patchItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Unit Price</p>
                  <input type="number" min={0} value={item.unit_price} onChange={e => patchItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Total</p>
                  <p className="font-semibold text-slate-700 py-2">{formatCurrency(item.line_total, header.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus className="h-4 w-4" /> Add Line Item
        </button>
      </div>

      {/* Totals */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Totals</h2>
        <div className="max-w-sm ml-auto space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal, header.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Discount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={header.discount}
              onChange={e => patchHeader('discount', parseFloat(e.target.value) || 0)}
              className="w-32 border border-slate-200 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Tax (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={header.tax_percent}
              onChange={e => patchHeader('tax_percent', parseFloat(e.target.value) || 0)}
              className="w-32 border border-slate-200 rounded-lg px-3 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {header.tax_percent > 0 && (
            <div className="flex justify-between text-slate-500 text-xs">
              <span>Tax amount</span>
              <span>{formatCurrency(taxAmount, header.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-900 font-bold text-base border-t border-slate-200 pt-2 mt-2">
            <span>Total</span>
            <span>{formatCurrency(total, header.currency)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleSave('draft')}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save as Draft'}
        </button>
        <button
          type="button"
          onClick={() => handleSave('sent')}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save & Mark as Sent'}
        </button>
      </div>
    </div>
  );
}
