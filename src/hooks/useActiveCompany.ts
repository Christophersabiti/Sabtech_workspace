'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const ACTIVE_COMPANY_KEY = 'sabtech_active_company_id';
const ACTIVE_COMPANY_EVENT = 'sabtech-active-company-change';

export type ActiveCompany = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type CompanyMembership = {
  company_id: string;
  role_id: string;
  company: ActiveCompany | null;
};

export function useActiveCompany() {
  const supabase = useMemo(() => createClient(), []);
  const [memberships, setMemberships] = useState<CompanyMembership[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (active) {
          setMemberships([]);
          setActiveCompanyIdState(null);
          setLoading(false);
        }
        return;
      }

      const { data: membershipRows } = await supabase
        .from('company_users')
        .select('company_id, role_id')
        .eq('auth_user_id', session.user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      const rows = membershipRows ?? [];
      const companyIds = rows.map((row) => row.company_id);

      const { data: companyRows } = companyIds.length
        ? await supabase
            .from('companies')
            .select('id, name, slug, status')
            .in('id', companyIds)
        : { data: [] };

      if (!active) return;

      const companies = new Map(
        (companyRows ?? []).map((company) => [company.id, company as ActiveCompany]),
      );
      const nextMemberships = rows.map((row) => ({
        company_id: row.company_id,
        role_id: row.role_id,
        company: companies.get(row.company_id) ?? null,
      }));

      const storedCompanyId =
        typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_COMPANY_KEY) : null;
      const nextActiveCompanyId =
        storedCompanyId && companyIds.includes(storedCompanyId)
          ? storedCompanyId
          : companyIds[0] ?? null;

      if (nextActiveCompanyId && typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVE_COMPANY_KEY, nextActiveCompanyId);
      }

      setMemberships(nextMemberships);
      setActiveCompanyIdState(nextActiveCompanyId);
      setLoading(false);
    }

    load();
    window.addEventListener(ACTIVE_COMPANY_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(ACTIVE_COMPANY_EVENT, load);
    };
  }, [supabase]);

  const setActiveCompanyId = useCallback((companyId: string) => {
    setActiveCompanyIdState(companyId);
    window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
    window.dispatchEvent(new Event(ACTIVE_COMPANY_EVENT));
  }, []);

  const activeCompany =
    memberships.find((membership) => membership.company_id === activeCompanyId)?.company ?? null;
  const currentUserRoleForCompany =
    memberships.find((membership) => membership.company_id === activeCompanyId)?.role_id ?? null;

  return {
    activeCompanyId,
    activeCompany,
    currentUserRoleForCompany,
    memberships,
    userCompanyMemberships: memberships,
    loading,
    setActiveCompanyId,
  };
}
