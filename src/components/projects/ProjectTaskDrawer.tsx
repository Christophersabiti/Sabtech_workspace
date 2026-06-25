'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, Save, Trash2, Clock, Calendar, User2, Tag, Link2,
  ChevronDown, CheckCircle2, AlertTriangle, Minus, Plus, GitBranch,
} from 'lucide-react';
import {
  EnhancedProjectTask,
  TaskDependency,
  TaskDependencyType,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_DOT,
  TASK_PRIORITY_DOT,
  TASK_DEPENDENCY_TYPE_LABELS,
} from './types';
import { diffIsoDays, formatScheduleVariance } from './scheduleUtils';
import { TaskCommentsSection } from './TaskCommentsSection';
import { AttachmentsSection } from './AttachmentsSection';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskFormValues = {
  task_number: string;
  phase: string;
  parent_task_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  start_date: string;
  end_date: string;
  baseline_start_date: string;
  baseline_due_date: string;
  revised_due_date: string;
  actual_start_date: string;
  actual_completion_date: string;
  is_critical_path: boolean;
  is_blocker: boolean;
  assigned_to: string;
  is_billable: boolean;
  estimated_hours: string;
  tags: string;
  dependencies: TaskDependencyFormValue[];
};

export type TaskDependencyFormValue = {
  depends_on_task_id: string;
  dependency_type: TaskDependencyType;
};

type Props = {
  task: EnhancedProjectTask | null;
  open: boolean;
  saving: boolean;
  defaultStatus?: TaskStatus;
  companyId?: string;
  availableTasks?: EnhancedProjectTask[];
  taskDependencies?: TaskDependency[];
  onClose: () => void;
  onSave: (values: TaskFormValues) => void;
  onDelete?: (id: string) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES: TaskStatus[]   = ['backlog','pending','in_progress','in_review','blocked','completed','cancelled'];
const ALL_PRIORITIES: TaskPriority[] = ['low','medium','high','critical'];
const ALL_DEPENDENCY_TYPES: TaskDependencyType[] = ['finish_to_start','start_to_start','finish_to_finish','start_to_finish'];

function emptyForm(defaultStatus: TaskStatus = 'pending'): TaskFormValues {
  return {
    task_number: '', phase: '', parent_task_id: '',
    title: '', description: '', status: defaultStatus, priority: 'medium',
    progress: 0, start_date: '', end_date: '', assigned_to: '',
    baseline_start_date: '', baseline_due_date: '', revised_due_date: '',
    actual_start_date: '', actual_completion_date: '',
    is_critical_path: false, is_blocker: false,
    is_billable: false, estimated_hours: '', tags: '', dependencies: [],
  };
}

function taskToForm(t: EnhancedProjectTask, dependencies: TaskDependency[] = []): TaskFormValues {
  return {
    task_number:     t.task_number?.toString() ?? '',
    phase:           t.phase ?? '',
    parent_task_id:  t.parent_task_id ?? '',
    title:           t.title,
    description:     t.description ?? '',
    status:          t.status,
    priority:        t.priority,
    progress:        t.progress,
    start_date:      t.start_date ?? '',
    end_date:        t.end_date ?? '',
    baseline_start_date: t.baseline_start_date ?? '',
    baseline_due_date:   t.baseline_due_date ?? '',
    revised_due_date:    t.revised_due_date ?? '',
    actual_start_date:   t.actual_start_date ?? '',
    actual_completion_date: t.actual_completion_date ?? '',
    is_critical_path: t.is_critical_path,
    is_blocker:       t.is_blocker,
    assigned_to:     t.assigned_to ?? '',
    is_billable:     t.is_billable,
    estimated_hours: t.estimated_hours?.toString() ?? '',
    tags:            t.tags?.join(', ') ?? '',
    dependencies:    dependencies
      .filter(d => d.task_id === t.id)
      .map(d => ({
        depends_on_task_id: d.depends_on_task_id,
        dependency_type: d.dependency_type,
      })),
  };
}

function dependencyCreatesCycle(
  taskId: string,
  candidateId: string,
  dependencies: TaskDependency[],
) {
  const graph = new Map<string, string[]>();

  dependencies
    .filter(d => d.task_id !== taskId)
    .forEach((dependency) => {
      const list = graph.get(dependency.task_id) ?? [];
      list.push(dependency.depends_on_task_id);
      graph.set(dependency.task_id, list);
    });

  const seen = new Set<string>();
  const stack = [candidateId];

  while (stack.length > 0) {
    const next = stack.pop()!;
    if (next === taskId) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(graph.get(next) ?? []));
  }

  return false;
}

function parentCreatesCycle(
  taskId: string,
  candidateParentId: string,
  tasks: EnhancedProjectTask[],
) {
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const seen = new Set<string>();
  let nextId: string | null = candidateParentId;

  while (nextId) {
    if (nextId === taskId) return true;
    if (seen.has(nextId)) return false;
    seen.add(nextId);
    nextId = taskById.get(nextId)?.parent_task_id ?? null;
  }

  return false;
}

function varianceTone(days: number | null) {
  if (days == null || days === 0) return 'text-slate-500';
  return days > 0 ? 'text-red-600' : 'text-emerald-600';
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

export function ProjectTaskDrawer({
  task,
  open,
  saving,
  defaultStatus,
  companyId,
  availableTasks = [],
  taskDependencies = [],
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [form, setForm] = useState<TaskFormValues>(emptyForm(defaultStatus));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const isNew = !task;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = !isNew && task!.status !== 'completed' && task!.status !== 'cancelled' &&
    task!.end_date && task!.end_date < today;
  const plannedDueDate = form.revised_due_date || form.end_date;
  const plannedVarianceDays = diffIsoDays(form.baseline_due_date, plannedDueDate);
  const actualVarianceDays = diffIsoDays(form.baseline_due_date, form.actual_completion_date);

  // Sync form when task changes
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(task ? taskToForm(task, taskDependencies) : emptyForm(defaultStatus));
      setConfirmDelete(false);
    }
  }, [open, task, defaultStatus, taskDependencies]);

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
    if (parentWarning) return;
    if (task && form.dependencies.some(d => dependencyCreatesCycle(task.id, d.depends_on_task_id, taskDependencies))) return;
    // Auto-complete: if status is 'completed', set progress to 100
    const values = {
      ...form,
      progress: form.status === 'completed' ? 100 : form.progress,
      actual_completion_date: form.status === 'completed' && !form.actual_completion_date
        ? today
        : form.actual_completion_date,
    };
    onSave(values);
  }

  const selectedDependencyIds = new Set(form.dependencies.map(d => d.depends_on_task_id));
  const dependencyTaskOptions = availableTasks.filter(t => t.id !== task?.id);
  const dependencyWarning = task
    ? form.dependencies.some(d => dependencyCreatesCycle(task.id, d.depends_on_task_id, taskDependencies))
    : false;
  const parentTaskOptions = availableTasks.filter(t =>
    t.id !== task?.id && (!task || !parentCreatesCycle(task.id, t.id, availableTasks)),
  );
  const selectedParentTask = availableTasks.find(t => t.id === form.parent_task_id);
  const parentWarning = !!task && !!form.parent_task_id &&
    parentCreatesCycle(task.id, form.parent_task_id, availableTasks);

  function addDependency() {
    const nextTask = dependencyTaskOptions.find(t => !selectedDependencyIds.has(t.id) && (!task || !dependencyCreatesCycle(task.id, t.id, taskDependencies)));
    if (!nextTask) return;
    set('dependencies', [
      ...form.dependencies,
      { depends_on_task_id: nextTask.id, dependency_type: 'finish_to_start' },
    ]);
  }

  function updateDependency(index: number, patch: Partial<TaskDependencyFormValue>) {
    set('dependencies', form.dependencies.map((dependency, i) =>
      i === index ? { ...dependency, ...patch } : dependency,
    ));
  }

  function removeDependency(index: number) {
    set('dependencies', form.dependencies.filter((_, i) => i !== index));
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

          {/* WBS parent */}
          <div className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/60">
            <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5 text-indigo-500" /> WBS Parent Task
            </label>
            <select
              value={form.parent_task_id}
              onChange={e => set('parent_task_id', e.target.value)}
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                parentWarning ? 'border-red-300 text-red-700' : 'border-gray-200 text-gray-700'
              }`}
            >
              <option value="">Top-level task</option>
              {selectedParentTask && !parentTaskOptions.some(t => t.id === selectedParentTask.id) && (
                <option value={selectedParentTask.id}>{selectedParentTask.title}</option>
              )}
              {parentTaskOptions.map(optionTask => (
                <option key={optionTask.id} value={optionTask.id}>
                  {optionTask.task_number != null ? `#${optionTask.task_number} ` : ''}{optionTask.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Use this to group work packages under summary tasks in the WBS and Gantt.
            </p>
            {parentWarning && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                This parent would create a circular WBS hierarchy and cannot be saved.
              </p>
            )}
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

          {/* Schedule control */}
          <div className="border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50/60">
            <div>
              <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-500" /> Schedule Control
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Capture the approved baseline, current forecast, and actual finish for variance tracking.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Baseline Start</label>
                <input
                  type="date"
                  value={form.baseline_start_date}
                  onChange={e => set('baseline_start_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Baseline Due</label>
                <input
                  type="date"
                  value={form.baseline_due_date}
                  min={form.baseline_start_date || undefined}
                  onChange={e => set('baseline_due_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Revised Due</label>
                <input
                  type="date"
                  value={form.revised_due_date}
                  onChange={e => set('revised_due_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Actual Start</label>
                <input
                  type="date"
                  value={form.actual_start_date}
                  onChange={e => set('actual_start_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Actual Completion</label>
                <input
                  type="date"
                  value={form.actual_completion_date}
                  min={form.actual_start_date || undefined}
                  onChange={e => set('actual_completion_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set('is_critical_path', !form.is_critical_path)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                  form.is_critical_path
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {form.is_critical_path ? <AlertTriangle className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                Critical Path
              </button>
              <button
                type="button"
                onClick={() => set('is_blocker', !form.is_blocker)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                  form.is_blocker
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {form.is_blocker ? <AlertTriangle className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                Blocker
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <p className={`font-medium ${varianceTone(plannedVarianceDays)}`}>
                Planned: {plannedVarianceDays == null ? 'Set baseline due and due date.' : formatScheduleVariance(plannedVarianceDays)}
              </p>
              <p className={`mt-1 ${varianceTone(actualVarianceDays)}`}>
                Actual: {actualVarianceDays == null ? 'Actual completion not captured yet.' : formatScheduleVariance(actualVarianceDays)}
              </p>
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

          {/* Dependencies */}
          <div className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/60">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-blue-500" /> Dependencies
              </label>
              <button
                type="button"
                onClick={addDependency}
                disabled={dependencyTaskOptions.length === 0 || form.dependencies.length >= dependencyTaskOptions.length}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {form.dependencies.length === 0 ? (
              <p className="text-xs text-gray-400">No dependencies. This task can start independently.</p>
            ) : (
              <div className="space-y-2">
                {form.dependencies.map((dependency, index) => {
                  const currentTask = dependencyTaskOptions.find(t => t.id === dependency.depends_on_task_id);
                  const createsCycle = task
                    ? dependencyCreatesCycle(task.id, dependency.depends_on_task_id, taskDependencies)
                    : false;

                  return (
                    <div key={`${dependency.depends_on_task_id}-${index}`} className="grid grid-cols-[1fr_130px_auto] gap-2 items-start">
                      <select
                        value={dependency.depends_on_task_id}
                        onChange={e => updateDependency(index, { depends_on_task_id: e.target.value })}
                        className={`min-w-0 px-2 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                          createsCycle ? 'border-red-300 text-red-700' : 'border-gray-200 text-gray-700'
                        }`}
                      >
                        {currentTask && !dependencyTaskOptions.some(t => t.id === currentTask.id) && (
                          <option value={currentTask.id}>{currentTask.title}</option>
                        )}
                        {dependencyTaskOptions.map(optionTask => {
                          const isSelectedElsewhere = form.dependencies.some((d, i) =>
                            i !== index && d.depends_on_task_id === optionTask.id,
                          );
                          const wouldCycle = task
                            ? dependencyCreatesCycle(task.id, optionTask.id, taskDependencies)
                            : false;

                          return (
                            <option
                              key={optionTask.id}
                              value={optionTask.id}
                              disabled={isSelectedElsewhere || wouldCycle}
                            >
                              {optionTask.task_number != null ? `#${optionTask.task_number} ` : ''}{optionTask.title}
                              {wouldCycle ? ' (cycle)' : ''}
                            </option>
                          );
                        })}
                      </select>

                      <select
                        value={dependency.dependency_type}
                        onChange={e => updateDependency(index, { dependency_type: e.target.value as TaskDependencyType })}
                        className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {ALL_DEPENDENCY_TYPES.map(type => (
                          <option key={type} value={type}>{TASK_DEPENDENCY_TYPE_LABELS[type]}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => removeDependency(index)}
                        className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove dependency"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {dependencyWarning && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                One dependency would create a circular schedule chain and cannot be saved.
              </p>
            )}
          </div>

        </form>

        {/* Attachments — only for existing tasks */}
        {!isNew && task && companyId && (
          <AttachmentsSection
            entityId={task.id}
            companyId={companyId}
            storageFolder={`${companyId}/tasks/${task.id}`}
            apiBase="/api/task-attachments"
            entityParam="taskId"
          />
        )}

        {/* Comments — only for existing tasks */}
        {!isNew && task && companyId && (
          <TaskCommentsSection taskId={task.id} companyId={companyId} />
        )}

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
              disabled={saving || !form.title.trim() || dependencyWarning || parentWarning}
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
