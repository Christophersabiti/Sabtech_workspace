'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Shield, Plus, AlertTriangle, Info, CheckCircle2, Lightbulb,
  ChevronDown, ChevronRight, Eye, EyeOff, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { RaidEntry, RaidType, RaidSeverity, RaidStatus } from '@/types';

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

export default function RaidLogPanel({ projectId, entries, onRefresh }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<RaidType | 'all'>('all');
  const [saving, setSaving] = useState(false);

  // Form state
  const [type, setType] = useState<RaidType>('risk');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<RaidSeverity>('medium');
  const [mitigation, setMitigation] = useState('');
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
        company_id: activeCompanyId,
        project_id: projectId,
        type,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        mitigation: mitigation.trim() || null,
        client_visible: clientVisible,
      });
      setTitle('');
      setDescription('');
      setMitigation('');
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

  // Counts by type
  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-500" />
          RAID Log ({entries.length})
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setFilterType('all')}
          className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
            ${filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          All ({entries.length})
        </button>
        {FILTER_TYPES.map(t => {
          const cfg = TYPE_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
                ${filterType === t ? cfg.color : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {cfg.label} ({counts[t] || 0})
            </button>
          );
        })}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={type}
              onChange={e => setType(e.target.value as RaidType)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="risk">Risk</option>
              <option value="assumption">Assumption</option>
              <option value="issue">Issue</option>
              <option value="decision">Decision</option>
            </select>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as RaidSeverity)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <textarea
            value={mitigation}
            onChange={e => setMitigation(e.target.value)}
            placeholder="Mitigation plan..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={clientVisible} onChange={e => setClientVisible(e.target.checked)} className="rounded border-slate-300" />
            {clientVisible ? <Eye className="w-4 h-4 text-sky-500" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
            Client visible
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!title.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
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
          const cfg = TYPE_CONFIG[entry.type];
          const TypeIcon = cfg.icon;
          const isExpanded = expandedId === entry.id;

          return (
            <div key={entry.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-50 transition-colors cursor-pointer"
              >
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
                <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
                  {entry.description && <p className="text-sm text-slate-600">{entry.description}</p>}
                  {entry.mitigation && (
                    <div className="text-xs text-slate-500">
                      <strong>Mitigation:</strong> {entry.mitigation}
                    </div>
                  )}
                  {entry.resolution_note && (
                    <div className="text-xs text-emerald-600">
                      <strong>Resolution:</strong> {entry.resolution_note}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
