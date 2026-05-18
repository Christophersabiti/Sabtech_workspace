'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { CompanySettings } from '@/types';
import { Save, CheckCircle, AlertCircle, Receipt, ToggleLeft, ToggleRight } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type InvoiceFormFields = Pick<CompanySettings,
  | 'invoice_prefix'
  | 'receipt_prefix'
  | 'quote_prefix'
  | 'default_due_days'
  | 'default_invoice_footer'
  | 'show_tin_on_invoice'
  | 'show_logo_on_invoice'
  | 'show_payment_history'
>;

const DEFAULTS: InvoiceFormFields = {
  invoice_prefix: 'INV',
  receipt_prefix: 'RCP',
  quote_prefix: 'QUO',
  default_due_days: 14,
  default_invoice_footer: 'Thank you for your business. Payment is due within the specified due date. Late payments may attract additional charges.',
  show_tin_on_invoice: true,
  show_logo_on_invoice: true,
  show_payment_history: true,
};

function Toggle({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
      <button type="button" onClick={onToggle} className="flex-shrink-0 ml-4">
        {on
          ? <ToggleRight className="h-8 w-8 text-purple-600" />
          : <ToggleLeft className="h-8 w-8 text-slate-300" />
        }
      </button>
    </div>
  );
}

export default function InvoiceSettingsPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [form, setForm] = useState<InvoiceFormFields>(DEFAULTS);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('company_settings')
        .select('invoice_prefix,receipt_prefix,quote_prefix,default_due_days,default_invoice_footer,show_tin_on_invoice,show_logo_on_invoice,show_payment_history')
        .eq('id', 1)
        .single();
      if (data) setForm({ ...DEFAULTS, ...data });
      setLoading(false);
    }
    load();
  }, []);

  function set<K extends keyof InvoiceFormFields>(k: K, v: InvoiceFormFields[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState('saving');
    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: 1, ...form, updated_at: new Date().toISOString() }, { onConflict: 'id' });

    if (error) {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;
  if (loading) return <div className="text-center py-12 text-slate-400">Loading…</div>;

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-8">
      {saveState === 'saved' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4" /> Invoice settings saved.
        </div>
      )}
      {saveState === 'error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" /> Failed to save.
        </div>
      )}

      {/* Numbering */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Receipt className="h-4 w-4 text-purple-500" /> Document Numbering
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Prefix</label>
            <input value={form.invoice_prefix} onChange={e => set('invoice_prefix', e.target.value)}
              maxLength={6}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <p className="text-xs text-slate-400 mt-1">e.g. <strong>{form.invoice_prefix}-2026-0001</strong></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Receipt Prefix</label>
            <input value={form.receipt_prefix} onChange={e => set('receipt_prefix', e.target.value)}
              maxLength={6}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <p className="text-xs text-slate-400 mt-1">e.g. <strong>{form.receipt_prefix}-2026-0001</strong></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quote Prefix</label>
            <input value={form.quote_prefix} onChange={e => set('quote_prefix', e.target.value)}
              maxLength={6}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <p className="text-xs text-slate-400 mt-1">e.g. <strong>{form.quote_prefix}-2026-0001</strong></p>
          </div>
        </div>
      </div>

      {/* Due Date */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Default Due Days</h2>
        <div className="flex items-center gap-4">
          <input
            type="number" min={0} max={365}
            value={form.default_due_days}
            onChange={e => set('default_due_days', parseInt(e.target.value) || 0)}
            className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-sm text-slate-600">days after invoice issue date</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">Set to 0 for due on receipt. Can be overridden per invoice.</p>
      </div>

      {/* Default Footer */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Default Invoice Footer Note</h2>
        <textarea
          rows={3}
          value={form.default_invoice_footer || ''}
          onChange={e => set('default_invoice_footer', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* PDF Display Toggles */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">PDF Display Options</h2>
        <Toggle
          on={form.show_logo_on_invoice}
          onToggle={() => set('show_logo_on_invoice', !form.show_logo_on_invoice)}
          label="Show Company Logo"
          desc="Display your logo in the PDF invoice header"
        />
        <Toggle
          on={form.show_tin_on_invoice}
          onToggle={() => set('show_tin_on_invoice', !form.show_tin_on_invoice)}
          label="Show TIN on Invoice"
          desc="Display your Tax Identification Number in the invoice header and footer"
        />
        <Toggle
          on={form.show_payment_history}
          onToggle={() => set('show_payment_history', !form.show_payment_history)}
          label="Show Payment History"
          desc="Include previous payment records in the generated PDF"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saveState === 'saving'}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving…' : 'Save Invoice Settings'}
        </button>
      </div>
    </form>
  );
}
