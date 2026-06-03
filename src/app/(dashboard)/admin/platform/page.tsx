'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  CreditCard,
  DoorOpen,
  Globe2,
  Loader2,
  LogOut,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Users,
  X,
  Key,
  Trash2,
  Settings,
} from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { usePlatformImpersonation } from '@/hooks/usePlatformImpersonation';
import { createClient } from '@/lib/supabase/client';
import { useRequireAppRole } from '@/hooks/useCurrentUser';

type PlatformCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  email: string | null;
  plan: string | null;
  domain: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  last_activity_at: string | null;
  created_at: string;
  member_count: number;
};

type PlatformTab = 'companies' | 'users' | 'admins' | 'billing';

type PlatformPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number | null;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  billing_interval: string;
  user_limit: number;
  invoice_limit: number;
  is_active: boolean;
};

const PLATFORM_TABS: Array<{ id: PlatformTab; label: string; icon: typeof Building2 }> = [
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'admins', label: 'Super Admins', icon: Shield },
  { id: 'billing', label: 'Billing', icon: CreditCard },
];

export default function PlatformAdminPage() {
  const { checking } = useRequireAppRole(['super_admin']);
  const router = useRouter();
  const { setActiveCompanyId, clearActiveCompanyId } = useActiveCompany();
  const { impersonation, setStoredImpersonation, clearStoredImpersonation } = usePlatformImpersonation();
  const [activeTab, setActiveTab] = useState<PlatformTab>('companies');
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<PlatformCompany | null>(null);
  const [reason, setReason] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopReason, setStopReason] = useState('');
  const [stopping, setStopping] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    companyName: '',
    slug: '',
    companyEmail: '',
    plan: 'starter',
    status: 'active',
    domain: '',
    primaryContactName: '',
    adminFullName: '',
    adminEmail: '',
  });

  // Pesapal Configuration states
  const [pesapalKey, setPesapalKey] = useState('');
  const [pesapalSecret, setPesapalSecret] = useState('');
  const [pesapalIpn, setPesapalIpn] = useState('');
  const [pesapalSandbox, setPesapalSandbox] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Subscription Plans states
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    key: '',
    name: '',
    description: '',
    price: 0,
    currency: 'UGX',
    billingInterval: 'monthly',
    userLimit: 3,
    invoiceLimit: 50,
  });

  const loadPesapalConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await fetch('/api/platform/pesapal-config');
      const data = await res.json();
      if (res.ok && data.settings) {
        setPesapalKey(data.settings.consumer_key || '');
        setPesapalSecret(data.settings.consumer_secret || '');
        setPesapalIpn(data.settings.ipn_id || '');
        setPesapalSandbox(data.settings.sandbox_mode ?? true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const client = createClient();
    const { data, error } = await client
      .from('subscription_plans')
      .select('*')
      .order('monthly_price', { ascending: true });

    if (!error && data) {
      setPlans(data as PlatformPlan[]);
    }
    setLoadingPlans(false);
  }, []);

  async function syncPackageMetadata() {
    await fetch('/api/platform/packages/sync', { method: 'POST' }).catch(() => null);
  }

  useEffect(() => {
    if (activeTab === 'billing') {
      void loadPesapalConfig();
      void loadPlans();
    }
  }, [activeTab, loadPesapalConfig, loadPlans]);

  async function savePesapalConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch('/api/platform/pesapal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerKey: pesapalKey,
          consumerSecret: pesapalSecret,
          ipnId: pesapalIpn,
          sandboxMode: pesapalSandbox,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: 'Pesapal configuration saved!' });
        void loadPesapalConfig();
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to save config.' });
      }
    } catch {
      setToast({ type: 'error', message: 'Network error saving config.' });
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planForm.key || !planForm.name) return;
    setCreatingPlan(true);
    const client = createClient();
    const { error } = await client
      .from('subscription_plans')
      .insert({
        key: planForm.key.toLowerCase().trim(),
        name: planForm.name.trim(),
        description: planForm.description.trim(),
        price: Number(planForm.price),
        monthly_price: Number(planForm.price),
        annual_price: Number(planForm.price) > 0 ? Number(planForm.price) * 10 : 0,
        currency: planForm.currency,
        billing_interval: planForm.billingInterval,
        user_limit: Number(planForm.userLimit),
        invoice_limit: Number(planForm.invoiceLimit),
        is_active: true,
        is_public: true,
      });

    if (error) {
      setToast({ type: 'error', message: error.message });
    } else {
      setToast({ type: 'success', message: 'Plan created successfully!' });
      setCreatePlanOpen(false);
      setPlanForm({
        key: '',
        name: '',
        description: '',
        price: 0,
        currency: 'UGX',
        billingInterval: 'monthly',
        userLimit: 3,
        invoiceLimit: 50,
      });
      await syncPackageMetadata();
      void loadPlans();
    }
    setCreatingPlan(false);
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm('Are you sure you want to deactivate/delete this plan?')) return;
    const client = createClient();
    const { error } = await client
      .from('subscription_plans')
      .delete()
      .eq('id', planId);

    if (error) {
      // If plan is in use, soft deactivate it instead of hard deleting
      const { error: softErr } = await client
        .from('subscription_plans')
        .update({ is_active: false })
        .eq('id', planId);

      if (softErr) {
        setToast({ type: 'error', message: softErr.message });
      } else {
        setToast({ type: 'success', message: 'Plan deactivated successfully.' });
        await syncPackageMetadata();
        void loadPlans();
      }
    } else {
      setToast({ type: 'success', message: 'Plan deleted successfully.' });
      await syncPackageMetadata();
      void loadPlans();
    }
  }

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/platform/companies');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ type: 'error', message: data.error ?? 'Platform Admin access required.' });
      setCompanies([]);
    } else {
      setCompanies(data.companies ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadCompanies);
  }, [loadCompanies]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      [company.name, company.slug, company.status, company.email, company.plan].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      ),
    );
  }, [companies, search]);

  function updateCreateForm(field: keyof typeof createForm, value: string) {
    setCreateForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'companyName' && !current.slug) {
        next.slug = value
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
      if (field === 'adminFullName' && !current.primaryContactName) {
        next.primaryContactName = value;
      }
      return next;
    });
  }

  async function createCompanyWithAdmin(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    const res = await fetch('/api/platform/companies/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setToast({ type: 'error', message: data.error ?? 'Could not create company.' });
      setCreating(false);
      return;
    }

    setCreateOpen(false);
    setCreateForm({
      companyName: '',
      slug: '',
      companyEmail: '',
      plan: 'starter',
      status: 'active',
      domain: '',
      primaryContactName: '',
      adminFullName: '',
      adminEmail: '',
    });
    setToast({ type: 'success', message: 'Company created and admin invite sent.' });
    await loadCompanies();
    setCreating(false);
  }

  async function startImpersonation() {
    if (!selectedCompany || reason.trim().length < 10) return;
    setStarting(true);
    const res = await fetch('/api/platform/impersonation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: selectedCompany.id, reason }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setToast({ type: 'error', message: data.error ?? 'Could not enter company.' });
      setStarting(false);
      return;
    }

    const nextState = {
      sessionId: data.session.id,
      companyId: data.company.id,
      companyName: data.company.name,
      startedAt: data.session.started_at,
    };
    setStoredImpersonation(nextState);
    setActiveCompanyId(nextState.companyId);
    setSelectedCompany(null);
    setReason('');
    setStarting(false);
    router.push('/');
  }

  async function stopImpersonation() {
    if (!impersonation || stopReason.trim().length < 10) return;
    setStopping(true);
    const res = await fetch('/api/platform/impersonation/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: impersonation.sessionId,
        companyId: impersonation.companyId,
        reason: stopReason,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setToast({ type: 'error', message: data.error ?? 'Could not stop impersonation.' });
      setStopping(false);
      return;
    }

    clearStoredImpersonation();
    clearActiveCompanyId();
    setStopReason('');
    setStopOpen(false);
    setStopping(false);
    setToast({ type: 'success', message: 'Impersonation stopped and audited.' });
  }

  if (checking) {
    return <div className="py-16 text-center text-slate-400">Checking platform permissions...</div>;
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage company support access without exposing company switching to normal users.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Company
          </button>
          <button
            type="button"
            onClick={() => setStopOpen(true)}
            disabled={!impersonation}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Stop Impersonating
          </button>
        </div>
      </div>

      {impersonation && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Currently impersonating {impersonation.companyName}</p>
            <p className="text-xs text-amber-700">
              Started {new Date(impersonation.startedAt).toLocaleString()}. Stop access when support work is complete.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStopOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <LogOut className="h-4 w-4" />
            Stop Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: 'Companies', value: companies.length, icon: Building2, tone: 'text-blue-700 bg-blue-50' },
          { label: 'Active Tenants', value: companies.filter((company) => company.status === 'active').length, icon: CheckCircle, tone: 'text-green-700 bg-green-50' },
          { label: 'Platform Users', value: companies.reduce((sum, company) => sum + company.member_count, 0), icon: Users, tone: 'text-slate-700 bg-slate-50' },
          { label: 'Support Mode', value: impersonation ? 'On' : 'Off', icon: ShieldCheck, tone: impersonation ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-50' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-200/70 p-1">
        {PLATFORM_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === id
                ? 'bg-white text-slate-900 shadow-sm ring-2 ring-blue-600'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'companies' && (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Companies</h2>
            <p className="text-sm text-slate-500">Select Enter only when support access is approved and documented.</p>
          </div>
          <div className="relative w-full max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies by name, slug, or status..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading companies...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Slug</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Users</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <p className="font-semibold text-slate-600">
                        {search ? 'No companies match your search.' : 'No companies have been created yet.'}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">Create the first company to begin onboarding tenants.</p>
                    </td>
                  </tr>
                )}
                {filteredCompanies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{company.name}</p>
                          <p className="text-xs text-slate-400">{company.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{company.slug}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                        {company.plan ?? 'starter'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Users className="h-4 w-4 text-slate-400" />
                        {company.member_count}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          company.status === 'active'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {company.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700">{company.primary_contact_name ?? 'Not set'}</p>
                      <p className="text-xs text-slate-400">{company.primary_contact_email ?? company.email ?? 'No email'}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Globe2 className="h-4 w-4" />
                          Domain
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCompany(company)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        >
                          <DoorOpen className="h-4 w-4" />
                          Enter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {activeTab === 'users' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Platform Users</h2>
              <p className="text-sm text-slate-500">Global directory across all tenant memberships.</p>
            </div>
            <div className="relative w-full max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search users by email, company, role, or status..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Global user table needs a platform API contract</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
              Next step: expose a read-only platform endpoint that joins app users to company memberships,
              then add filters for company, role, status, and last login.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'admins' && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Super Admins</h2>
              <p className="text-sm text-slate-500">Platform-wide access should stay small and audited.</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Shield className="h-4 w-4" />
              Grant Access
            </button>
          </div>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Super Admin audit workflow is partially implemented</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
              Impersonation start/stop is audited. Add grant/revoke APIs with required reason logging before enabling this button.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'billing' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Pesapal settings */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Key className="h-5 w-5 text-purple-600" />
                Pesapal Config
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Manage sandbox or production API keys.</p>
            </div>

            {loadingConfig ? (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading credentials...
              </div>
            ) : (
              <form onSubmit={savePesapalConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Consumer Key</label>
                  <input
                    type="password"
                    value={pesapalKey}
                    onChange={(e) => setPesapalKey(e.target.value)}
                    placeholder="Enter consumer key"
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Consumer Secret</label>
                  <input
                    type="password"
                    value={pesapalSecret}
                    onChange={(e) => setPesapalSecret(e.target.value)}
                    placeholder="Enter consumer secret"
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">IPN ID (Optional)</label>
                  <input
                    type="text"
                    value={pesapalIpn}
                    onChange={(e) => setPesapalIpn(e.target.value)}
                    placeholder="Auto-registers on checkout if empty"
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs font-semibold text-slate-600">Sandbox / Testing Mode</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pesapalSandbox}
                      onChange={(e) => setPesapalSandbox(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 py-2 text-xs font-semibold text-white disabled:opacity-60 transition-colors"
                >
                  {savingConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
                  Save Keys
                </button>
              </form>
            )}
          </div>

          {/* Pricing Plans */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Subscription Plans</h2>
                <p className="text-xs text-slate-500 mt-0.5">Manage plans available for clients to purchase.</p>
              </div>
              <button
                onClick={() => setCreatePlanOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-semibold font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Plan
              </button>
            </div>

            {loadingPlans ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading plans...
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                <p className="text-xs text-slate-400">No active pricing plans found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-2.5">Plan Key</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Price</th>
                      <th className="px-4 py-2.5">Limits</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {plans.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900 font-mono">{p.key}</td>
                        <td className="px-4 py-3">{p.name} {!p.is_active && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">inactive</span>}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {Number(p.monthly_price ?? p.price ?? 0).toLocaleString()} {p.currency} <span className="text-slate-400 text-[10px] font-normal">/ {p.billing_interval}</span>
                        </td>
                        <td className="px-4 py-3">
                          {p.user_limit} Users · {p.invoice_limit} Invoices
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeletePlan(p.id)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                            title="Delete Plan"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Company and Admin</h2>
                <p className="text-sm text-slate-500">
                  Super Admin creates the tenant and invites the first company administrator.
                </p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createCompanyWithAdmin}>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Company Name</span>
                  <input
                    required
                    value={createForm.companyName}
                    onChange={(event) => updateCreateForm('companyName', event.target.value)}
                    placeholder="Cas Services"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Slug</span>
                  <input
                    required
                    value={createForm.slug}
                    onChange={(event) => updateCreateForm('slug', event.target.value)}
                    placeholder="cas-services"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Company Email</span>
                  <input
                    required
                    type="email"
                    value={createForm.companyEmail}
                    onChange={(event) => updateCreateForm('companyEmail', event.target.value)}
                    placeholder="accounts@company.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Plan</span>
                  <select
                    value={createForm.plan}
                    onChange={(event) => updateCreateForm('plan', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
                  <select
                    value={createForm.status}
                    onChange={(event) => updateCreateForm('status', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Domain or Subdomain</span>
                  <input
                    value={createForm.domain}
                    onChange={(event) => updateCreateForm('domain', event.target.value)}
                    placeholder="cas.sabtechonline.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <div className="md:col-span-2 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">First Company Admin</h3>
                  <p className="text-xs text-slate-500">This user receives the secure invite and joins only this company.</p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Admin Full Name</span>
                  <input
                    required
                    value={createForm.adminFullName}
                    onChange={(event) => updateCreateForm('adminFullName', event.target.value)}
                    placeholder="Jane Admin"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Admin Email</span>
                  <input
                    required
                    type="email"
                    value={createForm.adminEmail}
                    onChange={(event) => updateCreateForm('adminEmail', event.target.value)}
                    placeholder="admin@company.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Primary Contact</span>
                  <input
                    value={createForm.primaryContactName}
                    onChange={(event) => updateCreateForm('primaryContactName', event.target.value)}
                    placeholder="Jane Admin"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>
              <div className="flex gap-3 border-t border-slate-100 p-5">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {creating ? 'Creating...' : 'Create and Invite Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Enter {selectedCompany.name}</h2>
                <p className="text-sm text-slate-500">A reason is required before support access starts.</p>
              </div>
              <button onClick={() => setSelectedCompany(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Reason for impersonation</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  placeholder="Example: Investigating invoice export issue reported in support ticket #123."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <p className="text-xs text-slate-500">This action is logged to the platform impersonation audit trail.</p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={() => setSelectedCompany(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startImpersonation}
                disabled={starting || reason.trim().length < 10}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {starting ? 'Entering...' : 'Enter Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stopOpen && impersonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Stop Impersonating</h2>
                <p className="text-sm text-slate-500">Close support access to {impersonation.companyName}.</p>
              </div>
              <button onClick={() => setStopOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Stop reason</span>
                <textarea
                  value={stopReason}
                  onChange={(event) => setStopReason(event.target.value)}
                  rows={4}
                  placeholder="Example: Resolved issue and confirmed exports are working."
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <p className="text-xs text-slate-500">The stop reason is stored with the impersonation session.</p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={() => setStopOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopImpersonation}
                disabled={stopping || stopReason.trim().length < 10}
                className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {stopping ? 'Stopping...' : 'Stop Impersonating'}
              </button>
            </div>
          </div>
        </div>
      )}
      {createPlanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 font-bold">Create Subscription Plan</h2>
                <p className="text-xs text-slate-500 mt-0.5">Define pricing details and tenant limits.</p>
              </div>
              <button onClick={() => setCreatePlanOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePlan}>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Plan Key *</span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. custom-pro"
                      value={planForm.key}
                      onChange={(e) => setPlanForm({ ...planForm, key: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Display Name *</span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Custom Pro"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Price *</span>
                    <input
                      required
                      type="number"
                      placeholder="0"
                      value={planForm.price}
                      onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Currency</span>
                    <input
                      required
                      type="text"
                      value={planForm.currency}
                      onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Interval</span>
                    <select
                      value={planForm.billingInterval}
                      onChange={(e) => setPlanForm({ ...planForm, billingInterval: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="one_time">One-time</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Users Limit</span>
                    <input
                      required
                      type="number"
                      value={planForm.userLimit}
                      onChange={(e) => setPlanForm({ ...planForm, userLimit: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs font-semibold text-slate-600 mb-1.5">Invoice Limit</span>
                    <input
                      required
                      type="number"
                      value={planForm.invoiceLimit}
                      onChange={(e) => setPlanForm({ ...planForm, invoiceLimit: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 mb-1.5">Description</span>
                  <textarea
                    value={planForm.description}
                    onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    rows={2}
                    placeholder="Short summary of this plan"
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </label>
              </div>
              <div className="flex gap-3 border-t border-slate-100 p-5">
                <button
                  type="button"
                  onClick={() => setCreatePlanOpen(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPlan}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {creatingPlan && <Loader2 className="h-3 w-3 animate-spin" />}
                  {creatingPlan ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
