'use client';

import Image from 'next/image';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle, Loader2, ArrowRight, User, Mail, Sparkles, Shield, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];
const COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Ethiopia', 'South Africa', 'Nigeria', 'Ghana', 'Other'];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Ideal for independent solo consultants',
    price: 'Free',
    features: ['Up to 5 clients', 'Basic project tasks', 'Standard invoicing', '1 user workspace'],
    icon: Sparkles,
    color: 'from-blue-500 to-indigo-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'For growing consulting practices & PMs',
    price: '$29/mo',
    features: ['Unlimited clients', 'Advanced Kanban & Gantt', 'Expense tracking', 'Up to 5 team members', 'Custom branding'],
    icon: Zap,
    color: 'from-purple-500 to-fuchsia-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Elite capabilities for boutique agencies',
    price: '$89/mo',
    features: ['Multiple workspaces', 'Collaborative Client Portal', 'Priority support', 'Dedicated database options', 'Full audit logging'],
    icon: Shield,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { setActiveCompanyId } = useActiveCompany();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [form, setForm] = useState({
    companyName: '',
    slug: '',
    plan: 'professional',
    primaryContactName: '',
    primaryContactEmail: '',
    country: 'Uganda',
    currency: 'UGX',
    phone: '',
    website: '',
  });

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email ?? '');
        const fullName = session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? '';
        setUserFullName(fullName);
        setForm(current => ({
          ...current,
          primaryContactName: current.primaryContactName || fullName,
          primaryContactEmail: current.primaryContactEmail || (session.user.email ?? ''),
        }));
      }
    }
    loadUser();
  }, [supabase]);

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => {
      const updated = { ...current, [field]: value };
      
      // Auto-generate slug if the user hasn't customized it manually
      if (field === 'companyName' && !slugManuallyEdited) {
        updated.slug = slugify(value);
      }
      return updated;
    });
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

    const payload = {
      ...form,
      slug: form.slug.trim() || slugify(form.companyName),
    };

    const response = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? 'Could not create workspace.');
      setSaving(false);
      return;
    }

    setActiveCompanyId(result.company.id);
    router.push('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500/30 selection:text-purple-200">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/5 pb-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Image src="/logo.svg" alt="Sabtech Workspace" width={40} height={40} className="object-contain" />
            </div>
            <div>
              <p className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Sabtech Workspace
              </p>
              <p className="text-xs font-medium text-slate-400">SaaS Onboarding</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span>Logged in as:</span>
            <strong className="text-purple-400">{userEmail}</strong>
          </div>
        </header>

        {/* Content Grid */}
        <div className="grid flex-1 gap-12 py-10 lg:grid-cols-[0.8fr_1.2fr] items-start">
          
          {/* Information Section */}
          <section className="space-y-8 lg:sticky lg:top-8 lg:py-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/10">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-gradient-to-br from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Create your company workspace
              </h1>
              <p className="text-base leading-relaxed text-slate-400">
                Configure your isolated corporate sandbox. Clients, service rate-cards, Gantt schedules, quotations, invoices, and payments stay segregated under your dedicated workspace.
              </p>
            </div>
            
            <div className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur-3xl">
              <h3 className="text-sm font-semibold text-slate-200">SaaS Tenant Protections</h3>
              <div className="grid gap-3.5 text-sm text-slate-400">
                {[
                  'Advanced Row Level Security (RLS) data isolation',
                  'Dedicated customizable slug matching your domain',
                  'Enterprise-grade branding & custom invoicing options',
                  'Granular workspace access control for team members',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Form Wizard Section */}
          <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-2xl sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* Form Heading */}
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">Onboarding wizard</h2>
                <p className="mt-1.5 text-sm text-slate-400">
                  Establish your operational preferences. You can adjust all preferences inside settings post-signup.
                </p>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3.5 text-sm text-red-400 font-medium">
                  {error}
                </div>
              )}

              {/* Step 1: Corporate Profile */}
              <div className="space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">1. Company Identity</h3>
                
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Company Name *</label>
                    <input
                      required
                      autoFocus
                      value={form.companyName}
                      onChange={(e) => setField('companyName', e.target.value)}
                      placeholder="e.g. Acme Consulting Ltd"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Workspace URL Slug *</label>
                    <div className="relative flex rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500">
                      <input
                        required
                        value={form.slug}
                        onChange={(e) => {
                          setSlugManuallyEdited(true);
                          setField('slug', slugify(e.target.value));
                        }}
                        placeholder="acme-consulting"
                        className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder-slate-500 outline-none"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Your workspace address will be: <strong className="text-slate-300">{form.slug || 'workspace-slug'}.sabtech.online</strong>
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Country</label>
                    <select
                      value={form.country}
                      onChange={(e) => setField('country', e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                    >
                      {COUNTRIES.map((c) => <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Default Currency</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setField('currency', e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 cursor-pointer"
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Phone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setField('phone', e.target.value)}
                      placeholder="+256..."
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Website</label>
                    <input
                      value={form.website}
                      onChange={(e) => setField('website', e.target.value)}
                      placeholder="www.example.com"
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Primary Contact */}
              <div className="space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">2. Stakeholder Contact</h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Primary Contact Name *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        required
                        value={form.primaryContactName}
                        onChange={(e) => setField('primaryContactName', e.target.value)}
                        placeholder="Christopher Sabiti"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-300">Primary Contact Email *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        required
                        type="email"
                        value={form.primaryContactEmail}
                        onChange={(e) => setField('primaryContactEmail', e.target.value)}
                        placeholder="info@sabtechonline.com"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/60 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Choose Premium Plan */}
              <div className="space-y-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400">3. Select Plan Plan</h3>
                
                <div className="grid gap-4 md:grid-cols-3">
                  {PLANS.map((p) => {
                    const Icon = p.icon;
                    const isSelected = form.plan === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setField('plan', p.id)}
                        className={`flex flex-col text-left rounded-2xl border p-5 transition-all outline-none relative overflow-hidden group cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 border-purple-500 shadow-xl shadow-purple-500/5 ring-1 ring-purple-500'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/20'
                        }`}
                      >
                        {/* Selector indicator */}
                        {isSelected && (
                          <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-bl-lg shadow-sm">
                            Active Plan
                          </div>
                        )}

                        <div className="flex items-center gap-3 mb-4">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-slate-900 border border-white/10 text-white group-hover:scale-105 transition-transform`}>
                            <Icon className="h-5 w-5 text-purple-400" />
                          </div>
                          <div>
                            <h4 className="font-bold text-white">{p.name}</h4>
                            <span className="text-xs font-semibold text-slate-500 group-hover:text-purple-400 transition-colors">{p.price}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed mb-4 flex-1">
                          {p.tagline}
                        </p>

                        <div className="border-t border-white/5 pt-4 space-y-2 mt-auto w-full">
                          {p.features.map((f) => (
                            <div key={f} className="flex items-center gap-2 text-[11px] text-slate-400">
                              <CheckCircle className="h-3 w-3 text-purple-400 shrink-0" />
                              <span className="truncate">{f}</span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-purple-500/10 transition-all hover:shadow-purple-500/20 disabled:opacity-60 active:scale-[0.99] cursor-pointer"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                {saving ? 'Creating your workspace sandbox...' : 'Launch my Workspace'}
              </button>
            </form>
          </section>

        </div>

        {/* Footer */}
        <footer className="mt-auto border-t border-white/5 pt-6 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Sabtech Online. Crafted with absolute technical precision.</p>
        </footer>
      </div>
    </main>
  );
}
