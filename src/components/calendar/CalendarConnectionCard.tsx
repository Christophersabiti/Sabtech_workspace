'use client';

import { useState } from 'react';
import { CheckCircle2, Unlink, RefreshCw, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import type { CalendarConnection, SyncDirection, ImportMode } from '@/types/calendar';

type Props = {
  connection: CalendarConnection | null;
  provider: 'google' | 'microsoft';
  companyId: string;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
  onSync: () => Promise<{ synced: number; failed: number }>;
  onUpdateSettings: (settings: { sync_direction?: SyncDirection; import_mode?: ImportMode; sync_enabled?: boolean }) => Promise<void>;
};

const PROVIDER_META = {
  google: {
    name:    'Google Calendar',
    icon:    '🗓️',
    color:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700',
    btn:     'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm',
    connect: 'Connect Google Calendar',
  },
  microsoft: {
    name:    'Microsoft Outlook / Teams',
    icon:    '📅',
    color:   'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700',
    btn:     'bg-indigo-600 hover:bg-indigo-700 text-white',
    connect: 'Connect Outlook Calendar',
  },
};

export function CalendarConnectionCard({
  connection, provider, companyId, onConnect, onDisconnect, onSync, onUpdateSettings,
}: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [syncResult, setSyncResult]       = useState<{ synced: number; failed: number } | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const meta = PROVIDER_META[provider];

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${meta.name}? Events already synced will remain in your external calendar.`)) return;
    setDisconnecting(true);
    try { await onDisconnect(); } finally { setDisconnecting(false); }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await onSync();
      setSyncResult(result);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSetting(key: string, value: unknown) {
    setUpdatingSettings(true);
    try { await onUpdateSettings({ [key]: value }); } finally { setUpdatingSettings(false); }
  }

  if (!connection) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">{meta.icon}</div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{meta.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {provider === 'google'
                ? 'Connect your Google Calendar to sync Sabtech events and meetings.'
                : 'Connect Outlook or Teams calendar for Microsoft 365 integration.'}
            </p>
            {provider === 'microsoft' && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Microsoft integration available in Phase 2.
              </p>
            )}
          </div>
          <button
            onClick={onConnect}
            disabled={provider === 'microsoft'}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              provider === 'microsoft'
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800'
                : meta.btn
            }`}
          >
            {meta.connect}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-2xl p-6 ${meta.color}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="text-3xl">{meta.icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{meta.name}</h3>
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />Connected
              </span>
            </div>
            {connection.provider_account_email && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {connection.provider_account_email}
              </p>
            )}
            {connection.last_sync_at && (
              <p className="text-xs text-slate-500 mt-1">
                Last synced: {new Date(connection.last_sync_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync pending events"
            className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            title="Disconnect"
            className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            <Unlink className="w-4 h-4" />
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={`mt-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
          syncResult.failed > 0
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
            : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
        }`}>
          {syncResult.failed > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Synced {syncResult.synced} event{syncResult.synced !== 1 ? 's' : ''}
          {syncResult.failed > 0 && ` — ${syncResult.failed} failed`}
        </div>
      )}

      {/* Settings */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/40 dark:border-slate-700/40">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Sync direction</label>
          <select
            value={connection.sync_direction}
            onChange={(e) => handleSetting('sync_direction', e.target.value)}
            disabled={updatingSettings}
            className="w-full bg-white dark:bg-slate-800 border border-white dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="outbound">Sabtech → Google (outbound)</option>
            <option value="inbound">Google → Sabtech (inbound)</option>
            <option value="both">Two-way sync</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Import mode</label>
          <select
            value={connection.import_mode}
            onChange={(e) => handleSetting('import_mode', e.target.value)}
            disabled={updatingSettings}
            className="w-full bg-white dark:bg-slate-800 border border-white dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="new_only">New Sabtech events only</option>
            <option value="from_today">All events from today</option>
            <option value="all">Import all events</option>
            <option value="none">Do not import</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={connection.sync_enabled}
              onChange={(e) => handleSetting('sync_enabled', e.target.checked)}
              disabled={updatingSettings}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-slate-600 dark:text-slate-400">Enable automatic sync</span>
          </label>
        </div>
      </div>
    </div>
  );
}
