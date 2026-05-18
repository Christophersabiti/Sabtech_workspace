'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { runSync } from '@/services/syncService';

interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline,     setIsOnline]     = useState(true);
  const [isSyncing,    setIsSyncing]    = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  // Prevent double-syncing when multiple events fire in rapid succession
  const syncInFlight = useRef(false);

  const triggerSync = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setIsSyncing(true);
    try {
      await runSync();
      setLastSyncedAt(new Date());
    } finally {
      setIsSyncing(false);
      syncInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // Initialise from navigator
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync on mount if online
    if (navigator.onLine) triggerSync();

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync]);

  return { isOnline, isSyncing, lastSyncedAt, triggerSync };
}
