'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { KeyedMutator } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Client, Project } from '@/types';

type ProjectsData = {
  projects: (Project & { client: Client; portfolio_projects?: { portfolio_id: string }[] })[];
  clients: Client[];
  portfolios: { id: string; name: string }[];
};

interface UseProjectsResult {
  projects: (Project & { client: Client; portfolio_projects?: { portfolio_id: string }[] })[];
  clients: Client[];
  portfolios: { id: string; name: string }[];
  loading: boolean;
  error: unknown;
  mutate: KeyedMutator<ProjectsData>;
}

export function useProjects(activeCompanyId: string | null): UseProjectsResult {
  const supabase = useMemo(() => createClient(), []);

  const cacheKey = activeCompanyId ? ['projects', activeCompanyId] : null;

  const { data, error, isValidating, mutate } = useSWR<ProjectsData, unknown>(
    cacheKey,
    async () => {
      if (!activeCompanyId) return { projects: [], clients: [], portfolios: [] };

      const [projRes, clRes, portRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:clients(*), portfolio_projects(portfolio_id)')
          .eq('company_id', activeCompanyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_archived', false)
          .order('name'),
        supabase
          .from('portfolios')
          .select('id, name')
          .eq('company_id', activeCompanyId)
          .order('name'),
      ]);

      if (projRes.error) throw projRes.error;
      if (clRes.error) throw clRes.error;
      if (portRes.error) throw portRes.error;

      return {
        projects: (projRes.data || []) as (Project & { client: Client; portfolio_projects?: { portfolio_id: string }[] })[],
        clients: (clRes.data || []) as Client[],
        portfolios: (portRes.data || []) as { id: string; name: string }[],
      };
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  );

  return {
    projects: data?.projects || [],
    clients: data?.clients || [],
    portfolios: data?.portfolios || [],
    loading: !data && !error && isValidating,
    error,
    mutate,
  };
}
