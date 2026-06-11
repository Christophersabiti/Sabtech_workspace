'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, ArrowLeft, Clock, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { CalendarConnectionCard } from '@/components/calendar/CalendarConnectionCard';
import { BookingLinkManager } from '@/components/calendar/BookingLinkManager';
import type { CalendarConnection, SyncDirection, ImportMode } from '@/types/calendar';

type ConnectionSettings = {
  sync_direction?: SyncDirection;
  import_mode?: ImportMode;
  sync_enabled?: boolean;
};

type WorkingHoursDay = { enabled: boolean; start: string; end: string };
type WorkingHours = {
  monday:    WorkingHoursDay;
  tuesday:   WorkingHoursDay;
  wednesday: WorkingHoursDay;
  thursday:  WorkingHoursDay;
  friday:    WorkingHoursDay;
  saturday:  WorkingHoursDay;
  sunday:    WorkingHoursDay;
};

const DEFAULT_HOURS: WorkingHours = {
  monday:    { enabled: true,  start: '09:00', end: '17:00' },
  tuesday:   { enabled: true,  start: '09:00', end: '17:00' },
  wednesday: { enabled: true,  start: '09:00', end: '17:00' },
  thursday:  { enabled: true,  start: '09:00', end: '17:00' },
  friday:    { enabled: true,  start: '09:00', end: '17:00' },
  saturday:  { enabled: false, start: '09:00', end: '13:00' },
  sunday:    { enabled: false, start: '09:00', end: '13:00' },
};

const DAY_LABELS: { key: keyof WorkingHours; label: string }[] = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
];

export default function CalendarSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Availability / working hours state
  const [workingHours, setWorkingHours] = useState<WorkingHours>(DEFAULT_HOURS);
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter]   = useState(15);
  const [timezone, setTimezone]         = useState('Africa/Kampala');
  const [availId, setAvailId]           = useState<string | null>(null);
  const [savingAvail, setSavingAvail]   = useState(false);

  const connectedParam = searchParams.get('connected');
  const errorParam     = searchParams.get('error');

  useEffect(() => {
    if (connectedParam === 'google') {
      setToast({ type: 'success', message: 'Google Calendar connected successfully!' });
      router.replace('/settings/calendar');
    } else if (connectedParam === 'microsoft') {
      setToast({ type: 'success', message: 'Microsoft Outlook connected successfully!' });
      router.replace('/settings/calendar');
    } else if (errorParam) {
      const messages: Record<string, string> = {
        access_denied:         'Calendar access was denied. Please try again.',
        oauth_error:           'An error occurred during sign-in.',
        token_exchange_failed: 'Failed to exchange tokens. Please try again.',
        db_error:              'Failed to save connection. Please try again.',
        user_mismatch:         'User mismatch detected. Please log out and try again.',
      };
      setToast({ type: 'error', message: messages[errorParam] ?? 'Connection failed. Please try again.' });
      router.replace('/settings/calendar');
    }
  }, [connectedParam, errorParam, router]);

  const fetchConnections = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/connections?company_id=${activeCompanyId}`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  const fetchAvailability = useCallback(async () => {
    if (!activeCompanyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_availability_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', activeCompanyId)
      .maybeSingle();
    if (data) {
      setAvailId(data.id);
      if (data.working_hours) setWorkingHours({ ...DEFAULT_HOURS, ...data.working_hours });
      if (data.buffer_before_minutes != null) setBufferBefore(data.buffer_before_minutes);
      if (data.buffer_after_minutes  != null) setBufferAfter(data.buffer_after_minutes);
      if (data.timezone)                      setTimezone(data.timezone);
    }
  }, [activeCompanyId, supabase]);

  useEffect(() => { fetchConnections(); fetchAvailability(); }, [fetchConnections, fetchAvailability]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function getConnection(provider: 'google' | 'microsoft') {
    return connections.find((c) => c.provider === provider) ?? null;
  }

  function handleConnect(provider: 'google' | 'microsoft') {
    if (!activeCompanyId) return;
    if (provider === 'google') {
      window.location.href = `/api/calendar/connect/google?company_id=${activeCompanyId}`;
    } else {
      window.location.href = `/api/calendar/connect/microsoft?company_id=${activeCompanyId}`;
    }
  }

  async function handleDisconnect(provider: 'google' | 'microsoft') {
    const conn = getConnection(provider);
    if (!conn || !activeCompanyId) return;
    const res = await fetch(`/api/calendar/connections/${conn.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: activeCompanyId }),
    });
    if (res.ok) {
      setToast({ type: 'success', message: `${provider === 'google' ? 'Google Calendar' : 'Outlook'} disconnected.` });
      await fetchConnections();
    } else {
      setToast({ type: 'error', message: 'Failed to disconnect. Please try again.' });
    }
  }

  async function handleSync(provider: 'google' | 'microsoft') {
    if (!activeCompanyId) return { synced: 0, failed: 0 };
    const res = await fetch('/api/calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: activeCompanyId }),
    });
    if (res.ok) return res.json() as Promise<{ synced: number; failed: number }>;
    return { synced: 0, failed: 0 };
  }

  async function handleUpdateSettings(provider: 'google' | 'microsoft', settings: ConnectionSettings) {
    const conn = getConnection(provider);
    if (!conn || !activeCompanyId) return;
    const res = await fetch(`/api/calendar/connections/${conn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: activeCompanyId, ...settings }),
    });
    if (res.ok) await fetchConnections();
    else setToast({ type: 'error', message: 'Failed to update settings.' });
  }

  async function handleSaveAvailability() {
    if (!activeCompanyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingAvail(true);
    try {
      const payload = {
        user_id:               user.id,
        company_id:            activeCompanyId,
        working_hours:         workingHours,
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes:  bufferAfter,
        timezone,
        updated_at:            new Date().toISOString(),
      };
      if (availId) {
        await supabase.from('user_availability_settings').update(payload).eq('id', availId);
      } else {
        const { data } = await supabase
          .from('user_availability_settings')
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select('id')
          .single();
        if (data) setAvailId(data.id);
      }
      setToast({ type: 'success', message: 'Availability settings saved.' });
    } finally {
      setSavingAvail(false);
    }
  }

  function setDay(day: keyof WorkingHours, patch: Partial<WorkingHoursDay>) {
    setWorkingHours((wh) => ({ ...wh, [day]: { ...wh[day], ...patch } }));
  }

  const TIMEZONES = [
    'Africa/Kampala', 'Africa/Nairobi', 'UTC', 'Europe/London',
    'America/New_York', 'America/Los_Angeles', 'Asia/Dubai',
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Back link */}
      <button
        onClick={() => router.push('/calendar')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Calendar
      </button>

      {/* ── Section: Calendar connections ── */}
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Calendar Integrations</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Connect external calendars to sync Sabtech events, meetings, and tasks.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <CalendarConnectionCard
              provider="google"
              connection={getConnection('google')}
              companyId={activeCompanyId ?? ''}
              onConnect={() => handleConnect('google')}
              onDisconnect={() => handleDisconnect('google')}
              onSync={() => handleSync('google')}
              onUpdateSettings={(s) => handleUpdateSettings('google', s)}
            />
            <CalendarConnectionCard
              provider="microsoft"
              connection={getConnection('microsoft')}
              companyId={activeCompanyId ?? ''}
              onConnect={() => handleConnect('microsoft')}
              onDisconnect={() => handleDisconnect('microsoft')}
              onSync={() => handleSync('microsoft')}
              onUpdateSettings={(s) => handleUpdateSettings('microsoft', s)}
            />
          </div>
        )}

        {/* Setup guide */}
        <div className="mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Setup Requirements</h2>
          <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Google Calendar</p>
              <pre className="bg-slate-900 dark:bg-slate-950 text-green-400 text-xs rounded-lg p-3 overflow-x-auto">
{`GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
CALENDAR_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Microsoft Outlook / Teams</p>
              <pre className="bg-slate-900 dark:bg-slate-950 text-green-400 text-xs rounded-lg p-3 overflow-x-auto">
{`MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_CLIENT_SECRET=your-azure-app-client-secret
# Optional — defaults to 'common' (all orgs + personal):
MICROSOFT_TENANT_ID=common`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Optional services</p>
              <pre className="bg-slate-900 dark:bg-slate-950 text-green-400 text-xs rounded-lg p-3 overflow-x-auto">
{`ANTHROPIC_API_KEY=sk-ant-...    # AI scheduling suggestions
RESEND_API_KEY=re_...           # Email reminders
CRON_SECRET=your-secret         # Protects reminder cron endpoint`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: Booking Links ── */}
      <section className="border-t border-slate-200 dark:border-slate-700 pt-8">
        {activeCompanyId && <BookingLinkManager companyId={activeCompanyId} />}
      </section>

      {/* ── Section: Availability / Working Hours ── */}
      <section className="border-t border-slate-200 dark:border-slate-700 pt-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Availability &amp; Working Hours
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Define when you&apos;re available for meetings. Booking links will only offer slots within these hours.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
          {/* Timezone */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 shrink-0">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Buffer */}
          <div className="px-5 py-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Buffer before</label>
              <select
                value={bufferBefore}
                onChange={(e) => setBufferBefore(Number(e.target.value))}
                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
              >
                {[0,5,10,15,30].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Buffer after</label>
              <select
                value={bufferAfter}
                onChange={(e) => setBufferAfter(Number(e.target.value))}
                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
              >
                {[0,5,10,15,30].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
          </div>

          {/* Days */}
          {DAY_LABELS.map(({ key, label }) => (
            <div key={key} className="px-5 py-3 flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer w-32 shrink-0">
                <input
                  type="checkbox"
                  checked={workingHours[key].enabled}
                  onChange={(e) => setDay(key, { enabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className={`text-sm font-medium ${workingHours[key].enabled ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                  {label}
                </span>
              </label>
              {workingHours[key].enabled ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="time"
                    value={workingHours[key].start}
                    onChange={(e) => setDay(key, { start: e.target.value })}
                    className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
                  />
                  <span>—</span>
                  <input
                    type="time"
                    value={workingHours[key].end}
                    onChange={(e) => setDay(key, { end: e.target.value })}
                    className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">Unavailable</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveAvailability}
            disabled={savingAvail}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {savingAvail ? 'Saving…' : 'Save availability'}
          </button>
        </div>
      </section>
    </div>
  );
}
