import { useState, useCallback } from 'react';

export type ClientFilterState = {
  search: string;
  status: string;              // '' | 'active' | 'inactive'
  hasOverdue: boolean | null;
  hasActiveProjects: boolean | null;
  currency: string;
};

const DEFAULT: ClientFilterState = {
  search: '',
  status: '',
  hasOverdue: null,
  hasActiveProjects: null,
  currency: '',
};

export function useClientFilters() {
  const [filters, setFilters] = useState<ClientFilterState>(DEFAULT);

  const patch = useCallback(
    <K extends keyof ClientFilterState>(key: K, value: ClientFilterState[K]) =>
      setFilters(f => ({ ...f, [key]: value })),
    [],
  );

  const clear = useCallback(() => setFilters(DEFAULT), []);

  const hasActive =
    filters.status !== '' ||
    filters.hasOverdue !== null ||
    filters.hasActiveProjects !== null ||
    filters.currency !== '';

  return { filters, patch, clear, hasActive };
}
