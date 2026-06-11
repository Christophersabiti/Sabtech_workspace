'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Save, Trash2, Clock, Calendar, User2, Flag, Tag,
  ChevronDown, CheckCircle2, AlertTriangle, Minus, Plus,
} from 'lucide-react';
import {
  EnhancedProjectTask,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_STATUS_DOT,
  TASK_PRIORITY_DOT,
} from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskFormValues = {
  task_number: string;
  phase: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  start_date: string;
  end_date: string;
  assigned_to: string;
  is_billable: boolean;
  estimated_hours: string;
  tags: string;
};

type Props = {
  task: EnhancedProjectTask | null;
  open: boolean;
  saving: boolean;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSave: (values: TaskFormValues) => void;
  onDelete?: (id: string) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES: TaskStatus[]   = ['backlog','pending','in_progress','in_review','blocked','completed','cancelled'];
const ALL_PRIORITIES: TaskPriority[] = ['low','medium','high','critical'];

function emptyForm(defaultStatus: TaskStatus = 'pending'): TaskFormValues {
  return {
    task_number: '', phase: '',
    title: '', description: '', status: defaultStatus, priority: 'medium',
    progress: 0, start_date: '', end_date: '', assigned_to: '',
    is_billable: false, estimated_hours: '', tags: '',
  };
}

function taskToForm(t: EnhancedProjectTask): TaskFormValues {
  return {
    task_number:     t.task_number?.toString() ?? '',
    phase:           t.phase ?? '',
    title:           t.title,
    description:     t.description ?? '',
    status:          t.status,
    priority:        t.priority,
    progress:        t.progress,
    start_date:      t.start_date ?? '',
    end_date:        t.end_date ?? '',
    assigned_to:     t.assigned_to ?? '',
    is_billable:     t.is_billable,
    estimated_hours: t.estimated_hours?.toString() ?? '',
    tags:            t.tags?.join(', ') ?? '',
  };
}

// ─── Select component ─────────────────────────────────────────────────────────

function FieldSelect<T extends string>({
  label, value, options, optionLabel, optionDot, onChange,
}: {
  label: string;
  value: T;
  options: T[];
  optionLabel: (o: T) => string;
  optionDot?: (o: T) => string;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left border border-gray-200 rounded-lg hover:border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
      >
        {optionDot && (
          <span className={`w-2 h-2 rounded-full shrink-0 ${optionDot(value)}`} />
        )}
        <span className="flex-1 truncate text-gray-800">{optionLabel(value)}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {options.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                o === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              {optionDot && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${optionDot(o)}`} />
              )}
              {optionLabel(o)}
              {o === value && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function ProjectTaskDrawer({ task, open, saving, defaultStatus, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState<TaskFormValues>(emptyForm(defaultStatus));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isNew = !task;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isNew && task!.status !== 'completed' && task!.status !== 'cancelled' &&
    task!.end_date && task!.end_date < today;

  // Sync form when task changes
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(task ? taskToForm(task) : emptyForm(defaultStatus));
      setConfirmDelete(false);
    }
  }, [open, task, defaultStatus]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  function set<K extends keyof TaskFormValues>(key: K, val: TaskFormValues[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    // Auto-complete: if status is 'completed', set progress to 100
    const values = { ...form, progress: form.status === 'completed' ? 100 : form.progress };
    onSave(values);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
        style={{ animation: open ? 'slideIn 200ms ease-out' : undefined }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 ${
          isOverdue ? 'bg-red-50' : 'bg-white'
        }`}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              {isNew ? 'New Task' : 'Edit Task'}
            </h2>
            {isOverdue && (
              <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> Overdue
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Phase + Task Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phase</label>
              <input
                type="text"
                value={form.phase}
                onChange={e => set('phase', e.target.value)}
                placeholder="e.g. Phase 1"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Task Number</label>
              <input
                type="number"
                min={1}
                value={form.task_number}
                onChange={e => set('task_number', e.target.value)}
                placeholder="Auto-assigned"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?"
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Add details, context, or notes…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Status + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <FieldSelect
              label="Status"
              value={form.status}
              options={ALL_STATUSES}
              optionLabel={s => TASK_STATUS_LABELS[s]}
              optionDot={s => TASK_STATUS_DOT[s]}
              onChange={v => {
                set('status', v);
                if (v === 'completed') set('progress', 100);
              }}
            />
            <FieldSelect
              label="Priority"
              value={form.priority}
              options={ALL_PRIORITIES}
              optionLabel={p => TASK_PRIORITY_LABELS[p]}
              optionDot={p => TASK_PRIORITY_DOT[p]}
              onChange={v => set('priority', v)}
            />
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Progress</label>
              <span className="text-xs font-semibold text-gray-700 tabular-nums">{form.progress}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set('progress', Math.max(0, form.progress - 10))}
                className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-400"
              >
                <Minus className="w-3 h-3" />
              </button>
              <input
                type="range"
                min={0} max={100} step={5}
                value={form.progress}
                onChange={e => set('progress', Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <button
                type="button"
                onClick={() => set('progress', Math.min(100, form.progress + 10))}
                className="p-1 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-400"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all"
                style={{ width: `${form.progress}%` }}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Due Date
                {isOverdue && <AlertTriangle className="w-3 h-3 text-red-500" />}
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  isOverdue
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-gray-200 focus:ring-blue-500/20 focus:border-blue-400'
                }`}
              />
            </div>
          </div>

          {/* Assigned to */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <User2 className="w-3 h-3" /> Assigned To
            </label>
            <input
              type="text"
              value={form.assigned_to}
              onChange={e => set('assigned_to', e.target.value)}
              placeholder="Name or email"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Estimated hours + billable */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Est. Hours
              </label>
              <input
                type="number"
                min={0} step={0.5}
                value={form.estimated_hours}
                onChange={e => set('estimated_hours', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Billable?</label>
              <button
                type="button"
                onClick={() => set('is_billable', !form.is_billable)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
                  form.is_billable
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {form.is_billable ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                {form.is_billable ? 'Yes' : 'No'}
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags
              <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="design, backend, review"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
            {form.tags && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-md">{tag}</span>
                ))}
              </div>
            )}
          </div>

        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2">
          {/* Delete with confirm */}
          {!isNew && onDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 flex-1">Delete this task?</span>
                <button
                  onClick={() => { onDelete(task!.id); setConfirmDelete(false); }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors w-full"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete task
              </button>
            )
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.title.trim()}
              className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? 'Saving…' : isNew ? 'Create Task' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

export { emptyForm, taskToForm };
