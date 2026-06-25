'use client';

import { Loader2, FileText, AlertTriangle, CheckCircle2, Clock, Target } from 'lucide-react';
import type { ReportData } from '@/types';

type Props = {
  reportData: ReportData | null;
  loading: boolean;
  executiveSummary: string;
  onSummaryChange: (s: string) => void;
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    in_progress: 'bg-blue-100 text-blue-700',
    blocked: 'bg-red-100 text-red-700',
    pending: 'bg-slate-100 text-slate-600',
    backlog: 'bg-slate-100 text-slate-500',
    in_review: 'bg-violet-100 text-violet-700',
    cancelled: 'bg-gray-100 text-gray-500',
    open: 'bg-amber-100 text-amber-700',
    mitigated: 'bg-blue-100 text-blue-600',
    resolved: 'bg-emerald-100 text-emerald-600',
    missed: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[status] || 'bg-slate-100 text-slate-500'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function ReportPreview({ reportData, loading, executiveSummary, onSummaryChange }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Generating preview...</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <FileText className="w-10 h-10 mb-3" />
        <p className="text-sm">Configure your report to see a preview</p>
      </div>
    );
  }

  const { company, client, projects, tasks, milestones, raidEntries, financialSummary } = reportData;

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const pendingTasks = tasks.filter(t => ['pending', 'backlog', 'in_progress', 'in_review'].includes(t.status)).length;
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length;
  const overdueTasks = tasks.filter(t => {
    if (!t.due_date || t.status === 'completed') return false;
    return new Date(t.due_date) < new Date();
  }).length;
  const progressPercent = tasks.length > 0
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
    : 0;

  return (
    <div className="space-y-6 max-w-[800px] mx-auto">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold">{company?.company_name || 'Company'}</h2>
        <p className="text-xs text-slate-300 mt-1">
          {[company?.email, company?.phone, company?.website].filter(Boolean).join('  •  ')}
        </p>
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-medium">Client Report</p>
            {client && <p className="text-xs text-slate-300">{client.name}</p>}
          </div>
          <div className="text-right text-xs text-slate-300">
            <p>{projects.length} project{projects.length !== 1 ? 's' : ''} included</p>
            <p>Generated: {new Date(reportData.generatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* ─── Executive Summary ────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-500" /> Executive Summary
        </h3>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
            <p className="text-xs text-slate-500">Total Tasks</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completedTasks}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{blockedTasks}</p>
            <p className="text-xs text-slate-500">Blocked</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{overdueTasks}</p>
            <p className="text-xs text-slate-500">Overdue</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Overall Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Editable narrative */}
        <textarea
          value={executiveSummary}
          onChange={e => onSummaryChange(e.target.value)}
          placeholder="Add an executive summary... (editable, will appear in the exported report)"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none
                     focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                     placeholder:text-slate-400"
        />
      </div>

      {/* ─── Financial Summary ────────────────────────────────── */}
      {financialSummary && (
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <span className="text-emerald-500">$</span> Financial Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Budget', value: financialSummary.totalBudget, color: 'text-slate-800' },
              { label: 'Invoiced', value: financialSummary.totalInvoiced, color: 'text-blue-600' },
              { label: 'Paid', value: financialSummary.totalPaid, color: 'text-emerald-600' },
              { label: 'Outstanding', value: financialSummary.totalOutstanding, color: 'text-orange-600' },
              { label: 'Expenses', value: financialSummary.totalExpenses, color: 'text-red-600' },
              { label: 'Est. Profit', value: financialSummary.estimatedProfitLoss, color: financialSummary.estimatedProfitLoss >= 0 ? 'text-emerald-600' : 'text-red-600' },
            ].map(item => (
              <div key={item.label} className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Task Table ───────────────────────────────────────── */}
      {tasks.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">
              Tasks ({tasks.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Project</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Task</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Priority</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Due</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.slice(0, 20).map(task => (
                  <tr key={task.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-xs text-slate-500 max-w-[120px] truncate">{task.project_name}</td>
                    <td className="px-4 py-2 text-xs font-medium text-slate-700 max-w-[180px] truncate">{task.title}</td>
                    <td className="px-4 py-2"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-2 text-xs text-slate-600 capitalize">{task.priority}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{task.due_date || '—'}</td>
                    <td className="px-4 py-2 text-xs text-right text-slate-600">{task.progress}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tasks.length > 20 && (
              <p className="px-4 py-2 text-xs text-slate-400 text-center">
                ... and {tasks.length - 20} more tasks (full list in export)
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Milestones ───────────────────────────────────────── */}
      {milestones.length > 0 && (
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-violet-500" /> Milestones ({milestones.length})
          </h3>
          <div className="space-y-2">
            {milestones.map(m => (
              <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <StatusBadge status={m.status} />
                  <span className="text-sm text-slate-700">{m.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{m.target_date || '—'}</span>
                  <span className="font-medium">{m.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── RAID ─────────────────────────────────────────────── */}
      {raidEntries.length > 0 && (
        <div className="border border-red-200 rounded-xl p-5 bg-red-50/30">
          <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Risks & Issues ({raidEntries.length})
          </h3>
          <div className="space-y-2">
            {raidEntries.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-red-100">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full capitalize
                    ${r.type === 'risk' ? 'bg-red-100 text-red-600' :
                      r.type === 'issue' ? 'bg-amber-100 text-amber-600' :
                      r.type === 'decision' ? 'bg-blue-100 text-blue-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                    {r.type}
                  </span>
                  <span className="text-sm text-slate-700">{r.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium capitalize
                    ${r.severity === 'critical' ? 'text-red-600' :
                      r.severity === 'high' ? 'text-orange-600' :
                      r.severity === 'medium' ? 'text-amber-600' :
                      'text-slate-500'
                    }`}>
                    {r.severity}
                  </span>
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Footer preview ───────────────────────────────────── */}
      <div className="text-center py-3 border-t border-slate-200">
        <p className="text-xs text-slate-400">
          CONFIDENTIAL — For intended recipient only • Generated by Sabtech Workspace
        </p>
      </div>
    </div>
  );
}
