'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';

/**
 * Sticky banner shown at the top of the page when the device is offline,
 * or briefly after a sync completes.
 */
export function OfflineBanner() {
  const { isOnline, isSyncing, lastSyncedAt, triggerSync } = useOnlineStatus();

  if (isOnline && !isSyncing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium shadow-md transition-all ${
        isOnline
          ? 'bg-purple-600 text-white'   /* syncing — purple to match brand */
          : 'bg-amber-500 text-white'    /* offline — amber warning */
      }`}
    >
      <span className="flex items-center gap-2">
        {isOnline ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Syncing data…
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            You&apos;re offline — showing cached data
          </>
        )}
      </span>

      <span className="flex items-center gap-3">
        {lastSyncedAt && (
          <span className="hidden sm:flex items-center gap-1 opacity-80 text-xs font-normal">
            <CheckCircle2 className="h-3 w-3" />
            Last synced {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {!isOnline && (
          <button
            onClick={triggerSync}
            disabled={isSyncing}
            className="rounded bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30 disabled:opacity-50 transition-colors"
          >
            Retry sync
          </button>
        )}
      </span>
    </div>
  );
}
