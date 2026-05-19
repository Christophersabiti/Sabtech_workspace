'use client';

import Link from 'next/link';
import { Building2, PlusCircle } from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const {
    activeCompanyId,
    activeCompany,
    memberships,
    loading,
    setActiveCompanyId,
  } = useActiveCompany();

  if (loading) {
    return (
      <div className="px-4 py-3 text-xs text-slate-500">
        Loading workspace...
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="px-4 py-3">
        <Link
          href="/onboarding/company"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <PlusCircle className="h-4 w-4" />
          {!compact && 'Create Workspace'}
        </Link>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="px-3 py-3">
        <Link
          href="/onboarding/company"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          title="Create workspace"
        >
          <Building2 className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-800 px-4 py-4">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Workspace
      </label>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
          <Building2 className="h-4 w-4" />
        </div>
        <select
          value={activeCompanyId ?? ''}
          onChange={(event) => setActiveCompanyId(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Active workspace"
        >
          {memberships.map((membership) => (
            <option key={membership.company_id} value={membership.company_id}>
              {membership.company?.name ?? membership.company_id}
            </option>
          ))}
        </select>
        <Link
          href="/onboarding/company"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          title="Create workspace"
        >
          <PlusCircle className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-2 truncate text-xs text-slate-500">
        {activeCompany?.slug ?? 'Tenant data is scoped here'}
      </p>
    </div>
  );
}
