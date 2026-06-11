'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Clock, Calendar, CheckCircle2, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { EnhancedProjectTask } from './types';

type TimeLog = {
  id: string;
  hours_logged: number;
  log_date: string;
  description: string | null;
  is_billable: boolean;
  created_at: string;
  user_id: string | null;
};

type Props = {
  task: EnhancedProjectTask | null;
  open: boolean;
  onClose: () => void;
  onLoggedChange?: () => void; // Trigger parent reload if timesheets updated
};

export function TimeLogDrawer({ task, open, onClose, onLoggedChange }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Form State
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  // Sync logs when task changes or drawer opens
  useEffect(() => {
    if (open && task) {
      // eslint-disable-next-line react-hooks/immutability
      loadLogs();
      // Reset form defaults
      setHours('');
      setDate(new Date().toISOString().slice(0, 10));
      setDescription('');
      setIsBillable(task.is_billable);
      setError('');
    }
  }, [open, task]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  async function loadLogs() {
    if (!task) return;
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from('task_time_logs')
      .select('*')
      .eq('task_id', task.id)
      .order('log_date', { ascending: false });

    if (!error && data) {
      setLogs(data as TimeLog[]);
    }
    setLoadingLogs(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    setError('');

    const hoursNum = parseFloat(hours);
    if (isNaN(hoursNum) || hoursNum <= 0) {
      setError('Please log valid hours (greater than 0).');
      return;
    }

    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    const payload = {
      company_id: task.company_id,
      task_id: task.id,
      user_id: userId,
      hours_logged: hoursNum,
      log_date: date,
      description: description.trim() || null,
      is_billable: isBillable,
    };

    const { error: insertErr } = await supabase
      .from('task_time_logs')
      .insert(payload);

    if (insertErr) {
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    // Reset Form
    setHours('');
    setDescription('');
    setSaving(false);
    
    // Reload logs
    await loadLogs();
    if (onLoggedChange) onLoggedChange();
  }

  async function handleDelete(logId: string) {
    if (!confirm('Are you sure you want to delete this time entry?')) return;
    setError('');

    const { error: delErr } = await supabase
      .from('task_time_logs')
      .delete()
      .eq('id', logId);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    await loadLogs();
    if (onLoggedChange) onLoggedChange();
  }

  const totalHours = logs.reduce((sum, item) => sum + Number(item.hours_logged), 0);

  if (!open || !task) return null;

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black/35 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-800 leading-tight">Time Sheets</h2>
              <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form logger */}
          <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Log New Time Block</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hours *</label>
                <input
                  required
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Date *</label>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Notes / Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief summary of tasks accomplished…"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
              <span className="text-[11px] font-semibold text-slate-500">Billable to Client?</span>
              <button
                type="button"
                onClick={() => setIsBillable(!isBillable)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  isBillable
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {isBillable ? <CheckCircle2 className="w-3.5 h-3.5" /> : <MinusCircle />}
                {isBillable ? 'Yes' : 'No'}
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || !hours}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 text-xs transition-colors disabled:opacity-55 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? 'Saving block...' : 'Add Time Entry'}
            </button>
          </form>

          {/* Time logs history */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Timesheet History</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                Total logged: <strong>{totalHours.toFixed(1)} hrs</strong>
              </span>
            </div>

            {loadingLogs ? (
              <div className="text-center py-6 text-slate-400 flex justify-center items-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                Loading logs…
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                No time logged against this task yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="group border border-slate-100 bg-slate-50 hover:bg-slate-100/50 p-3 rounded-xl flex items-start justify-between gap-3 transition-colors">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800 tabular-nums">{log.hours_logged.toFixed(1)} hrs</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{new Date(log.log_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase ${
                          log.is_billable ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {log.is_billable ? 'Billable' : 'Internal'}
                        </span>
                      </div>
                      {log.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{log.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(log.id)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                      title="Delete log"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-slate-50 flex gap-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Close timesheets
          </button>
        </div>
      </div>
    </>
  );
}

// Simple custom component to support internal unchecked icon
function MinusCircle() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 shrink-0">
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
