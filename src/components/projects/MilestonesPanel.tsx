'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Target, Plus, X, Calendar, CheckCircle2, AlertCircle,
  Clock, ChevronDown, ChevronRight, MoreHorizontal, Eye, EyeOff,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { Milestone } from '@/types';

type Props = {
  projectId: string;
  milestones: Milestone[];
  onRefresh: () => void;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  in_progress: Target,
  completed: CheckCircle2,
  missed: AlertCircle,
  cancelled: X,
};

export default function MilestonesPanel({ projectId, milestones, onRefresh }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [clientVisible, setClientVisible] = useState(true);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !activeCompanyId) return;
    setSaving(true);
    try {
      await supabase.from('milestones').insert({
        company_id: activeCompanyId,
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || null,
        target_date: targetDate || null,
        client_visible: clientVisible,
        sort_order: milestones.length,
      });
      setName('');
      setDescription('');
      setTargetDate('');
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

  const pending = milestones.filter(m => m.status === 'pending' || m.status === 'in_progress');
  const completed = milestones.filter(m => m.status === 'completed');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Target className="w-4 h-4 text-violet-500" />
          Milestones ({milestones.length})
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Milestone name..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white resize-none
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <div className="flex gap-3">
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={clientVisible}
                onChange={e => setClientVisible(e.target.checked)}
                className="rounded border-slate-300"
              />
              {clientVisible ? <Eye className="w-4 h-4 text-sky-500" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
              Client visible
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Create Milestone'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active milestones */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map(m => {
            const StatusIcon = STATUS_ICONS[m.status] || Clock;
            const isExpanded = expandedId === m.id;
            const isOverdue = m.target_date && new Date(m.target_date) < new Date() && m.status !== 'completed';

            return (
              <div key={m.id} className={`border rounded-xl overflow-hidden ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[m.status]}`}>
                    {m.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-medium text-slate-700 flex-1 text-left truncate">{m.name}</span>
                  {m.client_visible && <Eye className="w-3.5 h-3.5 text-sky-400" />}
                  {m.target_date && (
                    <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-500'}`}>
                      {m.target_date}
                    </span>
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
                        <button
                          onClick={() => updateStatus(m.id, 'completed')}
                          className="px-3 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          Mark Complete
                        </button>
                      )}
                      {m.status === 'pending' && (
                        <button
                          onClick={() => updateStatus(m.id, 'in_progress')}
                          className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          Start
                        </button>
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

      {milestones.length === 0 && !showForm && (
        <div className="text-center py-8 text-sm text-slate-400">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No milestones yet. Add your first one.
        </div>
      )}
    </div>
  );
}
