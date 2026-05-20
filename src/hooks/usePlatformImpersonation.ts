'use client';

import { useCallback, useEffect, useState } from 'react';

export const PLATFORM_IMPERSONATION_KEY = 'sabtech_platform_impersonation';
export const PLATFORM_IMPERSONATION_EVENT = 'sabtech-platform-impersonation-change';

export type PlatformImpersonationState = {
  sessionId: string;
  companyId: string;
  companyName: string;
  startedAt: string;
};

function readStoredImpersonation(): PlatformImpersonationState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PLATFORM_IMPERSONATION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PlatformImpersonationState;
  } catch {
    window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY);
    return null;
  }
}

export function usePlatformImpersonation() {
  const [impersonation, setImpersonation] = useState<PlatformImpersonationState | null>(null);

  const refresh = useCallback(() => {
    setImpersonation(readStoredImpersonation());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(PLATFORM_IMPERSONATION_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PLATFORM_IMPERSONATION_EVENT, refresh);
    };
  }, [refresh]);

  const setStoredImpersonation = useCallback((next: PlatformImpersonationState) => {
    window.localStorage.setItem(PLATFORM_IMPERSONATION_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(PLATFORM_IMPERSONATION_EVENT));
    setImpersonation(next);
  }, []);

  const clearStoredImpersonation = useCallback(() => {
    window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY);
    window.dispatchEvent(new Event(PLATFORM_IMPERSONATION_EVENT));
    setImpersonation(null);
  }, []);

  return {
    impersonation,
    setStoredImpersonation,
    clearStoredImpersonation,
  };
}
