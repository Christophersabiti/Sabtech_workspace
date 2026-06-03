'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EntitlementSnapshot, FeatureKey } from '@/lib/entitlements';
import { canUseFeature } from '@/lib/entitlements';
import { useActiveCompany } from '@/hooks/useActiveCompany';

export function useEntitlements() {
  const { activeCompanyId } = useActiveCompany();
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompanyId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/entitlements?companyId=${encodeURIComponent(activeCompanyId)}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not load package entitlements.');
      }

      setSnapshot(result.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load package entitlements.');
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
    canUse: (featureKey: FeatureKey) => (snapshot ? canUseFeature(snapshot, featureKey) : false),
  };
}
