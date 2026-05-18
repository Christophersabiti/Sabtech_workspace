'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRequireRole } from '@/hooks/useCurrentUser';
import { CompanySettings } from '@/types';
import { Save, CheckCircle, AlertCircle, Palette, Upload, X } from 'lucide-react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const PRESET_PRIMARIES = [
  '#0f172a', '#1e3a5f', '#1d4ed8', '#6d28d9', '#be185d', '#065f46', '#92400e', '#1f2937',
];
const PRESET_ACCENTS = [
  '#7c2cbf', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5',
];

function ColorSwatch({
  color, selected, onClick,
}: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: color }}
      className={`w-8 h-8 rounded-lg flex-shrink-0 border-2 transition-all ${selected ? 'border-slate-900 scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
    />
  );
}

export default function BrandingSettingsPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [logoUploading, setLogoUploading] = useState(false);
  const [form, setForm] = useState({
    logo_url: null as string | null,
    primary_color: '#0f172a',
    accent_color: '#7c2cbf',
    company_name: 'Sabtech Online',
    tin: '1009345230',
    show_logo_on_invoice: true,
    show_tin_on_invoice: true,
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('company_settings')
        .select('logo_url,primary_color,accent_color,company_name,tin,show_logo_on_invoice,show_tin_on_invoice')
        .eq('id', 1)
        .single();
      if (data) setForm(f => ({ ...f, ...data }));
      setLoading(false);
    }
    load();
  }, []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
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
      alert('Upload failed: ' + upErr.message + '\n\nNote: Create the "company-assets" bucket in Supabase Storage first.');
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
    <form onSubmit={handleSave} className="max-w-3xl space-y-8">
      {saveState === 'saved' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="h-4 w-4" /> Branding settings saved.
        </div>
      )}
      {saveState === 'error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4" /> Failed to save. Please try again.
        </div>
      )}

      {/* Logo */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Palette className="h-4 w-4 text-purple-500" /> Company Logo
        </h2>
        <div className="flex items-start gap-6">
          {/* Preview */}
          <div
            style={{ background: form.primary_color }}
            className="w-24 h-24 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md overflow-hidden p-2"
          >
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-white text-2xl font-black opacity-80">SAB</span>
            )}
          </div>
          <div className="space-y-2 flex-1">
            <label className="inline-flex items-center gap-2 cursor-pointer bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Upload className="h-4 w-4" />
              {logoUploading ? 'Uploading…' : 'Upload New Logo'}
              <input
                type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden" onChange={handleLogoUpload} disabled={logoUploading}
              />
            </label>
            {form.logo_url && (
              <button type="button" onClick={() => set('logo_url', null)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <X className="h-3 w-3" /> Remove logo
              </button>
            )}
            <p className="text-xs text-slate-400">PNG, JPG, SVG or WebP · Max 2MB · Recommended 200×200px</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <strong>Setup required:</strong> Create a public Supabase Storage bucket named <code className="font-mono bg-amber-100 px-1 rounded">company-assets</code> to enable logo uploads.
            </div>
          </div>
        </div>
      </div>

      {/* Brand Colors */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Brand Colors</h2>

        {/* Primary Color */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Primary Color
            <span className="ml-2 text-xs text-slate-400">Used for invoice headers and text</span>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {PRESET_PRIMARIES.map(c => (
              <ColorSwatch key={c} color={c} selected={form.primary_color === c} onClick={() => set('primary_color', c)} />
            ))}
            <input
              type="color" value={form.primary_color}
              onChange={e => set('primary_color', e.target.value)}
              className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
              title="Custom color"
            />
            <code className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">{form.primary_color}</code>
          </div>
        </div>

        {/* Accent Color */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Accent Color
            <span className="ml-2 text-xs text-slate-400">Used for payment instructions block and highlights</span>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {PRESET_ACCENTS.map(c => (
              <ColorSwatch key={c} color={c} selected={form.accent_color === c} onClick={() => set('accent_color', c)} />
            ))}
            <input
              type="color" value={form.accent_color}
              onChange={e => set('accent_color', e.target.value)}
              className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
              title="Custom color"
            />
            <code className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">{form.accent_color}</code>
          </div>
        </div>
      </div>

      {/* Live Invoice Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">Invoice Header Preview</h2>
        <div
          style={{ borderBottom: `3px solid ${form.primary_color}` }}
          className="flex items-center justify-between p-5 bg-white rounded-t-lg"
        >
          <div className="flex items-center gap-4">
            <div style={{ background: form.primary_color }} className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <span className="text-white font-black text-sm">SAB</span>
              )}
            </div>
            <div>
              <div style={{ color: form.primary_color }} className="text-lg font-black">{form.company_name}</div>
              <div className="text-xs text-slate-400">info@sabtechonline.com · +256 777 293 933</div>
              {form.show_tin_on_invoice && (
                <div className="text-xs text-slate-400">TIN: <strong style={{ color: form.primary_color }}>{form.tin}</strong></div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div style={{ color: form.primary_color }} className="text-2xl font-black">INVOICE</div>
            <div style={{ color: form.primary_color }} className="font-mono font-bold">INV-2026-0001</div>
            <div
              style={{ background: form.accent_color }}
              className="inline-block mt-2 px-3 py-1 rounded-full text-white text-xs font-bold"
            >
              SENT
            </div>
          </div>
        </div>
        <div
          style={{ background: `${form.accent_color}15`, borderLeft: `4px solid ${form.accent_color}`, border: `1px solid ${form.accent_color}30` }}
          className="mt-2 p-3 rounded-r-lg text-xs"
        >
          <span style={{ color: form.accent_color }} className="font-bold">💳 Payment Instructions</span>
          <span className="text-slate-500 ml-2">— styled with your accent color</span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saveState === 'saving'}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saveState === 'saving' ? 'Saving…' : 'Save Branding Settings'}
        </button>
      </div>
    </form>
  );
}
