'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Shield, Plus, AlertTriangle, Info, CheckCircle2, Lightbulb,
  ChevronDown, ChevronRight, Eye, EyeOff, X, Upload, Download,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { RaidEntry, RaidType, RaidSeverity, RaidStatus } from '@/types';
import { AttachmentsSection } from './AttachmentsSection';
import { BulkUploadPanel, type ColumnDef } from './BulkUploadPanel';

type Props = {
  projectId: string;
  entries: RaidEntry[];
  onRefresh: () => void;
};

const TYPE_CONFIG: Record<RaidType, { label: string; icon: React.ElementType; color: string }> = {
  risk:       { label: 'Risk',       icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  assumption: { label: 'Assumption', icon: Lightbulb,     color: 'bg-amber-100 text-amber-600' },
  issue:      { label: 'Issue',      icon: Info,          color: 'bg-orange-100 text-orange-600' },
  decision:   { label: 'Decision',   icon: CheckCircle2,  color: 'bg-blue-100 text-blue-600' },
};

const SEVERITY_COLORS: Record<RaidSeverity, string> = {
  low:      'bg-green-100 text-green-600',
  medium:   'bg-amber-100 text-amber-600',
  high:     'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600',
};

const STATUS_COLORS: Record<string, string> = {
  open:        'bg-blue-100 text-blue-600',
  in_progress: 'bg-violet-100 text-violet-600',
  mitigated:   'bg-emerald-100 text-emerald-600',
  resolved:    'bg-green-100 text-green-600',
  closed:      'bg-slate-100 text-slate-500',
  accepted:    'bg-amber-100 text-amber-600',
};

const FILTER_TYPES: RaidType[] = ['risk', 'assumption', 'issue', 'decision'];

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

const RAID_TYPES       = ['risk', 'assumption', 'issue', 'decision'];
const RAID_SEVERITIES  = ['low', 'medium', 'high', 'critical'];
const RAID_PROBS       = ['low', 'medium', 'high'];
const RAID_STATUSES    = ['open', 'in_progress', 'mitigated', 'resolved', 'closed', 'accepted'];

const RAID_COLUMNS: ColumnDef[] = [
  {
    key: 'type', header: 'Type', required: true, example: 'risk',
    allowed: RAID_TYPES,
    parse: (v) => {
      const s = v.trim().toLowerCase();
      if (!s) return { value: null, error: 'Type is required.' };
      if (!RAID_TYPES.includes(s)) return { value: null, error: `Must be: ${RAID_TYPES.join(', ')}.` };
      return { value: s, error: null };
    },
  },
  {
    key: 'title', header: 'Title', required: true, example: 'Database migration failure',
    parse: (v) => v.trim() ? { value: v.trim(), error: null } : { value: null, error: 'Title is required.' },
  },
  {
    key: 'description', header: 'Description', required: false, example: 'Risk of data loss during migration to new server',
    parse: (v) => ({ value: v.trim() || null, error: null }),
  },
  {
    key: 'severity', header: 'Severity', required: false, example: 'high',
    allowed: RAID_SEVERITIES,
    parse: (v) => {
      const s = v.trim().toLowerCase();
      if (!s) return { value: 'medium', error: null };
      if (!RAID_SEVERITIES.includes(s)) return { value: 'medium', error: `Must be: ${RAID_SEVERITIES.join(', ')}.` };
      return { value: s, error: null };
    },
  },
  {
    key: 'probability', header: 'Probability', required: false, example: 'medium',
    allowed: RAID_PROBS,
    parse: (v) => {
      const s = v.trim().toLowerCase();
      if (!s) return { value: 'medium', error: null };
      if (!RAID_PROBS.includes(s)) return { value: 'medium', error: `Must be: ${RAID_PROBS.join(', ')}.` };
      return { value: s, error: null };
    },
  },
  {
    key: 'impact', header: 'Impact', required: false, example: 'Service outage for 2+ hours',
    parse: (v) => ({ value: v.trim() || null, error: null }),
  },
  {
    key: 'mitigation', header: 'Mitigation', required: false, example: 'Test migration on staging environment first',
    parse: (v) => ({ value: v.trim() || null, error: null }),
  },
  {
    key: 'status', header: 'Status', required: false, example: 'open',
    allowed: RAID_STATUSES,
    parse: (v) => {
      const s = v.trim().toLowerCase();
      if (!s) return { value: 'open', error: null };
      if (!RAID_STATUSES.includes(s)) return { value: 'open', error: `Must be: ${RAID_STATUSES.join(', ')}.` };
      return { value: s, error: null };
    },
  },
  {
    key: 'due_date', header: 'Due Date', required: false, example: '31/12/2026',
    parse: (v) => { const r = parseDateDMY(v); return { value: r.value, error: r.error }; },
  },
  {
    key: 'client_visible', header: 'Client Visible (yes/no)', required: false, example: 'no',
    allowed: ['yes', 'no'],
    parse: (v) => ({ value: v.trim().toLowerCase() === 'yes', error: null }),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RaidLogPanel({ projectId, entries, onRefresh }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const [showForm, setShowForm]               = useState(false);
  const [showBulkUpload, setShowBulkUpload]   = useState(false);
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [filterType, setFilterType]           = useState<RaidType | 'all'>('all');
  const [saving, setSaving]                   = useState(false);

  const [type, setType]               = useState<RaidType>('risk');
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity]       = useState<RaidSeverity>('medium');
  const [mitigation, setMitigation]   = useState('');
  const [clientVisible, setClientVisible] = useState(false);

  const filtered = useMemo(() => {
    if (filterType === 'all') return entries;
    return entries.filter(e => e.type === filterType);
  }, [entries, filterType]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !activeCompanyId) return;
    setSaving(true);
    try {
      await supabase.from('raid_log').insert({
        company_id:     activeCompanyId,
        project_id:     projectId,
        type, title: title.trim(),
        description:    description.trim() || null,
        severity,
        mitigation:     mitigation.trim() || null,
        client_visible: clientVisible,
      });
      setTitle(''); setDescription(''); setMitigation('');
      setShowForm(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }, [title, description, type, severity, mitigation, clientVisible, activeCompanyId, projectId, supabase, onRefresh]);

  const updateStatus = useCallback(async (id: string, status: RaidStatus) => {
    await supabase.from('raid_log').update({ status }).eq('id', id);
    onRefresh();
  }, [supabase, onRefresh]);

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  function downloadRaidTemplate() {
    const headers = RAID_COLUMNS.map(c => c.header).join(',');
    const notes   = `# Notes: ${RAID_COLUMNS.map(c => [c.required ? 'REQUIRED' : '', c.allowed ? `Allowed: ${c.allowed.join('/')}` : ''].filter(Boolean).join(' | ')).join(',')}`;
    const example = RAID_COLUMNS.map(c => c.example ?? '').join(',');
    const csv  = [headers, notes, example].join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'raid-log-template.csv'; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-500" />
          RAID Log ({entries.length})
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={downloadRaidTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-slate-600 bg-white border border-slate-200 rounded-lg
                       hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setShowBulkUpload(!showBulkUpload); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" /> Bulk Upload
          </button>
          <button
            type="button"
            onClick={() => { setShowBulkUpload(false); setShowForm(!showForm); }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                       text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setFilterType('all')}
          className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
            ${filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
          All ({entries.length})
        </button>
        {FILTER_TYPES.map(t => {
          const cfg = TYPE_CONFIG[t];
          return (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
                ${filterType === t ? cfg.color : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {cfg.label} ({counts[t] || 0})
            </button>
          );
        })}
      </div>

      {/* Bulk upload panel */}
      {showBulkUpload && activeCompanyId && (
        <BulkUploadPanel
          columns={RAID_COLUMNS}
          templateFilename="raid-log-template.csv"
          apiEndpoint={`/api/projects/${projectId}/raid-log/bulk-import`}
          companyId={activeCompanyId}
          entityLabel="RAID entry"
          open={showBulkUpload}
          onClose={() => setShowBulkUpload(false)}
          onSuccess={() => { onRefresh(); setShowBulkUpload(false); }}
        />
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select value={type} onChange={e => setType(e.target.value as RaidType)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="risk">Risk</option>
              <option value="assumption">Assumption</option>
              <option value="issue">Issue</option>
              <option value="decision">Decision</option>
            </select>
            <select value={severity} onChange={e => setSeverity(e.target.value as RaidSeverity)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <textarea value={mitigation} onChange={e => setMitigation(e.target.value)} placeholder="Mitigation plan..." rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} className="rounded border-slate-300" />
            {clientVisible ? <Eye className="w-4 h-4 text-sky-500" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
            Client visible
          </label>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!title.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? 'Saving...' : 'Create Entry'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Entries list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No entries. Add a risk, assumption, issue, or decision.
          </div>
        )}

        {filtered.map(entry => {
          const cfg      = TYPE_CONFIG[entry.type];
          const TypeIcon = cfg.icon;
          const isExpanded = expandedId === entry.id;

          return (
            <div key={entry.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-50 transition-colors cursor-pointer">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${cfg.color}`}>
                  <TypeIcon className="w-3 h-3" /> {cfg.label}
                </span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SEVERITY_COLORS[entry.severity]}`}>
                  {entry.severity}
                </span>
                <span className="text-sm text-slate-700 flex-1 text-left truncate">{entry.title}</span>
                {entry.client_visible && <Eye className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />}
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[entry.status] || 'bg-slate-100 text-slate-500'}`}>
                  {entry.status.replace(/_/g, ' ')}
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50">
                  <div className="px-4 pt-3 space-y-2">
                    {entry.description && <p className="text-sm text-slate-600">{entry.description}</p>}
                    {entry.mitigation && (
                      <div className="text-xs text-slate-500"><strong>Mitigation:</strong> {entry.mitigation}</div>
                    )}
                    {entry.resolution_note && (
                      <div className="text-xs text-emerald-600"><strong>Resolution:</strong> {entry.resolution_note}</div>
                    )}
                    <div className="flex gap-2 flex-wrap pb-2">
                      {entry.status === 'open' && (
                        <button onClick={() => updateStatus(entry.id, 'in_progress')} className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer">In Progress</button>
                      )}
                      {['open', 'in_progress'].includes(entry.status) && (
                        <>
                          <button onClick={() => updateStatus(entry.id, 'mitigated')} className="px-3 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer">Mitigated</button>
                          <button onClick={() => updateStatus(entry.id, 'resolved')} className="px-3 py-1 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 cursor-pointer">Resolved</button>
                          <button onClick={() => updateStatus(entry.id, 'closed')} className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer">Close</button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Evidence attachments */}
                  {activeCompanyId && (
                    <AttachmentsSection
                      entityId={entry.id}
                      companyId={activeCompanyId}
                      storageFolder={`${activeCompanyId}/raid/${entry.id}`}
                      apiBase="/api/raid-attachments"
                      entityParam="raidId"
                    />
                  )}
                  <div className="pb-1" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
