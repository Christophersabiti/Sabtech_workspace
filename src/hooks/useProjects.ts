'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { KeyedMutator } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Client, Project } from '@/types';

type ProjectsData = {
  projects: (Project & { client: Client })[];
  clients: Client[];
};

interface UseProjectsResult {
  projects: (Project & { client: Client })[];
  clients: Client[];
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
      if (!activeCompanyId) return { projects: [], clients: [] };

      const [projRes, clRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:clients(*)')
          .eq('company_id', activeCompanyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_archived', false)
          .order('name'),
      ]);

      if (projRes.error) throw projRes.error;
      if (clRes.error) throw clRes.error;

      return {
        projects: (projRes.data || []) as (Project & { client: Client })[],
        clients: (clRes.data || []) as Client[],
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
    loading: !data && !error && isValidating,
    error,
    mutate,
  };
}
