'use client';

import { Eye, EyeOff, CheckCircle, XCircle, AlertTriangle, MessageSquare, Paperclip, Clock } from 'lucide-react';
import type { ReportVisibilityOptions } from '@/types';

type Props = {
  visibility: ReportVisibilityOptions;
  onChange: (v: ReportVisibilityOptions) => void;
};

type ToggleItem = {
  key: keyof ReportVisibilityOptions;
  label: string;
  description: string;
  icon: React.ElementType;
  warning?: boolean;
};

const TASK_VISIBILITY: ToggleItem[] = [
  {
    key: 'showCompleted',
    label: 'Completed Tasks',
    description: 'Include tasks that have been completed',
    icon: CheckCircle,
  },
  {
    key: 'showCancelled',
    label: 'Cancelled Tasks',
    description: 'Include tasks that were cancelled',
    icon: XCircle,
  },
  {
    key: 'showOverdue',
    label: 'Overdue Tasks',
    description: 'Include tasks past their due date',
    icon: Clock,
  },
  {
    key: 'showInternal',
    label: 'Internal Tasks',
    description: 'Include tasks marked as internal-only (not visible to clients)',
    icon: AlertTriangle,
    warning: true,
  },
];

const CONTENT_VISIBILITY: ToggleItem[] = [
  {
    key: 'showComments',
    label: 'Comments',
    description: 'Include client-visible comments in the report',
    icon: MessageSquare,
  },
  {
    key: 'showAttachments',
    label: 'Attachments',
    description: 'List attachments in the report',
    icon: Paperclip,
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer
        ${checked ? 'bg-blue-600' : 'bg-slate-200'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

function ToggleRow({ item, checked, onChange }: { item: ToggleItem; checked: boolean; onChange: () => void }) {
  const Icon = item.icon;
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`
          w-8 h-8 rounded-lg flex items-center justify-center
          ${item.warning && checked ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}
        `}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-700">{item.label}</p>
          <p className="text-xs text-slate-500">{item.description}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function VisibilityOptions({ visibility, onChange }: Props) {
  const toggle = (key: keyof ReportVisibilityOptions) => {
    onChange({ ...visibility, [key]: !visibility[key] });
  };

  const enabledCount = Object.values(visibility).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 rounded-lg">
        {enabledCount > 0 ? (
          <Eye className="w-4 h-4 text-blue-500" />
        ) : (
          <EyeOff className="w-4 h-4 text-slate-400" />
        )}
        <span className="text-sm text-slate-600">
          <strong>{enabledCount}</strong> visibility option{enabledCount !== 1 ? 's' : ''} enabled
        </span>
      </div>

      {/* Task Visibility section */}
      <div>
        <h4 className="text-sm font-semibold text-slate-800 mb-2 px-1">Task Visibility</h4>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {TASK_VISIBILITY.map(item => (
            <ToggleRow
              key={item.key}
              item={item}
              checked={visibility[item.key]}
              onChange={() => toggle(item.key)}
            />
          ))}
        </div>
      </div>

      {/* Content Visibility section */}
      <div>
        <h4 className="text-sm font-semibold text-slate-800 mb-2 px-1">Content Visibility</h4>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {CONTENT_VISIBILITY.map(item => (
            <ToggleRow
              key={item.key}
              item={item}
              checked={visibility[item.key]}
              onChange={() => toggle(item.key)}
            />
          ))}
        </div>
      </div>

      {/* Internal warning */}
      {visibility.showInternal && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <strong>Warning:</strong> Internal tasks will be included in the report. These are typically not shown to clients.
            Ensure this report is for internal use only.
          </p>
        </div>
      )}
    </div>
  );
}
