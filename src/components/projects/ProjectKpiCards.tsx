'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Ban, TrendingUp, Users } from 'lucide-react';
import { EnhancedProjectTask } from './types';

type ProjectHealth = 'on_track' | 'at_risk' | 'delayed' | 'completed';

type Props = {
  tasks: EnhancedProjectTask[];
  projectEndDate: string | null;
};

function calcHealth(tasks: EnhancedProjectTask[], projectEndDate: string | null): ProjectHealth {
  if (tasks.length === 0) return 'on_track';
  const today = new Date().toISOString().slice(0, 10);
  const completed  = tasks.filter(t => t.status === 'completed').length;
  const totalDone  = completed / tasks.length;
  const blocked    = tasks.some(t => t.status === 'blocked');
  const overdueCritical = tasks.some(
    t => t.status !== 'completed' && t.status !== 'cancelled' && t.end_date && t.end_date < today && t.priority === 'critical',
  );
  if (totalDone === 1) return 'completed';
  if (projectEndDate && projectEndDate < today) return 'delayed';
  if (overdueCritical) return 'delayed';
  if (blocked) return 'at_risk';
  if (projectEndDate) {
    const daysLeft = Math.ceil(
      (new Date(projectEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    const avgProgress = tasks.reduce((a, t) => a + t.progress, 0) / tasks.length;
    if (daysLeft <= 7 && avgProgress < 60) return 'at_risk';
  }
  return 'on_track';
}

const HEALTH_CONFIG: Record<ProjectHealth, { label: string; bg: string; text: string; dot: string }> = {
  on_track:  { label: 'On Track',  bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
  at_risk:   { label: 'At Risk',   bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  delayed:   { label: 'Delayed',   bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
  completed: { label: 'Completed', bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
};

export function ProjectKpiCards({ tasks, projectEndDate }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const active     = tasks.filter(t => t.status !== 'cancelled');
    const completed  = tasks.filter(t => t.status === 'completed');
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'in_review');
    const blocked    = tasks.filter(t => t.status === 'blocked');
    const overdue    = tasks.filter(
      t => t.status !== 'completed' && t.status !== 'cancelled' && t.end_date && t.end_date < today,
    );
    const avgProgress = active.length
      ? Math.round(active.reduce((s, t) => s + t.progress, 0) / active.length)
      : 0;

    // Assignee workload
    const assigneeMap: Record<string, number> = {};
    tasks.forEach(t => {
      if (t.assigned_to) {
        assigneeMap[t.assigned_to] = (assigneeMap[t.assigned_to] || 0) + 1;
      }
    });
    const topAssignee = Object.entries(assigneeMap).sort((a, b) => b[1] - a[1])[0];

    return { active, completed, inProgress, blocked, overdue, avgProgress, topAssignee };
  }, [tasks, today]);

  const health = useMemo(() => calcHealth(tasks, projectEndDate), [tasks, projectEndDate]);
  const hc = HEALTH_CONFIG[health];

  const cards = [
    {
      label: 'Completed',
      value: `${kpis.completed.length}/${tasks.length}`,
      sub: tasks.length ? `${Math.round((kpis.completed.length / tasks.length) * 100)}% done` : 'No tasks yet',
      icon: CheckCircle2,
      iconColor: 'text-green-500',
      iconBg: 'bg-green-50',
    },
    {
      label: 'In Progress',
      value: String(kpis.inProgress.length),
      sub: `${kpis.blocked.length} blocked`,
      icon: Clock,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-50',
    },
    {
      label: 'Overdue',
      value: String(kpis.overdue.length),
      sub: kpis.overdue.length > 0 ? 'Needs attention' : 'All on schedule',
      icon: AlertTriangle,
      iconColor: kpis.overdue.length > 0 ? 'text-red-500' : 'text-gray-400',
      iconBg: kpis.overdue.length > 0 ? 'bg-red-50' : 'bg-gray-50',
    },
    {
      label: 'Avg Progress',
      value: `${kpis.avgProgress}%`,
      sub: 'Across active tasks',
      icon: TrendingUp,
      iconColor: 'text-violet-500',
      iconBg: 'bg-violet-50',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Health badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Project Health</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${hc.bg} ${hc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${hc.dot}`} />
          {hc.label}
        </span>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 flex items-start gap-3 shadow-xs">
            <div className={`p-2 rounded-lg ${c.iconBg} shrink-0`}>
              <c.icon className={`w-4 h-4 ${c.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-gray-900 leading-none mb-0.5">{c.value}</p>
              <p className="text-xs text-gray-500 leading-tight">{c.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Overall Progress</span>
            <span className="text-xs font-semibold text-gray-800">{kpis.avgProgress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-700"
              style={{ width: `${kpis.avgProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {kpis.inProgress.length} active
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {kpis.blocked.length} blocked
              </span>
            </div>
            {kpis.topAssignee && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Users className="w-3 h-3" />
                {kpis.topAssignee[0]} ({kpis.topAssignee[1]})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { calcHealth };
export type { ProjectHealth };
