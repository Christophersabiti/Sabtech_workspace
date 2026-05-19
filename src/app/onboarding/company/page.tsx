'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle, Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];
const COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Ethiopia', 'South Africa', 'Nigeria', 'Ghana'];

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { setActiveCompanyId } = useActiveCompany();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    companyName: '',
    country: 'Uganda',
    currency: 'UGX',
    phone: '',
    website: '',
  });

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login?redirect=/onboarding/company');
      return;
    }

    const response = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? 'Could not create workspace.');
      setSaving(false);
      return;
    }

    setActiveCompanyId(result.company.id);
    router.push('/admin/settings/company');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="Sabtech Online" width={36} height={36} />
          <div>
            <p className="text-sm font-semibold">Sabtech Online</p>
            <p className="text-xs text-slate-400">Workspace setup</p>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="max-w-xl text-4xl font-bold tracking-normal text-white sm:text-5xl">
                Create your company workspace
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
                Each workspace keeps clients, projects, invoices, tasks, settings, branding, and users isolated for one company.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-300">
              {[
                'Company-owned invoice numbering and branding',
                'Tenant-isolated clients, projects, tasks, invoices, and payments',
                'Owner access ready for inviting your team',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Company details</h2>
                <p className="mt-1 text-sm text-slate-500">You can refine branding, tax details, and invoice settings after setup.</p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Company name *</label>
                <input
                  required
                  autoFocus
                  value={form.companyName}
                  onChange={(e) => setField('companyName', e.target.value)}
                  placeholder="e.g. Acme Consulting Ltd"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Country</label>
                  <select
                    value={form.country}
                    onChange={(e) => setField('country', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Default currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setField('currency', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="+256..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Website</label>
                  <input
                    value={form.website}
                    onChange={(e) => setField('website', e.target.value)}
                    placeholder="www.example.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {saving ? 'Creating workspace...' : 'Create workspace'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
