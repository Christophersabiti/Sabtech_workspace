'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Target, Plus, X, Calendar, CheckCircle2, AlertCircle,
  Clock, ChevronDown, ChevronRight, Eye, EyeOff, Upload, Download,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { Milestone, MilestoneStatus } from '@/types';
import { BulkUploadPanel, type ColumnDef } from './BulkUploadPanel';

type Props = {
  projectId: string;
  milestones: Milestone[];
  onRefresh: () => void;
};

const STATUS_COLORS: Record<MilestoneStatus, string> = {
  pending:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  missed:      'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<MilestoneStatus, React.ElementType> = {
  pending:     Clock,
  in_progress: Target,
  completed:   CheckCircle2,
  missed:      AlertCircle,
  cancelled:   X,
};

const STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending:     'Pending',
  in_progress: 'In Progress',
  completed:   'Completed',
  missed:      'Missed',
  cancelled:   'Cancelled',
};

type ReviewFormState = {
  status: MilestoneStatus;
  progress: string;
  target_date: string;
  actual_date: string;
  remarks: string;
  client_visible: boolean;
};

// ─── Bulk upload column definitions ─────────────────────────────────────────

function parseDateDMY(raw: string): { value: string | null; error: string | null } {
  const s = raw.trim();
  if (!s) return { value: null, error: null };
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { value: null, error: 'Use DD/MM/YYYY format.' };
  const [, d, mo, y] = m;
  const month = parseInt(mo, 10);
  const day   = parseInt(d, 10);
  if (month < 1 || month > 12) return { value: null, error: 'Invalid month.' };
  const mm = month < 10 ? `0${month}` : String(month);
  const dd  = day   < 10 ? `0${day}`   : String(day);
  return { value: `${y}-${mm}-${dd}`, error: null };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clampProgress(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function milestoneToReviewForm(milestone: Milestone): ReviewFormState {
  return {
    status: milestone.status,
    progress: String(milestone.progress ?? 0),
    target_date: milestone.target_date ?? '',
    actual_date: milestone.actual_date ?? '',
    remarks: milestone.remarks ?? '',
    client_visible: milestone.client_visible,
  };
}

function emptyReviewForm(): ReviewFormState {
  return {
    status: 'pending',
    progress: '0',
    target_date: '',
    actual_date: '',
    remarks: '',
    client_visible: true,
  };
}

const MILESTONE_STATUSES: MilestoneStatus[] = ['pending', 'in_progress', 'completed', 'missed', 'cancelled'];

const MILESTONE_COLUMNS: ColumnDef[] = [
  {
    key: 'name', header: 'Name', required: true, example: 'Design Sign-off',
    parse: (v) => v.trim() ? { value: v.trim(), error: null } : { value: null, error: 'Name is required.' },
  },
  {
    key: 'description', header: 'Description', required: false, example: 'Client approval of all design mockups',
    parse: (v) => ({ value: v.trim() || null, error: null }),
  },
  {
    key: 'target_date', header: 'Target Date', required: false, example: '31/12/2026',
    parse: (v) => { const r = parseDateDMY(v); return { value: r.value, error: r.error }; },
  },
  {
    key: 'status', header: 'Status', required: false, example: 'pending',
    allowed: MILESTONE_STATUSES,
    parse: (v) => {
      const s = v.trim().toLowerCase();
      if (!s) return { value: 'pending', error: null };
      const status = s as MilestoneStatus;
      if (!MILESTONE_STATUSES.includes(status)) return { value: 'pending', error: `Must be one of: ${MILESTONE_STATUSES.join(', ')}.` };
      return { value: status, error: null };
    },
  },
  {
    key: 'progress', header: 'Progress (0-100)', required: false, example: '0',
    parse: (v) => {
      if (!v.trim()) return { value: 0, error: null };
      const n = parseInt(v, 10);
      if (isNaN(n) || n < 0 || n > 100) return { value: 0, error: 'Must be 0–100.' };
      return { value: n, error: null };
    },
  },
  {
    key: 'remarks', header: 'Remarks', required: false, example: '',
    parse: (v) => ({ value: v.trim() || null, error: null }),
  },
  {
    key: 'client_visible', header: 'Client Visible (yes/no)', required: false, example: 'yes',
    allowed: ['yes', 'no'],
    parse: (v) => ({ value: v.trim().toLowerCase() !== 'no', error: null }),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MilestonesPanel({ projectId, milestones, onRefresh }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const [showForm, setShowForm]           = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm);

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate]   = useState('');
  const [clientVisible, setClientVisible] = useState(true);

  function openMilestoneReview(milestone: Milestone) {
    if (expandedId === milestone.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(milestone.id);
    setReviewForm(milestoneToReviewForm(milestone));
  }

  function updateReview<K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) {
    setReviewForm(current => ({ ...current, [key]: value }));
  }

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !activeCompanyId) return;
    setSaving(true);
    try {
      await supabase.from('milestones').insert({
        company_id:     activeCompanyId,
        project_id:     projectId,
        name:           name.trim(),
        description:    description.trim() || null,
        target_date:    targetDate || null,
        client_visible: clientVisible,
        sort_order:     milestones.length,
      });
      setName(''); setDescription(''); setTargetDate('');
      setShowForm(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }, [name, description, targetDate, clientVisible, activeCompanyId, projectId, milestones.length, supabase, onRefresh]);

  const updateStatus = useCallback(async (milestone: Milestone, status: MilestoneStatus) => {
    const payload = {
      status,
      progress: status === 'completed' ? 100 : milestone.progress,
      actual_date: status === 'completed' ? (milestone.actual_date ?? todayIso()) : milestone.actual_date,
    };

    await supabase
      .from('milestones')
      .update(payload)
      .eq('id', milestone.id)
      .eq('company_id', milestone.company_id);
    onRefresh();
  }, [supabase, onRefresh]);

  const saveReview = useCallback(async (milestone: Milestone) => {
    const status = reviewForm.status;
    const progress = status === 'completed' ? 100 : clampProgress(reviewForm.progress);
    const actualDate = status === 'completed'
      ? (reviewForm.actual_date || todayIso())
      : reviewForm.actual_date || null;

    setSavingReviewId(milestone.id);
    try {
      await supabase
        .from('milestones')
        .update({
          status,
          progress,
          target_date: reviewForm.target_date || null,
          actual_date: actualDate,
          remarks: reviewForm.remarks.trim() || null,
          client_visible: reviewForm.client_visible,
        })
        .eq('id', milestone.id)
        .eq('company_id', milestone.company_id);
      onRefresh();
    } finally {
      setSavingReviewId(null);
    }
  }, [reviewForm, supabase, onRefresh]);

  const pending   = milestones.filter(m => m.status === 'pending' || m.status === 'in_progress' || m.status === 'missed');
  const completed = milestones.filter(m => m.status === 'completed');
  const cancelled = milestones.filter(m => m.status === 'cancelled');
  const today = todayIso();
  const overdueCount = pending.filter(m => !!m.target_date && m.target_date < today && m.status !== 'missed').length;
  const dueSoonCount = pending.filter((m) => {
    if (!m.target_date || m.target_date < today) return false;
    const daysUntilDue = Math.ceil((new Date(`${m.target_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
    return daysUntilDue <= 7;
  }).length;

  function downloadMilestoneTemplate() {
    const headers = MILESTONE_COLUMNS.map(c => c.header).join(',');
    const notes   = `# Notes: ${MILESTONE_COLUMNS.map(c => [c.required ? 'REQUIRED' : '', c.allowed ? `Allowed: ${c.allowed.join('/')}` : ''].filter(Boolean).join(' | ')).join(',')}`;
    const example = MILESTONE_COLUMNS.map(c => c.example ?? '').join(',');
    const csv  = [headers, notes, example].join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'milestones-template.csv'; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Target className="w-4 h-4 text-violet-500" />
          Milestones ({milestones.length})
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={downloadMilestoneTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-slate-600 bg-white border border-slate-200 rounded-lg
                       hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setShowBulkUpload(!showBulkUpload); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Bulk Upload
          </button>
          <button
            type="button"
            onClick={() => { setShowBulkUpload(false); setShowForm(!showForm); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Active', value: pending.length, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: 'Due 7 days', value: dueSoonCount, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
          { label: 'Overdue', value: overdueCount, tone: 'bg-red-50 text-red-700 border-red-100' },
          { label: 'Completed', value: completed.length, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        ].map(item => (
          <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.tone}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-75">{item.label}</p>
            <p className="text-lg font-bold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Bulk upload panel */}
      {showBulkUpload && activeCompanyId && (
        <BulkUploadPanel
          columns={MILESTONE_COLUMNS}
          templateFilename="milestones-template.csv"
          apiEndpoint={`/api/projects/${projectId}/milestones/bulk-import`}
          companyId={activeCompanyId}
          entityLabel="milestone"
          open={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { onRefresh(); setShowBulkUpload(false); }}
        />
      )}

      {/* Single add form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Milestone name..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)..." rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <div className="flex gap-3">
            <input
              type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} className="rounded border-slate-300" />
              {clientVisible ? <Eye className="w-4 h-4 text-sky-500" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
              Client visible
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!name.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? 'Saving...' : 'Create Milestone'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Active milestones */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map(m => {
            const StatusIcon = STATUS_ICONS[m.status] || Clock;
            const isExpanded = expandedId === m.id;
            const isOverdue  = !!m.target_date && m.target_date < today && m.status !== 'missed';
            const isDueSoon = !!m.target_date && m.target_date >= today &&
              Math.ceil((new Date(`${m.target_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000) <= 7;
            const reviewProgress = clampProgress(reviewForm.progress);
            return (
              <div key={m.id} className={`border rounded-xl overflow-hidden ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                <button onClick={() => openMilestoneReview(m)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <StatusIcon className={`w-4 h-4 ${m.status === 'missed' ? 'text-red-500' : 'text-violet-500'}`} />
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[m.status]}`}>{STATUS_LABELS[m.status]}</span>
                  <span className="text-sm font-medium text-slate-700 flex-1 text-left truncate">{m.name}</span>
                  {m.client_visible && <Eye className="w-3.5 h-3.5 text-sky-400" />}
                  {m.target_date && (
                    <span className={`inline-flex items-center gap-1 text-xs ${
                      isOverdue ? 'text-red-500 font-medium' : isDueSoon ? 'text-amber-600 font-medium' : 'text-slate-500'
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {m.target_date}
                    </span>
                  )}
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${m.progress}%` }} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
                    {m.description && <p className="text-sm text-slate-600">{m.description}</p>}

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Review Status</label>
                        <select
                          value={reviewForm.status}
                          onChange={(e) => {
                            const status = e.target.value as MilestoneStatus;
                            setReviewForm(current => ({
                              ...current,
                              status,
                              progress: status === 'completed' ? '100' : current.progress,
                              actual_date: status === 'completed' && !current.actual_date ? today : current.actual_date,
                            }));
                          }}
                          className="w-full px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {MILESTONE_STATUSES.map(status => (
                            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Target Date</label>
                        <input
                          type="date"
                          value={reviewForm.target_date}
                          onChange={e => updateReview('target_date', e.target.value)}
                          className="w-full px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Actual Date</label>
                        <input
                          type="date"
                          value={reviewForm.actual_date}
                          onChange={e => updateReview('actual_date', e.target.value)}
                          className="w-full px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>

                      <label className="flex items-end gap-2 text-xs text-slate-600 cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={reviewForm.client_visible}
                          onChange={e => updateReview('client_visible', e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        {reviewForm.client_visible ? <Eye className="w-4 h-4 text-sky-500" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                        Client visible
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-500">Progress Review</label>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">{reviewProgress}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={reviewProgress}
                          onChange={e => updateReview('progress', e.target.value)}
                          className="flex-1 accent-violet-500"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={reviewForm.progress}
                          onChange={e => updateReview('progress', e.target.value)}
                          className="w-16 px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Review Remarks</label>
                      <textarea
                        value={reviewForm.remarks}
                        onChange={e => updateReview('remarks', e.target.value)}
                        placeholder="Decision notes, completion evidence, blockers, or client review feedback..."
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveReview(m)}
                        disabled={savingReviewId === m.id}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {savingReviewId === m.id ? 'Saving...' : 'Save Review'}
                      </button>
                      {m.status === 'pending' && (
                        <button onClick={() => updateStatus(m, 'in_progress')}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">Start</button>
                      )}
                      {m.status !== 'completed' && (
                        <button onClick={() => updateStatus(m, 'completed')}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">Mark Complete</button>
                      )}
                      {isOverdue && m.status !== 'missed' && (
                        <button onClick={() => updateStatus(m, 'missed')}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">Mark Missed</button>
                      )}
                      {m.status !== 'cancelled' && (
                        <button onClick={() => updateStatus(m, 'cancelled')}
                          className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">Cancel</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed milestones */}
      {completed.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Completed ({completed.length})</p>
          <div className="space-y-1">
            {completed.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-slate-600 flex-1 line-through">{m.name}</span>
                <span className="text-xs text-slate-400">{m.actual_date || m.target_date || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cancelled.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Cancelled ({cancelled.length})</p>
          <div className="space-y-1">
            {cancelled.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500 flex-1">{m.name}</span>
                {m.target_date && <span className="text-xs text-slate-400">{m.target_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {milestones.length === 0 && !showForm && !showBulkUpload && (
        <div className="text-center py-8 text-sm text-slate-400">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No milestones yet. Add your first one or use Bulk Upload.
        </div>
      )}
    </div>
  );
}
