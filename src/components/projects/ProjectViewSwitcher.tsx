'use client';

import { List, LayoutGrid, GanttChartSquare } from 'lucide-react';
import { TaskViewMode } from './types';

type Props = {
  view: TaskViewMode;
  onChange: (v: TaskViewMode) => void;
  taskCount: number;
};

const VIEWS: { key: TaskViewMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: 'list',   label: 'List',   Icon: List },
  { key: 'kanban', label: 'Board',  Icon: LayoutGrid },
  { key: 'gantt',  label: 'Gantt',  Icon: GanttChartSquare },
];

export function ProjectViewSwitcher({ view, onChange, taskCount }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5"
        role="tablist"
        aria-label="Task view"
      >
        {VIEWS.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => onChange(key)}
            className={
              `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ` +
              (view === key
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      {taskCount > 0 && (
        <span className="text-xs text-gray-400 font-medium tabular-nums">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
