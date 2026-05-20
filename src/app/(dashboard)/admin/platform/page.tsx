'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  DoorOpen,
  Globe2,
  Loader2,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';

const IMPERSONATION_KEY = 'sabtech_platform_impersonation';

type PlatformCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  member_count: number;
};

type ImpersonationState = {
  sessionId: string;
  companyId: string;
  companyName: string;
  startedAt: string;
};

function getStoredImpersonation(): ImpersonationState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(IMPERSONATION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ImpersonationState;
  } catch {
    window.localStorage.removeItem(IMPERSONATION_KEY);
    return null;
  }
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const { setActiveCompanyId, clearActiveCompanyId } = useActiveCompany();
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
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setImpersonation(getStoredImpersonation()));
  }, []);

  useEffect(() => {
    async function load() {
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
    }

    void load();
  }, []);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) =>
      [company.name, company.slug, company.status].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [companies, search]);

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

    const nextState: ImpersonationState = {
      sessionId: data.session.id,
      companyId: data.company.id,
      companyName: data.company.name,
      startedAt: data.session.started_at,
    };
    window.localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(nextState));
    setImpersonation(nextState);
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

    window.localStorage.removeItem(IMPERSONATION_KEY);
    clearActiveCompanyId();
    setImpersonation(null);
    setStopReason('');
    setStopOpen(false);
    setStopping(false);
    setToast({ type: 'success', message: 'Impersonation stopped and audited.' });
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
            onClick={() => router.push('/onboarding/company')}
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
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Slug</th>
                  <th className="px-5 py-3">Users</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
    </div>
  );
}
