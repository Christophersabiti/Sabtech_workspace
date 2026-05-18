'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { PaymentMethodDB, PaymentMethodType } from '@/types';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, GripVertical,
  CheckCircle, AlertCircle, X, Smartphone, Building2,
  Banknote, CreditCard, Globe, MoreHorizontal,
} from 'lucide-react';

const METHOD_TYPES: { value: PaymentMethodType; label: string }[] = [
  { value: 'mobile_money',   label: 'Mobile Money' },
  { value: 'momo_merchant',  label: 'MOMO Merchant' },
  { value: 'bank_transfer',  label: 'Bank Transfer' },
  { value: 'wire_transfer',  label: 'Wire Transfer' },
  { value: 'cash',           label: 'Cash' },
  { value: 'card',           label: 'Card Payment' },
  { value: 'cheque',         label: 'Cheque' },
  { value: 'other',          label: 'Other' },
];

const METHOD_ICONS: Record<PaymentMethodType, React.ElementType> = {
  mobile_money:  Smartphone,
  momo_merchant: Smartphone,
  bank_transfer: Building2,
  wire_transfer: Globe,
  cash:          Banknote,
  card:          CreditCard,
  cheque:        MoreHorizontal,
  other:         MoreHorizontal,
};

const METHOD_COLORS: Record<PaymentMethodType, string> = {
  mobile_money:  'bg-yellow-100 text-yellow-700',
  momo_merchant: 'bg-yellow-100 text-yellow-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  wire_transfer: 'bg-indigo-100 text-indigo-700',
  cash:          'bg-green-100 text-green-700',
  card:          'bg-purple-100 text-purple-700',
  cheque:        'bg-slate-100 text-slate-600',
  other:         'bg-slate-100 text-slate-600',
};

const EMPTY_FORM: Omit<PaymentMethodDB, 'id' | 'created_at' | 'updated_at'> = {
  method_type: 'mobile_money',
  display_name: '',
  account_name: '',
  account_number: '',
  phone_number: '',
  merchant_code: '',
  bank_name: '',
  branch: '',
  swift_code: '',
  currency: 'UGX',
  instructions: '',
  is_active: true,
  show_on_invoice: true,
  display_order: 0,
};

export default function PaymentMethodsPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [methods, setMethods] = useState<PaymentMethodDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PaymentMethodDB | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payment_methods')
      .select('*')
      .order('display_order');
    setMethods((data || []) as PaymentMethodDB[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: methods.length + 1 });
    setShowModal(true);
  }

  function openEdit(m: PaymentMethodDB) {
    setEditing(m);
    setForm({
      method_type: m.method_type,
      display_name: m.display_name,
      account_name: m.account_name || '',
      account_number: m.account_number || '',
      phone_number: m.phone_number || '',
      merchant_code: m.merchant_code || '',
      bank_name: m.bank_name || '',
      branch: m.branch || '',
      swift_code: m.swift_code || '',
      currency: m.currency,
      instructions: m.instructions || '',
      is_active: m.is_active,
      show_on_invoice: m.show_on_invoice,
      display_order: m.display_order,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name.trim()) return;
    setSaving(true);

    const payload = {
      ...form,
      account_name:   form.account_name   || null,
      account_number: form.account_number || null,
      phone_number:   form.phone_number   || null,
      merchant_code:  form.merchant_code  || null,
      bank_name:      form.bank_name      || null,
      branch:         form.branch         || null,
      swift_code:     form.swift_code     || null,
      instructions:   form.instructions   || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = editing
      ? await supabase.from('payment_methods').update(payload).eq('id', editing.id)
      : await supabase.from('payment_methods').insert(payload);

    if (error) {
      showToast('error', error.message);
    } else {
      showToast('success', editing ? 'Payment method updated.' : 'Payment method added.');
      setShowModal(false);
      load();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this payment method?')) return;
    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) showToast('error', error.message);
    else { showToast('success', 'Deleted.'); load(); }
  }

  async function toggleField(id: string, field: 'is_active' | 'show_on_invoice', current: boolean) {
    await supabase.from('payment_methods').update({ [field]: !current, updated_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  const f = form;
  const setF = (k: keyof typeof EMPTY_FORM, v: string | boolean | number) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const showPhone   = ['mobile_money', 'momo_merchant'].includes(f.method_type);
  const showMerchant = f.method_type === 'momo_merchant';
  const showBank    = ['bank_transfer', 'wire_transfer'].includes(f.method_type);
  const showSwift   = f.method_type === 'wire_transfer';

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;

  return (
    <div className="max-w-4xl">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">
            {methods.length} payment method{methods.length !== 1 ? 's' : ''} configured ·{' '}
            {methods.filter(m => m.show_on_invoice).length} shown on invoices
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Payment Method
        </button>
      </div>

      {/* Methods List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading…</div>
      ) : methods.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <Banknote className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No payment methods yet</p>
          <p className="text-slate-400 text-sm mt-1">Add your first payment method to display it on invoices.</p>
          <button onClick={openAdd} className="mt-4 inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            <Plus className="h-4 w-4" /> Add Payment Method
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map(m => {
            const Icon = METHOD_ICONS[m.method_type];
            const colorClass = METHOD_COLORS[m.method_type];
            return (
              <div key={m.id} className={`bg-white border rounded-xl p-5 flex items-center gap-4 transition-opacity ${!m.is_active ? 'opacity-60' : ''}`}>
                {/* Drag handle placeholder */}
                <GripVertical className="h-5 w-5 text-slate-300 flex-shrink-0 cursor-grab" />

                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{m.display_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                      {METHOD_TYPES.find(t => t.value === m.method_type)?.label}
                    </span>
                    {!m.is_active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>}
                    {m.show_on_invoice && m.is_active && <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">On Invoice</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {m.account_name && <span className="text-xs text-slate-500">A/c: <strong className="text-slate-700">{m.account_name}</strong></span>}
                    {m.account_number && <span className="text-xs text-slate-500">No: <strong className="font-mono text-slate-700">{m.account_number}</strong></span>}
                    {m.phone_number && <span className="text-xs text-slate-500">Phone: <strong className="font-mono text-slate-700">{m.phone_number}</strong></span>}
                    {m.merchant_code && <span className="text-xs text-slate-500">Merchant: <strong className="font-mono text-slate-700">{m.merchant_code}</strong></span>}
                    {m.bank_name && <span className="text-xs text-slate-500">Bank: <strong className="text-slate-700">{m.bank_name}{m.branch ? ` · ${m.branch}` : ''}</strong></span>}
                  </div>
                </div>

                {/* Toggle Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    title={m.is_active ? 'Deactivate' : 'Activate'}
                    onClick={() => toggleField(m.id, 'is_active', m.is_active)}
                    className={`p-1.5 rounded-lg transition-colors text-xs font-medium ${m.is_active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'}`}
                  >
                    {m.is_active ? <CheckCircle className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                  <button
                    title={m.show_on_invoice ? 'Hide from invoice' : 'Show on invoice'}
                    onClick={() => toggleField(m.id, 'show_on_invoice', m.show_on_invoice)}
                    className={`p-1.5 rounded-lg transition-colors ${m.show_on_invoice ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-100'}`}
                  >
                    {m.show_on_invoice ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => openEdit(m)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        ✓ = Active &nbsp;·&nbsp; 👁 = Shown on invoices &nbsp;·&nbsp; Methods marked active and &quot;show on invoice&quot; appear in the PDF payment instructions block.
      </p>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit Payment Method' : 'Add Payment Method'}
              </h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Type + Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Method Type *</label>
                  <select
                    required
                    value={f.method_type}
                    onChange={e => setF('method_type', e.target.value as PaymentMethodType)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {METHOD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Display Name *</label>
                  <input
                    required
                    value={f.display_name}
                    onChange={e => setF('display_name', e.target.value)}
                    placeholder="e.g. MTN Mobile Money"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Account / Recipient Name</label>
                <input value={f.account_name ?? ''} onChange={e => setF('account_name', e.target.value)}
                  placeholder="e.g. Christopher Sabiti"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              {/* Mobile Money Fields */}
              {showPhone && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                  <input value={f.phone_number ?? ''} onChange={e => setF('phone_number', e.target.value)}
                    placeholder="e.g. 0777293933"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}

              {/* MOMO Merchant Code */}
              {showMerchant && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Merchant Code</label>
                  <input value={f.merchant_code ?? ''} onChange={e => setF('merchant_code', e.target.value)}
                    placeholder="e.g. 876997"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}

              {/* Bank Fields */}
              {showBank && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                      <input value={f.account_number ?? ''} onChange={e => setF('account_number', e.target.value)}
                        placeholder="e.g. 3200051550"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                      <input value={f.bank_name ?? ''} onChange={e => setF('bank_name', e.target.value)}
                        placeholder="e.g. Centenary Bank"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                    <input value={f.branch ?? ''} onChange={e => setF('branch', e.target.value)}
                      placeholder="e.g. Kasese"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </div>
              )}

              {/* Wire Transfer SWIFT */}
              {showSwift && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SWIFT / BIC Code</label>
                  <input value={f.swift_code ?? ''} onChange={e => setF('swift_code', e.target.value)}
                    placeholder="e.g. CENTUGKA"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <input value={f.currency} onChange={e => setF('currency', e.target.value)}
                  placeholder="UGX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom Instructions (optional)</label>
                <textarea rows={2} value={f.instructions ?? ''} onChange={e => setF('instructions', e.target.value)}
                  placeholder="Any special payment instructions…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              {/* Toggles */}
              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={f.is_active} onChange={e => setF('is_active', e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-600" />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={f.show_on_invoice} onChange={e => setF('show_on_invoice', e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-600" />
                  <span className="text-sm text-slate-700">Show on invoices</span>
                </label>
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Display Order</label>
                <input type="number" min={1} value={f.display_order} onChange={e => setF('display_order', parseInt(e.target.value))}
                  className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                <span className="text-xs text-slate-400 ml-2">Lower number = shown first</span>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Method'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
