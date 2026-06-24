'use client';

import React, { useEffect } from 'react';
import { SWRConfig } from 'swr';
import type { State } from 'swr';

const CACHE_KEY = 'sabtech_swr_cache';
const TTL = 1000 * 60 * 60; // 1 hour

function createPersistentCache(): Map<string, State<unknown>> {
  const cache = new Map<string, State<unknown>>();

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as [string, { value: State<unknown>; timestamp: number }][];
        const now = Date.now();
        for (const [key, item] of parsed) {
          if (now - item.timestamp < TTL) {
            cache.set(key, item.value);
          }
        }
      }
    } catch (e) {
      console.error('[CacheProvider] Failed to restore cache:', e);
    }
  }

  return cache;
}

const persistentCache = createPersistentCache();

export function CacheProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleSave = () => {
      try {
        const cacheArray: [string, { value: State<unknown>; timestamp: number }][] = [];
        const now = Date.now();
        persistentCache.forEach((value, key) => {
          // Only cache successful responses (avoid caching errors or transient states)
          if (value && typeof key === 'string' && !key.startsWith('$swr$e:')) {
            cacheArray.push([key, { value, timestamp: now }]);
          }
        });
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheArray));
      } catch (e) {
        console.error('[CacheProvider] Failed to persist cache:', e);
      }
    };

    window.addEventListener('beforeunload', handleSave);
    const interval = setInterval(handleSave, 10000); // Save every 10 seconds

    return () => {
      window.removeEventListener('beforeunload', handleSave);
      clearInterval(interval);
      handleSave();
    };
  }, []);

  return (
    <SWRConfig
      value={{
        provider: () => persistentCache,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000, // Deduplicate identical fetches within 2 seconds
      }}
    >
      {children}
    </SWRConfig>
  );
}

/**
 * Utility to clear the persistent query cache (e.g., on sign-out)
 */
export function clearQueryCache() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(CACHE_KEY);
      persistentCache.clear();
    } catch (e) {
      console.error('[CacheProvider] Failed to clear cache:', e);
    }
  }
}
