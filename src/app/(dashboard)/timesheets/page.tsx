'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Clock, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';

type TimeLog = {
  id: string;
  task_id: string;
  user_id: string | null;
  hours_logged: number;
  log_date: string;
  description: string | null;
  is_billable: boolean;
  created_at: string;
  task?: {
    title: string;
    project?: {
      project_name: string;
      project_code: string;
    };
  };
};

type Summary = {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  totalLogs: number;
};

const PERIODS = [
  { label: 'This Week',  days: 7 },
  { label: 'This Month', days: 30 },
  { label: 'Last 3 Months', days: 90 },
  { label: 'All Time',  days: 0 },
];

export default function TimesheetsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState(30);

  const fetchLogs = useCallback(async () => {
    if (!activeCompanyId) return [];

    let query = supabase
      .from('task_time_logs')
      .select(`
        *,
        task:project_tasks (
          title,
          project:projects ( project_name, project_code )
        )
      `)
      .eq('company_id', activeCompanyId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (periodDays > 0) {
      const from = new Date();
      from.setDate(from.getDate() - periodDays);
      query = query.gte('log_date', from.toISOString().slice(0, 10));
    }

    const { data } = await query.limit(500);
    return (data || []) as TimeLog[];
  }, [activeCompanyId, periodDays, supabase]);

  useEffect(() => {
    if (companyLoading || !activeCompanyId) return;

    let cancelled = false;
    void fetchLogs()
      .then((list) => {
        if (!cancelled) {
          setLogs(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeCompanyId, companyLoading, fetchLogs]);

  const summary: Summary = useMemo(() => {
    const totalHours     = logs.reduce((s, l) => s + (l.hours_logged || 0), 0);
    const billableHours  = logs.filter(l => l.is_billable).reduce((s, l) => s + (l.hours_logged || 0), 0);
    return {
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
      totalLogs: logs.length,
    };
  }, [logs]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, TimeLog[]>();
    for (const log of logs) {
      const date = log.log_date;
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(log);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [logs]);

  if (companyLoading || (Boolean(activeCompanyId) && loading)) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Timesheets"
        subtitle="All time logs across projects"
        action={
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p.days}
                onClick={() => {
                  setLoading(true);
                  setPeriodDays(p.days);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  periodDays === p.days
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Hours',       value: summary.totalHours.toFixed(1),       icon: Clock,         color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Billable Hours',    value: summary.billableHours.toFixed(1),    icon: DollarSign,    color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Non-Billable',      value: summary.nonBillableHours.toFixed(1), icon: AlertCircle,   color: 'bg-amber-50 border-amber-200 text-amber-800' },
          { label: 'Total Entries',     value: String(summary.totalLogs),           icon: CheckCircle,   color: 'bg-slate-50 border-slate-200 text-slate-800' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`rounded-xl border px-5 py-4 ${color}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4 opacity-70" />
              <p className="text-xs font-medium opacity-70">{label}</p>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Time log list */}
      {logs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No time logs found</p>
          <p className="text-slate-400 text-sm mt-1">Time logs can be added from within a project task</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, dayLogs]) => {
            const dayTotal = dayLogs.reduce((s, l) => s + (l.hours_logged || 0), 0);
            return (
              <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="text-sm font-semibold text-slate-700">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{dayTotal.toFixed(1)}h</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {dayLogs.map(log => (
                    <div key={log.id} className="flex items-start gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {log.task?.title || 'Unknown task'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {log.task?.project?.project_code} · {log.task?.project?.project_name}
                        </p>
                        {log.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{log.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-800">{log.hours_logged}h</p>
                        <span className={`mt-0.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          log.is_billable ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {log.is_billable ? 'Billable' : 'Non-billable'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
