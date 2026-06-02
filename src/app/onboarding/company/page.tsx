'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Globe2,
  Layers3,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  WalletCards,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];
const COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Ethiopia', 'South Africa', 'Nigeria', 'Ghana', 'Other'];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'A clean operating base for a small team.',
    price: 'Free',
    features: ['Up to 5 clients', 'Core invoicing', '1 user workspace'],
    icon: Sparkles,
  },
  {
    id: 'professional',
    name: 'Professional',
    tagline: 'Structured delivery, finance, and visibility.',
    price: '$29/mo',
    features: ['Unlimited clients', 'Projects and expenses', 'Custom branding'],
    icon: Layers3,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Governance for multi-team operations.',
    price: '$89/mo',
    features: ['Multiple workspaces', 'Priority support', 'Audit controls'],
    icon: ShieldCheck,
  },
];

const BENEFITS = [
  { icon: ShieldCheck, label: 'RLS-backed company data isolation' },
  { icon: Layers3, label: 'Clients, projects, quotations, and invoices in one flow' },
  { icon: BadgeCheck, label: 'Brand, currency, and contact defaults from day one' },
];

const SETUP_STEPS = [
  ['Company identity', 'Name, slug, region'],
  ['Financial defaults', 'Currency and contacts'],
  ['Workspace plan', 'Modules and limits'],
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function WorkspaceMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-full w-full">
      <polygon points="32 5 56 18 32 31 8 18" fill="#091545" />
      <polygon points="8 18 32 31 32 59 8 45" fill="#112068" />
      <polygon points="56 18 32 31 32 59 56 45" fill="#1D9E75" />
      <path
        d="M32 5 56 18v27L32 59 8 45V18L32 5Zm0 26v28M8 18l24 13 24-13"
        fill="none"
        stroke="#5DCAA5"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white p-2 shadow-lg shadow-[#091545]/25 ring-1 ring-white/70">
        <WorkspaceMark />
      </span>
      <span>
        <span className="block text-sm font-black uppercase tracking-[0.12em] text-white">
          Sabtech
        </span>
        <span className="block text-xs font-semibold uppercase tracking-[0.28em] text-[#5DCAA5]">
          Workspace
        </span>
      </span>
    </div>
  );
}

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { setActiveCompanyId } = useActiveCompany();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
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

  const workspacePreview = `${form.slug || slugify(form.companyName) || 'your-company'}.sabtech.online`;

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email ?? '');
        const fullName = session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? '';
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
    <main className="min-h-screen overflow-x-hidden bg-[#F4F7FC] text-[#091545]">
      <div className="grid min-h-screen w-full grid-cols-1 overflow-x-hidden lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative flex min-h-[560px] w-screen min-w-0 max-w-[100vw] overflow-hidden bg-[#091545] px-6 py-8 text-white sm:px-10 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:max-w-full lg:px-14">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#091545_0%,#112068_48%,#2952C8_72%,#1D9E75_100%)]" />
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="relative z-10 flex w-full min-w-0 max-w-full flex-col">
            <BrandLockup />

            <div className="my-auto w-full min-w-0 max-w-[min(342px,calc(100vw-3rem))] py-14 sm:max-w-xl lg:py-0">
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-lg border border-white/20 bg-white/10 shadow-lg shadow-[#091545]/30">
                <Building2 className="h-7 w-7" />
              </div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#5DCAA5]">
                Workspace activation
              </p>
              <h1 className="max-w-full break-words text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                Launch a structured company workspace.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-[#E1F5EE]">
                Bring clients, projects, quotations, invoices, expenses, reports, and team access under one governed Sabtech Workspace tenant.
              </p>

              <div className="mt-10 space-y-4">
                {BENEFITS.map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={benefit.label} className="flex min-w-0 items-center gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 break-words font-medium text-[#F4F7FC]">{benefit.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w-full min-w-0 max-w-[min(342px,calc(100vw-3rem))] rounded-lg border border-white/15 bg-white/10 p-5 shadow-2xl shadow-[#091545]/25 backdrop-blur sm:max-w-full">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5DCAA5]">
                    Setup path
                  </p>
                  <p className="mt-1 text-lg font-bold">Company workspace</p>
                </div>
                <span className="rounded-full bg-[#1D9E75]/20 px-3 py-1 text-xs font-semibold text-[#E1F5EE]">
                  Guided
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {SETUP_STEPS.map(([title, caption], index) => (
                  <div key={title} className="rounded-lg border border-white/15 bg-white/10 p-3">
                    <p className="text-sm font-bold">{index + 1}</p>
                    <p className="mt-3 text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#E1F5EE]">{caption}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex w-screen min-w-0 max-w-[100vw] items-center justify-start px-5 py-10 sm:justify-center sm:px-8 lg:w-auto lg:max-w-full lg:px-16">
          <div className="w-full min-w-0 max-w-[min(350px,calc(100vw-2.5rem))] sm:max-w-3xl">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => router.push('/')}
                className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#112068] transition hover:text-[#2952C8]"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back to workspace
              </button>
              {userEmail ? (
                <div className="rounded-full border border-[#D8E2EF] bg-white px-4 py-2 text-xs font-semibold text-[#112068] shadow-sm">
                  Signed in as <span className="text-[#1D9E75]">{userEmail}</span>
                </div>
              ) : null}
            </div>

            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#1D9E75]">
                Company onboarding
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-normal text-[#091545] sm:text-4xl">
                Create your workspace
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Set the identity, defaults, and plan your team will use across projects, invoices, reporting, and administration.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-7">
              {error ? (
                <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E1F5EE] text-[#1D9E75]">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-[#091545]">Company identity</h3>
                    <p className="text-sm text-slate-500">Name the workspace and reserve its URL.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Company name *</span>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) => setField('companyName', e.target.value)}
                      placeholder="e.g. Acme Consulting Ltd"
                      className="w-full rounded-lg border border-[#D8E2EF] bg-white px-4 py-3 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Workspace slug *</span>
                    <input
                      required
                      value={form.slug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setField('slug', slugify(e.target.value));
                      }}
                      placeholder="acme-consulting"
                      className="w-full rounded-lg border border-[#D8E2EF] bg-white px-4 py-3 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                    />
                  </label>
                </div>

                <div className="rounded-lg border border-[#BFEADB] bg-[#E1F5EE] px-4 py-3 text-sm text-[#112068]">
                  Your workspace address will look like{' '}
                  <strong className="font-bold text-[#091545]">{workspacePreview}</strong>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8EEFF] text-[#2952C8]">
                    <Globe2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-[#091545]">Regional defaults</h3>
                    <p className="text-sm text-slate-500">Set the operating country, currency, and public contacts.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Country</span>
                    <select
                      value={form.country}
                      onChange={(e) => setField('country', e.target.value)}
                      className="w-full rounded-lg border border-[#D8E2EF] bg-white px-4 py-3 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                    >
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Default currency</span>
                    <select
                      value={form.currency}
                      onChange={(e) => setField('currency', e.target.value)}
                      className="w-full rounded-lg border border-[#D8E2EF] bg-white px-4 py-3 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                    >
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Phone</span>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        placeholder="+256..."
                        className="w-full rounded-lg border border-[#D8E2EF] bg-white py-3 pl-10 pr-4 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Website</span>
                    <div className="relative">
                      <Globe2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={form.website}
                        onChange={(e) => setField('website', e.target.value)}
                        placeholder="www.example.com"
                        className="w-full rounded-lg border border-[#D8E2EF] bg-white py-3 pl-10 pr-4 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8EEFF] text-[#2952C8]">
                    <User className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-[#091545]">Primary contact</h3>
                    <p className="text-sm text-slate-500">Use the account that should own launch communication.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Contact name *</span>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        required
                        value={form.primaryContactName}
                        onChange={(e) => setField('primaryContactName', e.target.value)}
                        placeholder="Christopher Sabiti"
                        className="w-full rounded-lg border border-[#D8E2EF] bg-white py-3 pl-10 pr-4 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#091545]">Contact email *</span>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        required
                        type="email"
                        value={form.primaryContactEmail}
                        onChange={(e) => setField('primaryContactEmail', e.target.value)}
                        placeholder="info@sabtechonline.com"
                        className="w-full rounded-lg border border-[#D8E2EF] bg-white py-3 pl-10 pr-4 text-sm text-[#091545] shadow-sm outline-none transition focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                      />
                    </div>
                  </label>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E1F5EE] text-[#1D9E75]">
                    <WalletCards className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-[#091545]">Workspace plan</h3>
                    <p className="text-sm text-slate-500">Choose the operating tier for this tenant.</p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {PLANS.map((plan) => {
                    const Icon = plan.icon;
                    const selected = form.plan === plan.id;

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setField('plan', plan.id)}
                        aria-pressed={selected}
                        className={`flex min-h-52 flex-col rounded-lg border p-4 text-left shadow-sm outline-none transition focus:ring-4 focus:ring-[#2952C8]/10 ${
                          selected
                            ? 'border-[#2952C8] bg-white ring-1 ring-[#2952C8]'
                            : 'border-[#D8E2EF] bg-white hover:border-[#5DCAA5]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            selected ? 'bg-[#2952C8] text-white' : 'bg-[#E1F5EE] text-[#1D9E75]'
                          }`}>
                            <Icon className="h-5 w-5" />
                          </span>
                          {selected ? (
                            <CheckCircle2 className="h-5 w-5 text-[#1D9E75]" />
                          ) : null}
                        </div>
                        <div className="mt-4">
                          <h4 className="font-bold text-[#091545]">{plan.name}</h4>
                          <p className="mt-1 text-xs font-semibold text-[#2952C8]">{plan.price}</p>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{plan.tagline}</p>
                        </div>
                        <div className="mt-auto space-y-2 pt-4">
                          {plan.features.map((feature) => (
                            <div key={feature} className="flex items-center gap-2 text-xs font-medium text-slate-500">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1D9E75]" />
                              <span>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2952C8] px-6 text-sm font-bold text-white shadow-lg shadow-[#2952C8]/20 transition hover:bg-[#112068] focus:outline-none focus:ring-4 focus:ring-[#2952C8]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <BarChart3 className="h-5 w-5" />}
                {saving ? 'Creating workspace...' : 'Launch my Workspace'}
                {saving ? null : <ArrowRight className="h-5 w-5" />}
              </button>
            </form>

            <p className="mt-10 text-center text-sm text-slate-400">
              2026 Sabtech Workspace. Managed by Sabtech Online.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
