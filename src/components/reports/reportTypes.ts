// ─── Report Builder Types & Constants ────────────────────────────────────────

import type { ReportFilters, ReportVisibilityOptions, ReportFinancialOptions } from '@/types';

export { type ReportFilters, type ReportVisibilityOptions, type ReportFinancialOptions };

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_FILTERS: ReportFilters = {
  clientId: null,
  projectIds: [],
  taskStatuses: [],
  taskPriorities: [],
  assigneeIds: [],
  dateFrom: null,
  dateTo: null,
  milestoneIds: [],
  invoiceStatuses: [],
  paymentStatuses: [],
};

export const DEFAULT_VISIBILITY: ReportVisibilityOptions = {
  showCompleted: true,
  showInternal: false,
  showOverdue: true,
  showCancelled: false,
  showComments: false,
  showAttachments: false,
};

export const DEFAULT_FINANCIALS: ReportFinancialOptions = {
  showFinancialSummary: false,
  showPerTaskFinancials: false,
  showBudgetVsActual: false,
  showWhtDetails: false,
};

// ─── Steps ───────────────────────────────────────────────────────────────────

export const REPORT_STEPS = [
  { id: 1, label: 'Client',     description: 'Select a client',              icon: 'Users' },
  { id: 2, label: 'Projects',   description: 'Choose projects',              icon: 'FolderKanban' },
  { id: 3, label: 'Filters',    description: 'Filter tasks',                 icon: 'Filter' },
  { id: 4, label: 'Visibility', description: 'Show/hide options',            icon: 'Eye' },
  { id: 5, label: 'Financial',  description: 'Financial options',            icon: 'DollarSign' },
  { id: 6, label: 'Preview',    description: 'Review report',                icon: 'FileSearch' },
  { id: 7, label: 'Export',     description: 'Download report',              icon: 'Download' },
] as const;

// ─── CSV Column Definitions ─────────────────────────────────────────────────

export type CsvColumnDef = {
  key: string;
  label: string;
  default: boolean;
  financial?: boolean;
};

export const CSV_COLUMNS: CsvColumnDef[] = [
  { key: 'client',          label: 'Client',          default: true },
  { key: 'project',         label: 'Project',         default: true },
  { key: 'task',            label: 'Task',            default: true },
  { key: 'assignee',        label: 'Assignee',        default: true },
  { key: 'status',          label: 'Status',          default: true },
  { key: 'priority',        label: 'Priority',        default: true },
  { key: 'progress',        label: 'Progress %',      default: true },
  { key: 'start_date',      label: 'Start Date',      default: true },
  { key: 'due_date',        label: 'Due Date',        default: true },
  { key: 'completed_date',  label: 'Completed Date',  default: false },
  { key: 'latest_update',   label: 'Latest Update',   default: true },
  { key: 'invoice_status',  label: 'Invoice Status',  default: false, financial: true },
  { key: 'payment_status',  label: 'Payment Status',  default: false, financial: true },
  { key: 'billed_amount',   label: 'Billed Amount',   default: false, financial: true },
  { key: 'paid_amount',     label: 'Paid Amount',     default: false, financial: true },
  { key: 'balance',         label: 'Balance',          default: false, financial: true },
  { key: 'remarks',         label: 'Remarks',          default: false },
];
