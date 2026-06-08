'use client';

import { useState } from 'react';
import { Search, ChevronDown, X, SlidersHorizontal } from 'lucide-react';
import {
  EnhancedProjectTask,
  TaskStatus,
  TaskPriority,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_DOT,
  TASK_PRIORITY_DOT,
} from './types';

export type TaskFilters = {
  search: string;
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  assignees: string[];
  overduOnly: boolean;
};

export const EMPTY_FILTERS: TaskFilters = {
  search: '',
  statuses: [],
  priorities: [],
  assignees: [],
  overduOnly: false,
};

type Props = {
  tasks: EnhancedProjectTask[];
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
};

const ALL_STATUSES: TaskStatus[]   = ['backlog','pending','in_progress','in_review','blocked','completed','cancelled'];
const ALL_PRIORITIES: TaskPriority[] = ['critical','high','medium','low'];

export function applyFilters(tasks: EnhancedProjectTask[], filters: TaskFilters): EnhancedProjectTask[] {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter(t => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) &&
          !(t.description?.toLowerCase().includes(q)) &&
          !(t.assigned_to?.toLowerCase().includes(q)) &&
          !(t.phase?.toLowerCase().includes(q)) &&
          !(t.task_number?.toString().includes(q))) {
        return false;
      }
    }
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
    if (filters.priorities.length && !filters.priorities.includes(t.priority)) return false;
    if (filters.assignees.length && !filters.assignees.some(a => t.assigned_to === a)) return false;
    if (filters.overduOnly) {
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      if (!t.end_date || t.end_date >= today) return false;
    }
    return true;
  });
}

function countActive(f: TaskFilters) {
  let n = 0;
  if (f.search) n++;
  if (f.statuses.length) n++;
  if (f.priorities.length) n++;
  if (f.assignees.length) n++;
  if (f.overduOnly) n++;
  return n;
}

export function ProjectFilters({ tasks, filters, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const assignees = Array.from(new Set(tasks.map(t => t.assigned_to).filter(Boolean) as string[])).sort();
  const active = countActive(filters);

  function toggleStatus(s: TaskStatus) {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter(x => x !== s)
      : [...filters.statuses, s];
    onChange({ ...filters, statuses: next });
  }

  function togglePriority(p: TaskPriority) {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter(x => x !== p)
      : [...filters.priorities, p];
    onChange({ ...filters, priorities: next });
  }

  function toggleAssignee(a: string) {
    const next = filters.assignees.includes(a)
      ? filters.assignees.filter(x => x !== a)
      : [...filters.assignees, a];
    onChange({ ...filters, assignees: next });
  }

  function clear() {
    onChange(EMPTY_FILTERS);
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
        {filters.search && (
          <button
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filters popover */}
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            active
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {active > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full leading-none">
              {active}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-20 p-4 space-y-4">
              {/* Status */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                        filters.statuses.includes(s)
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS_DOT[s]}`} />
                      {TASK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PRIORITIES.map(p => (
                    <button
                      key={p}
                      onClick={() => togglePriority(p)}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                        filters.priorities.includes(p)
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${TASK_PRIORITY_DOT[p]}`} />
                      {TASK_PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignee */}
              {assignees.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assignee</p>
                  <div className="flex flex-wrap gap-1.5">
                    {assignees.map(a => (
                      <button
                        key={a}
                        onClick={() => toggleAssignee(a)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                          filters.assignees.includes(a)
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-gray-200 text-[9px] font-bold text-gray-600 flex items-center justify-center">
                          {a[0].toUpperCase()}
                        </span>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Overdue only</span>
                <button
                  onClick={() => onChange({ ...filters, overduOnly: !filters.overduOnly })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    filters.overduOnly ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      filters.overduOnly ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Clear */}
              {active > 0 && (
                <button
                  onClick={clear}
                  className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Active filter chips */}
      {filters.statuses.map(s => (
        <span key={s} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md border border-blue-200">
          {TASK_STATUS_LABELS[s]}
          <button onClick={() => toggleStatus(s)}><X className="w-3 h-3" /></button>
        </span>
      ))}
      {filters.priorities.map(p => (
        <span key={p} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-md border border-blue-200">
          {TASK_PRIORITY_LABELS[p]}
          <button onClick={() => togglePriority(p)}><X className="w-3 h-3" /></button>
        </span>
      ))}
      {filters.overduOnly && (
        <span className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md border border-red-200">
          Overdue
          <button onClick={() => onChange({ ...filters, overduOnly: false })}><X className="w-3 h-3" /></button>
        </span>
      )}
    </div>
  );
}
