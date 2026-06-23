'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Target, Plus, X, Calendar, CheckCircle2, AlertCircle,
  Clock, ChevronDown, ChevronRight, Eye, EyeOff, Upload, Download,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { Milestone } from '@/types';
import { BulkUploadPanel, type ColumnDef } from './BulkUploadPanel';

type Props = {
  projectId: string;
  milestones: Milestone[];
  onRefresh: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  missed:      'bg-red-100 text-red-700',
  cancelled:   'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:     Clock,
  in_progress: Target,
  completed:   CheckCircle2,
  missed:      AlertCircle,
  cancelled:   X,
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

const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'missed', 'cancelled'];

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
      if (!MILESTONE_STATUSES.includes(s)) return { value: 'pending', error: `Must be one of: ${MILESTONE_STATUSES.join(', ')}.` };
      return { value: s, error: null };
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

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate]   = useState('');
  const [clientVisible, setClientVisible] = useState(true);

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

  const updateStatus = useCallback(async (id: string, status: string) => {
    await supabase.from('milestones').update({
      status,
      ...(status === 'completed' ? { actual_date: new Date().toISOString().split('T')[0], progress: 100 } : {}),
    }).eq('id', id);
    onRefresh();
  }, [supabase, onRefresh]);

  const pending   = milestones.filter(m => m.status === 'pending' || m.status === 'in_progress');
  const completed = milestones.filter(m => m.status === 'completed');

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
          onSuccess={(count) => { onRefresh(); setShowBulkUpload(false); }}
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
            const isOverdue  = m.target_date && new Date(m.target_date) < new Date() && m.status !== 'completed';
            return (
              <div key={m.id} className={`border rounded-xl overflow-hidden ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                <button onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[m.status]}`}>{m.status.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-medium text-slate-700 flex-1 text-left truncate">{m.name}</span>
                  {m.client_visible && <Eye className="w-3.5 h-3.5 text-sky-400" />}
                  {m.target_date && (
                    <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-500'}`}>{m.target_date}</span>
                  )}
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${m.progress}%` }} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
                    {m.description && <p className="text-sm text-slate-600">{m.description}</p>}
                    {m.remarks && <p className="text-xs text-slate-500 italic">{m.remarks}</p>}
                    <div className="flex gap-2">
                      {m.status !== 'completed' && (
                        <button onClick={() => updateStatus(m.id, 'completed')}
                          className="px-3 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">Mark Complete</button>
                      )}
                      {m.status === 'pending' && (
                        <button onClick={() => updateStatus(m.id, 'in_progress')}
                          className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">Start</button>
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

      {milestones.length === 0 && !showForm && !showBulkUpload && (
        <div className="text-center py-8 text-sm text-slate-400">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No milestones yet. Add your first one or use Bulk Upload.
        </div>
      )}
    </div>
  );
}
