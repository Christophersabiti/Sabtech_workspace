'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CompanySettings } from '@/types';
import { Building2, Save, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { useRequireRole } from '@/hooks/useCurrentUser';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];
const COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Ethiopia', 'South Africa', 'Nigeria', 'Ghana', 'Other'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function CompanySettingsPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState<Partial<CompanySettings>>({
    company_name: 'Sabtech Online',
    trading_name: '',
    email: 'info@sabtechonline.com',
    phone: '+256 777 293 933',
    website: 'www.sabtechonline.com',
    address: 'Kasese, Uganda',
    country: 'Uganda',
    currency: 'UGX',
    tin: '1009345230',
    registration_number: '',
    logo_url: null,
    default_invoice_footer: 'Thank you for your business. Payment is due within the specified due date.',
    show_tin_on_invoice: true,
    show_logo_on_invoice: true,
    show_payment_history: true,
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('company_settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (data) setForm(data as CompanySettings);
      setLoading(false);
    }
    load();
  }, []);

  function set(field: keyof CompanySettings, value: string | boolean | null) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Logo must be under 2MB'); return; }

    setLogoUploading(true);
    const ext = file.name.split('.').pop();
    const path = `logos/company-logo.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { upsert: true });

    if (upErr) {
      alert('Upload failed: ' + upErr.message);
      setLogoUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('company-assets')
      .getPublicUrl(path);

    set('logo_url', publicUrl);
    setLogoUploading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState('saving');

    const payload = {
      ...form,
      id: 1,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    } else {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;
  if (loading) return <div className="text-center py-12 text-slate-400">Loading settings…</div>;

  return (
    <form onSubmit={handleSave} className="max-w-3xl space-y-8">

      {/* Save status banner */}
      {saveState === 'saved' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4" /> Company profile saved successfully.
        </div>
      )}
      {saveState === 'error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" /> Failed to save. Please try again.
        </div>
      )}

      {/* Logo Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-purple-500" /> Company Logo
        </h2>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0">
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Company logo" className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-2xl font-black text-slate-300">SAB</span>
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 cursor-pointer bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Upload className="h-4 w-4" />
              {logoUploading ? 'Uploading…' : 'Upload Logo'}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
            </label>
            {form.logo_url && (
              <button type="button" onClick={() => set('logo_url', null)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <X className="h-3 w-3" /> Remove logo
              </button>
            )}
            <p className="text-xs text-slate-400">PNG, JPG, SVG or WebP · Max 2MB · Recommended 200×200px</p>
          </div>
        </div>
      </div>

      {/* Company Identity */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Company Identity</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
            <input required value={form.company_name || ''} onChange={e => set('company_name', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Trading Name</label>
            <input value={form.trading_name || ''} onChange={e => set('trading_name', e.target.value)}
              placeholder="Optional DBA name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">TIN</label>
            <input value={form.tin || ''} onChange={e => set('tin', e.target.value)}
              placeholder="1009345230"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Registration Number</label>
            <input value={form.registration_number || ''} onChange={e => set('registration_number', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input value={form.phone || ''} onChange={e => set('phone', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
          <input value={form.website || ''} onChange={e => set('website', e.target.value)}
            placeholder="www.example.com"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Physical Address</label>
          <textarea rows={2} value={form.address || ''} onChange={e => set('address', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
            <select value={form.country || 'Uganda'} onChange={e => set('country', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Default Currency</label>
            <select value={form.currency || 'UGX'} onChange={e => set('currency', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Default Invoice Footer */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Default Invoice Footer</h2>
        <textarea
          rows={3}
          value={form.default_invoice_footer || ''}
          onChange={e => set('default_invoice_footer', e.target.value)}
          placeholder="This note appears at the bottom of every invoice…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
        <p className="text-xs text-slate-400 mt-1">Shown at the bottom of every invoice. Can be overridden per invoice.</p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saveState === 'saving'}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving…' : 'Save Company Profile'}
        </button>
      </div>
    </form>
  );
}
