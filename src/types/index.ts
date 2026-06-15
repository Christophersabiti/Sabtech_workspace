export type Client = {
  id: string;
  company_id: string;
  client_code: string;
  name: string;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tin_number: string | null;
  currency: string;
  notes: string | null;
  status: 'active' | 'inactive';
  is_archived: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientAuditLog = {
  id: string;
  client_id: string;
  changed_by: string | null;
  changed_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
};

// Extended client with aggregated project/invoice data (from get_clients_filtered RPC)
export type ClientWithStats = Client & {
  active_projects: number;
  total_outstanding: number;
  has_overdue: boolean;
};

export type Service = {
  id: string;
  company_id: string;
  service_code: string;
  service_name: string;
  category: string | null;
  default_price: number;
  tax_percent: number;
  is_active: boolean;
  created_at: string;
};

export type Project = {
  id: string;
  company_id: string;
  client_id: string;
  project_code: string;
  project_name: string;
  description: string | null;
  total_contract_amount: number | null;
  billing_type: 'single_invoice' | 'installment' | 'milestone' | 'recurring';
  project_manager: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  client?: Client;
};

export type InvoiceSchedule = {
  id: string;
  company_id: string;
  project_id: string;
  schedule_name: string;
  description: string | null;
  percentage: number | null;
  fixed_amount: number | null;
  due_date: string | null;
  sort_order: number;
  status: 'pending' | 'invoiced' | 'paid';
  generated_invoice_id: string | null;
  created_at: string;
};

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'void' | 'migrated';

export type WhtTreatment = 'STANDARD_DEDUCTION' | 'GROSS_UP';
export type WhtTaxableBaseType = 'SUBTOTAL_EXCL_VAT' | 'TOTAL_INCL_VAT' | 'MANUAL';
export type UraWhtRemittanceStatus = 'NOT_APPLICABLE' | 'PENDING' | 'REMITTED';

export type Invoice = {
  id: string;
  company_id: string;
  invoice_number: string;
  client_id: string;
  project_id: string | null;
  schedule_id: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  total_paid: number;
  balance_due: number;
  status: InvoiceStatus;
  notes: string | null;
  footer_note: string | null;
  pdf_url: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  // Migration provenance
  migrated_by: string | null;
  migrated_at: string | null;
  migration_source: string | null;
  migrated_record_id: string | null;
  // WHT fields
  apply_wht: boolean;
  wht_rate: number;
  wht_treatment: WhtTreatment;
  wht_taxable_base_type: WhtTaxableBaseType;
  wht_taxable_amount: number;
  wht_amount: number;
  net_payable_amount: number;
  grossed_up_amount: number | null;
  ura_wht_remittance_status: UraWhtRemittanceStatus;
  ura_wht_certificate_number: string | null;
  ura_wht_remittance_date: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  client?: Client;
  project?: Project;
  invoice_items?: InvoiceItem[];
  payments?: Payment[];
};

export type MigratedInvoice = {
  id: string;
  company_id: string;
  original_invoice_number: string;
  mapped_invoice_id: string | null;
  original_issue_date: string;
  original_due_date: string | null;
  client_id: string | null;
  project_id: string | null;
  currency: string;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  wht_applied: boolean;
  wht_rate: number | null;
  wht_amount: number | null;
  gross_invoice_total: number;
  amount_paid: number;
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  original_receipt_number: string | null;
  wht_certificate_number: string | null;
  attachment_url: string | null;
  migration_remarks: string | null;
  status: string;
  migrated_by: string | null;
  migrated_at: string;
  migration_source: string | null;
  created_at: string;
  // Joined
  client?: { name: string; company_name: string | null } | null;
  project?: { project_name: string } | null;
};

export type InvoiceAuditLog = {
  id: string;
  invoice_id: string;
  action: string;
  performed_by: string | null;
  performed_at: string;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
};

export type InvoiceItem = {
  id: string;
  company_id: string;
  invoice_id: string;
  service_id: string | null;
  item_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number;
  sort_order: number;
  created_at: string;
  // Joined
  service?: Service;
};

export type PaymentMethod = 'bank_transfer' | 'mobile_money' | 'cash' | 'cheque' | 'online' | 'other';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'reversed';

export type Payment = {
  id: string;
  company_id: string;
  payment_number: string;
  invoice_id: string;
  payment_date: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  note: string | null;
  is_confirmed: boolean;
  receipt_url: string | null;
  status: PaymentStatus;
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  // WHT fields
  wht_withheld: number;
  actual_received: number | null;
  wht_certificate_number: string | null;
  wht_certificate_url: string | null;
  created_at: string;
  // Joined
  invoice?: Invoice;
};

export type PaymentAuditLog = {
  id: string;
  payment_id: string;
  action: string;
  performed_by: string | null;
  performed_at: string;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
  amount: number | null;
  metadata: Record<string, unknown> | null;
};

export type ExpenseRecurrence = 'one_off' | 'monthly' | 'annual';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export type ExpenseCategory = {
  id: string;
  company_id: string;
  name: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  company_id: string;
  client_id: string | null;
  project_id: string | null;
  category_id: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  vendor: string | null;
  description: string | null;
  receipt_url: string | null;
  recurrence: ExpenseRecurrence;
  is_system_subscription: boolean;
  renewal_date: string | null;
  created_by: string | null;
  approved_by: string | null;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
  client?: { name: string; company_name: string | null } | null;
  project?: { project_name: string } | null;
  category?: { name: string } | null;
};

// Extended project with calculated invoice totals (from project_totals view)
export type ProjectWithTotals = Project & {
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
};

export type ReportSummary = {
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  total_overdue: number;
  count_draft: number;
  count_sent: number;
  count_partially_paid: number;
  count_paid: number;
  count_overdue: number;
  count_cancelled: number;
};

// ─── Phase 2B: Admin Settings ─────────────────────────────────────────────

export type CompanySettings = {
  id: number;
  company_id: string;
  company_name: string;
  trading_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  country: string;
  currency: string;
  tin: string | null;
  registration_number: string | null;
  logo_url: string | null;
  default_invoice_footer: string | null;
  invoice_prefix: string;
  receipt_prefix: string;
  quote_prefix: string;
  default_due_days: number;
  show_tin_on_invoice: boolean;
  show_logo_on_invoice: boolean;
  show_payment_history: boolean;
  primary_color: string;
  accent_color: string;
  updated_at: string;
};

export type PaymentMethodType =
  | 'mobile_money'
  | 'momo_merchant'
  | 'bank_transfer'
  | 'wire_transfer'
  | 'cash'
  | 'card'
  | 'cheque'
  | 'other';

export type PaymentMethodDB = {
  id: string;
  company_id: string;
  method_type: PaymentMethodType;
  display_name: string;
  account_name: string | null;
  account_number: string | null;
  phone_number: string | null;
  merchant_code: string | null;
  bank_name: string | null;
  branch: string | null;
  swift_code: string | null;
  currency: string;
  instructions: string | null;
  is_active: boolean;
  show_on_invoice: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type Role = {
  id: string;
  label: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
};

export type Permission = {
  id: string;
  module: string;
  action: string;
  label: string;
  description: string | null;
};

export type AppUser = {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  status: 'invited' | 'active' | 'inactive' | 'suspended';
  invited_by: string | null;
  invited_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invited_by: string | null;
  permission_overrides: Record<string, boolean> | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

// ─── Quotation Module ─────────────────────────────────────────────────────────

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'converted';

export type Quotation = {
  id: string;
  company_id: string;
  quotation_number: string;
  client_id: string | null;
  project_name: string;
  issue_date: string;
  valid_until: string;
  currency: string;
  notes: string | null;
  status: QuotationStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
  // Joined
  client?: { name: string; company_name: string | null } | null;
  quotation_items?: QuotationItem[];
};

export type QuotationItem = {
  id: string;
  company_id: string;
  quotation_id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  created_at: string;
};

export type ProjectTask = {
  id: string;
  company_id: string;
  project_id: string | null;
  quotation_id: string | null;
  quotation_item_id: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  is_billable: boolean;
  estimated_hours: number | null;
  task_number?: number | null;
  phase?: string | null;
  created_at: string;
  updated_at: string | null;
};

// ─── Portfolio Management ────────────────────────────────────────────────────

export type PortfolioStatus = 'active' | 'on_hold' | 'completed' | 'archived';
export type HealthStatus = 'on_track' | 'at_risk' | 'off_track' | 'completed';

export type Portfolio = {
  id: string;
  company_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  owner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: PortfolioStatus;
  health_status: HealthStatus;
  budget_total: number;
  progress_percent: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  client?: Client;
  owner?: AppUser;
  projects?: ProjectWithTotals[];
};

export type PortfolioProject = {
  id: string;
  portfolio_id: string;
  project_id: string;
  company_id: string;
  sort_order: number;
  created_at: string;
  project?: ProjectWithTotals;
};

// ─── Project Charter (extended fields) ───────────────────────────────────────

export type ProjectApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export type ProjectWithCharter = Project & {
  objective: string | null;
  scope: string | null;
  deliverables: string | null;
  assumptions: string | null;
  exclusions: string | null;
  baseline_start_date: string | null;
  baseline_due_date: string | null;
  revised_due_date: string | null;
  budget: number | null;
  currency: string;
  sponsor: string | null;
  approval_status: ProjectApprovalStatus;
  project_health: HealthStatus;
  project_phase: string | null;
  internal_only: boolean;
  client_visible: boolean;
  financial_visible: boolean;
};

// ─── Milestones ──────────────────────────────────────────────────────────────

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'missed' | 'cancelled';

export type Milestone = {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  actual_date: string | null;
  status: MilestoneStatus;
  progress: number;
  remarks: string | null;
  client_visible: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  tasks?: ProjectTask[];
};

export type MilestoneTask = {
  id: string;
  milestone_id: string;
  task_id: string;
  company_id: string;
  created_at: string;
};

// ─── RAID Log ────────────────────────────────────────────────────────────────

export type RaidType = 'risk' | 'assumption' | 'issue' | 'decision';
export type RaidSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RaidProbability = 'low' | 'medium' | 'high';
export type RaidStatus = 'open' | 'in_progress' | 'mitigated' | 'resolved' | 'closed' | 'accepted';

export type RaidEntry = {
  id: string;
  company_id: string;
  project_id: string;
  type: RaidType;
  title: string;
  description: string | null;
  owner_id: string | null;
  severity: RaidSeverity;
  probability: RaidProbability;
  impact: string | null;
  mitigation: string | null;
  status: RaidStatus;
  due_date: string | null;
  resolution_note: string | null;
  client_visible: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: AppUser;
};

// ─── Change Requests ─────────────────────────────────────────────────────────

export type ChangeRequestApproval = 'pending' | 'approved' | 'rejected' | 'deferred';

export type ChangeRequest = {
  id: string;
  company_id: string;
  project_id: string;
  request_number: string;
  title: string;
  description: string | null;
  requested_by: string | null;
  scope_impact: string | null;
  cost_impact: number | null;
  timeline_impact: string | null;
  approval_status: ChangeRequestApproval;
  approved_by: string | null;
  approved_date: string | null;
  linked_invoice_id: string | null;
  linked_quotation_id: string | null;
  client_visible: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  requester?: AppUser;
  approver?: AppUser;
};

// ─── Task Comments & Attachments ─────────────────────────────────────────────

export type TaskComment = {
  id: string;
  company_id: string;
  task_id: string;
  user_id: string | null;
  content: string;
  is_internal: boolean;
  client_visible: boolean;
  created_at: string;
  updated_at: string;
  user?: AppUser;
};

export type TaskAttachment = {
  id: string;
  company_id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  is_internal: boolean;
  client_visible: boolean;
  created_at: string;
  uploader?: AppUser;
};

// ─── Saved Report Templates ─────────────────────────────────────────────────

export type ReportTemplateType =
  | 'client_weekly'
  | 'client_monthly'
  | 'internal_health'
  | 'financial'
  | 'task_completion'
  | 'overdue_tasks'
  | 'milestone'
  | 'custom';

export type SavedReportTemplate = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  template_type: ReportTemplateType;
  filters: ReportFilters;
  visibility_options: ReportVisibilityOptions;
  financial_options: ReportFinancialOptions;
  selected_fields: string[];
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Report Audit ────────────────────────────────────────────────────────────

export type ReportAuditAction = 'generated' | 'exported_pdf' | 'exported_csv' | 'shared' | 'template_used';

export type ReportAuditEntry = {
  id: string;
  company_id: string;
  user_id: string | null;
  action: ReportAuditAction;
  report_type: string | null;
  filters_used: ReportFilters | null;
  financial_visibility_enabled: boolean;
  client_id: string | null;
  project_ids: string[] | null;
  export_format: string | null;
  created_at: string;
};

// ─── Report Configuration ────────────────────────────────────────────────────

export type ReportFilters = {
  clientId: string | null;
  projectIds: string[];
  taskStatuses: string[];
  taskPriorities: string[];
  assigneeIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  milestoneIds: string[];
  invoiceStatuses: string[];
  paymentStatuses: string[];
};

export type ReportVisibilityOptions = {
  showCompleted: boolean;
  showInternal: boolean;
  showOverdue: boolean;
  showCancelled: boolean;
  showComments: boolean;
  showAttachments: boolean;
};

export type ReportFinancialOptions = {
  showFinancialSummary: boolean;
  showPerTaskFinancials: boolean;
  showBudgetVsActual: boolean;
  showWhtDetails: boolean;
};

// ─── Financial Summary ───────────────────────────────────────────────────────

export type ProjectFinancialSummary = {
  project_id: string;
  company_id: string;
  budget: number | null;
  invoiced: number;
  paid: number;
  outstanding: number;
  total_expenses: number;
  total_time_cost: number;
  estimated_profit: number;
  profit_margin_percent: number;
};

// ─── Report Data (assembled for PDF/CSV generation) ──────────────────────────

export type ReportData = {
  company: CompanySettings;
  client: Client | null;
  projects: ProjectWithTotals[];
  tasks: ReportTask[];
  milestones: Milestone[];
  raidEntries: RaidEntry[];
  financialSummary: ReportFinancialSummaryData | null;
  filters: ReportFilters;
  visibility: ReportVisibilityOptions;
  financials: ReportFinancialOptions;
  generatedAt: string;
  generatedBy: string;
  reportPeriod: { from: string | null; to: string | null };
  executiveSummary: string | null;
};

export type ReportTask = {
  id: string;
  project_name: string;
  title: string;
  assignee: string | null;
  priority: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  last_update_summary: string | null;
  invoice_status: string | null;
  payment_status: string | null;
  report_note: string | null;
  billed_amount: number | null;
  paid_amount: number | null;
  balance_amount: number | null;
};

export type ReportFinancialSummaryData = {
  totalBudget: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalPendingInvoice: number;
  totalExpenses: number;
  estimatedProfitLoss: number;
  totalWht: number;
  balanceDue: number;
};
