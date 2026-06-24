'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { KeyedMutator } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { ClientWithStats } from '@/types';

interface ClientFilters {
  search: string;
  status: string;
  hasOverdue: boolean | null;
  hasActiveProjects: boolean | null;
  currency: string;
}

interface UseClientsResult {
  clients: ClientWithStats[];
  loading: boolean;
  error: unknown;
  loadWarning: string | null;
  mutate: KeyedMutator<ClientsData>;
}

type ClientsData = {
  clients: ClientWithStats[];
  warning: string | null;
};

export function useClients(
  activeCompanyId: string | null,
  showArchived: boolean,
  filters: ClientFilters
): UseClientsResult {
  const supabase = useMemo(() => createClient(), []);

  // SWR Cache Key includes company and filters to isolate cache partitions
  const cacheKey = activeCompanyId
    ? ['clients', activeCompanyId, showArchived, JSON.stringify(filters)]
    : null;

  const { data, error, isValidating, mutate } = useSWR<ClientsData, unknown>(
    cacheKey,
    async () => {
      if (!activeCompanyId) return { clients: [], warning: null };

      if (showArchived) {
        // Simple query for archived view — no stats needed
        const { data: res, error: err } = await supabase
          .from('clients')
          .select('*')
          .eq('company_id', activeCompanyId)
          .eq('is_archived', true)
          .order('name');

        if (err) throw err;

        const archivedClients: ClientWithStats[] = ((res || []) as ClientWithStats[]).map(c => ({
          ...c,
          active_projects: 0,
          total_outstanding: 0,
          has_overdue: false,
        }));
        return { clients: archivedClients, warning: null };
      } else {
        // Main filtered view using Supabase RPC
        const { data: res, error: err } = await supabase.rpc('get_clients_filtered', {
          p_company_id: activeCompanyId,
          p_search: filters.search || null,
          p_status: filters.status || null,
          p_has_overdue: filters.hasOverdue,
          p_has_active_projects: filters.hasActiveProjects,
          p_currency: filters.currency || null,
        });

        const shouldCheckFallback =
          !err &&
          (res || []).length === 0 &&
          !filters.search &&
          !filters.status &&
          !filters.currency &&
          filters.hasOverdue === null &&
          filters.hasActiveProjects === null;

        if (err || shouldCheckFallback) {
          if (!err && shouldCheckFallback) {
            console.warn('[useClients] Client stats RPC returned no rows. Checking direct tenant clients query.');
          } else {
            console.error('[useClients] Failed to load client stats. Falling back to tenant-scoped clients query:', err);
          }

          // Build fallback query with the same filters the RPC would have applied
          let fallbackQ = supabase
            .from('clients')
            .select('*')
            .eq('company_id', activeCompanyId)
            .eq('is_archived', false);

          if (filters.search) {
            const s = filters.search;
            fallbackQ = fallbackQ.or(
              `name.ilike.%${s}%,company_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%,client_code.ilike.%${s}%`
            );
          }
          if (filters.status) fallbackQ = fallbackQ.eq('status', filters.status);
          if (filters.currency) fallbackQ = fallbackQ.eq('currency', filters.currency);

          const { data: fallbackClients, error: fallbackError } = await fallbackQ.order('name');

          if (fallbackError) {
            throw fallbackError;
          }

          let warning = null;
          if ((fallbackClients || []).length > 0) {
            warning = 'Client totals are temporarily unavailable. Showing tenant clients without financial stats.';
          }

          const mapped = ((fallbackClients || []) as ClientWithStats[]).map(c => ({
            ...c,
            active_projects: 0,
            total_outstanding: 0,
            has_overdue: false,
          }));

          return { clients: mapped, warning };
        } else {
          return { clients: (res || []) as ClientWithStats[], warning: null };
        }
      }
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // cache reads are reused for up to 5 seconds before checking again
    }
  );

  return {
    clients: data?.clients || [],
    loadWarning: data?.warning || null,
    loading: !data && !error && isValidating,
    error,
    mutate,
  };
}
