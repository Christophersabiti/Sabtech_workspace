// ─── Enhanced Project Task Types ─────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type TaskStatus =
  | 'backlog'
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type TaskInvoiceStatus = 'not_invoiced' | 'pending' | 'invoiced' | 'paid';
export type TaskPaymentStatus = 'unpaid' | 'partial' | 'paid';
export type TaskDependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';

export type EnhancedProjectTask = {
  id: string;
  company_id: string;
  project_id: string | null;
  quotation_id: string | null;
  quotation_item_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  parent_task_id: string | null;
  tags: string[];
  is_billable: boolean;
  estimated_hours: number | null;
  task_number: number | null;
  phase: string | null;
  // PM upgrade fields
  client_id: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  internal_only: boolean;
  client_visible: boolean;
  financial_visible: boolean;
  invoice_status: TaskInvoiceStatus;
  payment_status: TaskPaymentStatus;
  cost_estimate: number | null;
  actual_cost: number | null;
  billed_amount: number | null;
  paid_amount: number | null;
  balance_amount: number | null;
  report_note: string | null;
  last_update_summary: string | null;
  baseline_start_date: string | null;
  baseline_due_date: string | null;
  revised_due_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  is_critical_path: boolean;
  is_blocker: boolean;
  created_at: string;
  updated_at: string | null;
};

export type TaskViewMode = 'list' | 'kanban' | 'gantt';

export type KanbanColumn = {
  id: string;
  company_id: string;
  project_id: string | null;
  name: string;
  status_key: TaskStatus;
  sort_order: number;
  wip_limit: number | null;
  color: string;
  is_default: boolean;
};

export type TaskDependency = {
  id: string;
  company_id: string;
  project_id: string | null;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: TaskDependencyType;
  created_at: string;
};

export type TaskActivityLog = {
  id: string;
  company_id: string;
  project_id: string | null;
  task_id: string | null;
  user_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ─── Label / style maps ───────────────────────────────────────────────────────

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:     'Backlog',
  pending:     'Not Started',
  in_progress: 'In Progress',
  in_review:   'In Review',
  blocked:     'Blocked',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:     'bg-slate-100 text-slate-500',
  pending:     'bg-zinc-100 text-zinc-600',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review:   'bg-violet-100 text-violet-700',
  blocked:     'bg-red-100 text-red-600',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-gray-100 text-gray-500 line-through',
};

export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  backlog:     'bg-slate-400',
  pending:     'bg-zinc-400',
  in_progress: 'bg-blue-500',
  in_review:   'bg-violet-500',
  blocked:     'bg-red-500',
  completed:   'bg-green-500',
  cancelled:   'bg-gray-400',
};

export const TASK_STATUS_BORDER: Record<TaskStatus, string> = {
  backlog:     'border-l-slate-400',
  pending:     'border-l-zinc-400',
  in_progress: 'border-l-blue-500',
  in_review:   'border-l-violet-500',
  blocked:     'border-l-red-500',
  completed:   'border-l-green-500',
  cancelled:   'border-l-gray-400',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:      'bg-slate-100 text-slate-500',
  medium:   'bg-amber-50 text-amber-600',
  high:     'bg-orange-100 text-orange-600',
  critical: 'bg-red-100 text-red-600',
};

export const TASK_PRIORITY_DOT: Record<TaskPriority, string> = {
  low:      'bg-slate-400',
  medium:   'bg-amber-400',
  high:     'bg-orange-500',
  critical: 'bg-red-500',
};

// ─── Invoice & Payment status maps ────────────────────────────────────────────

export const TASK_INVOICE_STATUS_LABELS: Record<TaskInvoiceStatus, string> = {
  not_invoiced: 'Not Invoiced',
  pending:      'Pending',
  invoiced:     'Invoiced',
  paid:         'Paid',
};

export const TASK_INVOICE_STATUS_COLORS: Record<TaskInvoiceStatus, string> = {
  not_invoiced: 'bg-gray-100 text-gray-500',
  pending:      'bg-amber-100 text-amber-600',
  invoiced:     'bg-blue-100 text-blue-600',
  paid:         'bg-emerald-100 text-emerald-600',
};

export const TASK_PAYMENT_STATUS_LABELS: Record<TaskPaymentStatus, string> = {
  unpaid:  'Unpaid',
  partial: 'Partial',
  paid:    'Paid',
};

export const TASK_PAYMENT_STATUS_COLORS: Record<TaskPaymentStatus, string> = {
  unpaid:  'bg-red-100 text-red-600',
  partial: 'bg-amber-100 text-amber-600',
  paid:    'bg-emerald-100 text-emerald-600',
};

export const TASK_DEPENDENCY_TYPE_LABELS: Record<TaskDependencyType, string> = {
  finish_to_start:  'Finish to Start',
  start_to_start:   'Start to Start',
  finish_to_finish: 'Finish to Finish',
  start_to_finish:  'Start to Finish',
};

export const VISIBILITY_LABELS = {
  internal_only:     { label: 'Internal',        color: 'bg-slate-100 text-slate-600' },
  client_visible:    { label: 'Client Visible',  color: 'bg-sky-100 text-sky-600' },
  financial_visible: { label: 'Financial',       color: 'bg-purple-100 text-purple-600' },
} as const;

// Column color for Gantt & Kanban
export const KANBAN_COLUMN_COLORS: Record<TaskStatus, string> = {
  backlog:     '#94a3b8',
  pending:     '#64748b',
  in_progress: '#3b82f6',
  in_review:   '#8b5cf6',
  blocked:     '#ef4444',
  completed:   '#22c55e',
  cancelled:   '#6b7280',
};

export const DEFAULT_KANBAN_COLUMNS: Array<{
  status_key: TaskStatus;
  name: string;
  color: string;
  sort_order: number;
}> = [
  { status_key: 'backlog',     name: 'Backlog',     color: '#94a3b8', sort_order: 0 },
  { status_key: 'pending',     name: 'Not Started', color: '#64748b', sort_order: 1 },
  { status_key: 'in_progress', name: 'In Progress', color: '#3b82f6', sort_order: 2 },
  { status_key: 'in_review',   name: 'In Review',   color: '#8b5cf6', sort_order: 3 },
  { status_key: 'blocked',     name: 'Blocked',     color: '#ef4444', sort_order: 4 },
  { status_key: 'completed',   name: 'Completed',   color: '#22c55e', sort_order: 5 },
  { status_key: 'cancelled',   name: 'Cancelled',   color: '#6b7280', sort_order: 6 },
];
