'use client';

import { useState, useMemo } from 'react';
import { Search, CheckSquare, Square, MinusSquare } from 'lucide-react';
import type { ProjectWithTotals } from '@/types';

type Props = {
  projects: ProjectWithTotals[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  on_hold: 'bg-amber-500',
  completed: 'bg-blue-500',
  cancelled: 'bg-slate-400',
};

function formatAmount(n: number | null): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export default function ProjectSelector({ projects, selectedIds, onToggle, onSelectAll, onClearAll }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(p =>
      p.project_name.toLowerCase().includes(q) ||
      p.project_code.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const allSelected = filtered.length > 0 && filtered.every(p => selectedIds.includes(p.id));
  const someSelected = filtered.some(p => selectedIds.includes(p.id));

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                       bg-white placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={allSelected ? onClearAll : onSelectAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium
                     text-slate-600 bg-white border border-slate-200 rounded-lg
                     hover:bg-slate-50 transition-colors cursor-pointer"
        >
          {allSelected ? 'Clear All' : 'Select All'}
        </button>
        {selectedIds.length > 0 && (
          <span className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            {selectedIds.length} selected
          </span>
        )}
      </div>

      {/* Project grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8 col-span-2">No projects found</p>
        ) : (
          filtered.map(project => {
            const isSelected = selectedIds.includes(project.id);
            const progress = Math.min(100, Math.max(0,
              project.total_invoiced && project.total_contract_amount
                ? Math.round((project.total_paid / project.total_contract_amount) * 100)
                : 0
            ));

            return (
              <button
                key={project.id}
                onClick={() => onToggle(project.id)}
                className={`
                  flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all cursor-pointer
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                  }
                `}
              >
                {/* Checkbox */}
                <div className="mt-0.5 flex-shrink-0">
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : someSelected ? (
                    <Square className="w-5 h-5 text-slate-300" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + status */}
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 truncate text-sm">{project.project_name}</p>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[project.status] || 'bg-slate-300'}`} />
                  </div>

                  <p className="text-xs text-slate-500 mt-0.5">{project.project_code}</p>

                  {/* Progress bar */}
                  <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Financial summary */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                    <span>Invoiced: <strong className="text-slate-700">{formatAmount(project.total_invoiced)}</strong></span>
                    <span>Paid: <strong className="text-emerald-600">{formatAmount(project.total_paid)}</strong></span>
                    <span>Due: <strong className="text-orange-600">{formatAmount(project.outstanding)}</strong></span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
