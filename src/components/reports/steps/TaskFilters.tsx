'use client';

import { X } from 'lucide-react';
import type { ReportFilters } from '@/types';
import { TASK_STATUS_LABELS } from '@/components/projects/types';
import type { TaskStatus, TaskPriority, TaskInvoiceStatus, TaskPaymentStatus } from '@/components/projects/types';
import {
  TASK_PRIORITY_LABELS,
  TASK_INVOICE_STATUS_LABELS,
  TASK_PAYMENT_STATUS_LABELS,
} from '@/components/projects/types';

type Props = {
  filters: ReportFilters;
  onChange: (f: ReportFilters) => void;
  assignees: { id: string; name: string }[];
};

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Record<T, string>;
  selected: string[];
  onToggle: (val: T) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(options) as [T, string][]).map(([key, lbl]) => {
          const isActive = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`
                inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full
                border transition-all cursor-pointer
                ${isActive
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }
              `}
            >
              {lbl}
              {isActive && <X className="w-3 h-3 ml-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TaskFiltersStep({ filters, onChange, assignees }: Props) {
  const toggleStatus = (val: TaskStatus) => {
    const next = filters.taskStatuses.includes(val)
      ? filters.taskStatuses.filter(s => s !== val)
      : [...filters.taskStatuses, val];
    onChange({ ...filters, taskStatuses: next });
  };

  const togglePriority = (val: TaskPriority) => {
    const next = filters.taskPriorities.includes(val)
      ? filters.taskPriorities.filter(s => s !== val)
      : [...filters.taskPriorities, val];
    onChange({ ...filters, taskPriorities: next });
  };

  const toggleAssignee = (id: string) => {
    const next = filters.assigneeIds.includes(id)
      ? filters.assigneeIds.filter(s => s !== id)
      : [...filters.assigneeIds, id];
    onChange({ ...filters, assigneeIds: next });
  };

  const toggleInvoice = (val: TaskInvoiceStatus) => {
    const next = filters.invoiceStatuses.includes(val)
      ? filters.invoiceStatuses.filter(s => s !== val)
      : [...filters.invoiceStatuses, val];
    onChange({ ...filters, invoiceStatuses: next });
  };

  const togglePayment = (val: TaskPaymentStatus) => {
    const next = filters.paymentStatuses.includes(val)
      ? filters.paymentStatuses.filter(s => s !== val)
      : [...filters.paymentStatuses, val];
    onChange({ ...filters, paymentStatuses: next });
  };

  const activeFilters = [
    ...filters.taskStatuses,
    ...filters.taskPriorities,
    ...filters.assigneeIds,
    ...filters.invoiceStatuses,
    ...filters.paymentStatuses,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {activeFilters > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{activeFilters} filter(s) active</span>
          <button
            onClick={() => onChange({
              ...filters,
              taskStatuses: [],
              taskPriorities: [],
              assigneeIds: [],
              invoiceStatuses: [],
              paymentStatuses: [],
              dateFrom: null,
              dateTo: null,
            })}
            className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )}

      <MultiSelect<TaskStatus>
        label="Task Status"
        options={TASK_STATUS_LABELS}
        selected={filters.taskStatuses}
        onToggle={toggleStatus}
      />

      <MultiSelect<TaskPriority>
        label="Priority"
        options={TASK_PRIORITY_LABELS}
        selected={filters.taskPriorities}
        onToggle={togglePriority}
      />

      {/* Assignees */}
      {assignees.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Assignee</label>
          <div className="flex flex-wrap gap-2">
            {assignees.map(a => {
              const isActive = filters.assigneeIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAssignee(a.id)}
                  className={`
                    inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full
                    border transition-all cursor-pointer
                    ${isActive
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }
                  `}
                >
                  {a.name}
                  {isActive && <X className="w-3 h-3 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Date From</label>
          <input
            type="date"
            value={filters.dateFrom || ''}
            onChange={e => onChange({ ...filters, dateFrom: e.target.value || null })}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Date To</label>
          <input
            type="date"
            value={filters.dateTo || ''}
            onChange={e => onChange({ ...filters, dateTo: e.target.value || null })}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
      </div>

      <MultiSelect<TaskInvoiceStatus>
        label="Invoice Status"
        options={TASK_INVOICE_STATUS_LABELS}
        selected={filters.invoiceStatuses}
        onToggle={toggleInvoice}
      />

      <MultiSelect<TaskPaymentStatus>
        label="Payment Status"
        options={TASK_PAYMENT_STATUS_LABELS}
        selected={filters.paymentStatuses}
        onToggle={togglePayment}
      />
    </div>
  );
}
