import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ReportFilters,
  ReportVisibilityOptions,
  ReportFinancialOptions,
  ReportData,
  ReportTask,
  ReportFinancialSummaryData,
  CompanySettings,
  Client,
  ProjectWithTotals,
  Milestone,
  RaidEntry,
} from '@/types';

// ─── Report Data Service ────────────────────────────────────────────────────

/**
 * Assembles complete report data from Supabase based on filters and options.
 */
export async function fetchReportData(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  userName: string,
  filters: ReportFilters,
  visibility: ReportVisibilityOptions,
  financials: ReportFinancialOptions,
): Promise<ReportData> {
  // Fetch company settings for branding
  const { data: company } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .single();

  // Fetch client if selected
  let client: Client | null = null;
  if (filters.clientId) {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', filters.clientId)
      .eq('company_id', companyId)
      .single();
    client = data;
  }

  // Fetch projects
  const projects = await fetchProjects(supabase, companyId, filters);

  // Fetch tasks with filters applied
  const tasks = await fetchTasks(supabase, companyId, filters, visibility, projects);

  // Fetch milestones
  const milestones = await fetchMilestones(supabase, companyId, filters.projectIds, visibility);

  // Fetch RAID entries (only if projects selected)
  const raidEntries = await fetchRaidEntries(supabase, companyId, filters.projectIds, visibility);

  // Aggregate financial summary
  let financialSummary: ReportFinancialSummaryData | null = null;
  if (financials.showFinancialSummary && filters.projectIds.length > 0) {
    financialSummary = await aggregateFinancialSummary(supabase, companyId, filters.projectIds);
  }

  return {
    company: company as CompanySettings,
    client,
    projects,
    tasks,
    milestones,
    raidEntries,
    financialSummary,
    filters,
    visibility,
    financials,
    generatedAt: new Date().toISOString(),
    generatedBy: userName,
    reportPeriod: { from: filters.dateFrom, to: filters.dateTo },
    executiveSummary: null,
  };
}

// ─── Projects ───────────────────────────────────────────────────────────────

async function fetchProjects(
  supabase: SupabaseClient,
  companyId: string,
  filters: ReportFilters,
): Promise<ProjectWithTotals[]> {
  let query = supabase
    .from('project_totals')
    .select('*, client:clients(name, company_name)')
    .eq('company_id', companyId);

  if (filters.clientId) {
    query = query.eq('client_id', filters.clientId);
  }

  if (filters.projectIds.length > 0) {
    query = query.in('id', filters.projectIds);
  }

  const { data, error } = await query.order('project_name');
  if (error) throw error;
  return (data || []) as ProjectWithTotals[];
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

async function fetchTasks(
  supabase: SupabaseClient,
  companyId: string,
  filters: ReportFilters,
  visibility: ReportVisibilityOptions,
  projects: ProjectWithTotals[],
): Promise<ReportTask[]> {
  const projectMap = new Map(projects.map(p => [p.id, p.project_name]));

  let query = supabase
    .from('project_tasks')
    .select('*')
    .eq('company_id', companyId);

  // Filter by projects
  const projectIds = filters.projectIds.length > 0
    ? filters.projectIds
    : projects.map(p => p.id);

  if (projectIds.length > 0) {
    query = query.in('project_id', projectIds);
  }

  // Status filter
  if (filters.taskStatuses.length > 0) {
    query = query.in('status', filters.taskStatuses);
  }

  // Priority filter
  if (filters.taskPriorities.length > 0) {
    query = query.in('priority', filters.taskPriorities);
  }

  // Assignee filter
  if (filters.assigneeIds.length > 0) {
    query = query.in('assigned_to', filters.assigneeIds);
  }

  // Date range
  if (filters.dateFrom) {
    query = query.gte('start_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('end_date', filters.dateTo);
  }

  // Invoice status
  if (filters.invoiceStatuses.length > 0) {
    query = query.in('invoice_status', filters.invoiceStatuses);
  }

  // Payment status
  if (filters.paymentStatuses.length > 0) {
    query = query.in('payment_status', filters.paymentStatuses);
  }

  // Visibility filters
  if (!visibility.showCompleted) {
    query = query.neq('status', 'completed');
  }
  if (!visibility.showCancelled) {
    query = query.neq('status', 'cancelled');
  }
  if (!visibility.showInternal) {
    query = query.eq('internal_only', false);
  }

  const { data, error } = await query.order('sort_order');
  if (error) throw error;

  const tasks: ReportTask[] = (data || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    project_name: projectMap.get(t.project_id as string) || 'Unknown Project',
    title: t.title as string,
    assignee: (t.assigned_to as string) || null,
    priority: (t.priority as string) || 'medium',
    status: (t.status as string) || 'pending',
    start_date: (t.start_date as string) || null,
    due_date: (t.end_date as string) || null,
    progress: (t.progress as number) || 0,
    last_update_summary: (t.last_update_summary as string) || null,
    invoice_status: (t.invoice_status as string) || null,
    payment_status: (t.payment_status as string) || null,
    report_note: (t.report_note as string) || null,
    billed_amount: (t.billed_amount as number) || null,
    paid_amount: (t.paid_amount as number) || null,
    balance_amount: (t.balance_amount as number) || null,
  }));

  // Filter overdue if needed
  if (!visibility.showOverdue) {
    const now = new Date().toISOString().split('T')[0];
    return tasks.filter(t => !t.due_date || t.due_date >= now || t.status === 'completed');
  }

  return tasks;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

async function fetchMilestones(
  supabase: SupabaseClient,
  companyId: string,
  projectIds: string[],
  visibility: ReportVisibilityOptions,
): Promise<Milestone[]> {
  if (projectIds.length === 0) return [];

  let query = supabase
    .from('milestones')
    .select('*')
    .eq('company_id', companyId)
    .in('project_id', projectIds);

  if (!visibility.showInternal) {
    query = query.eq('client_visible', true);
  }

  const { data, error } = await query.order('sort_order');
  if (error) return [];
  return (data || []) as Milestone[];
}

// ─── RAID Entries ───────────────────────────────────────────────────────────

async function fetchRaidEntries(
  supabase: SupabaseClient,
  companyId: string,
  projectIds: string[],
  visibility: ReportVisibilityOptions,
): Promise<RaidEntry[]> {
  if (projectIds.length === 0) return [];

  let query = supabase
    .from('raid_log')
    .select('*')
    .eq('company_id', companyId)
    .in('project_id', projectIds)
    .in('status', ['open', 'in_progress']);

  if (!visibility.showInternal) {
    query = query.eq('client_visible', true);
  }

  const { data, error } = await query.order('severity');
  if (error) return [];
  return (data || []) as RaidEntry[];
}

// ─── Financial Aggregation ──────────────────────────────────────────────────

async function aggregateFinancialSummary(
  supabase: SupabaseClient,
  companyId: string,
  projectIds: string[],
): Promise<ReportFinancialSummaryData> {
  // Fetch from project_totals view
  const { data: projects } = await supabase
    .from('project_totals')
    .select('total_contract_amount, total_invoiced, total_paid, outstanding')
    .eq('company_id', companyId)
    .in('id', projectIds);

  // Fetch expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('company_id', companyId)
    .in('project_id', projectIds)
    .in('status', ['approved', 'paid']);

  // Fetch WHT totals
  const { data: invoices } = await supabase
    .from('invoices')
    .select('wht_amount, balance_due, status')
    .eq('company_id', companyId)
    .in('project_id', projectIds)
    .eq('apply_wht', true);

  const totalBudget = (projects || []).reduce((s, p) => s + (Number(p.total_contract_amount) || 0), 0);
  const totalInvoiced = (projects || []).reduce((s, p) => s + (Number(p.total_invoiced) || 0), 0);
  const totalPaid = (projects || []).reduce((s, p) => s + (Number(p.total_paid) || 0), 0);
  const totalOutstanding = (projects || []).reduce((s, p) => s + (Number(p.outstanding) || 0), 0);
  const totalExpenses = (expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalWht = (invoices || []).reduce((s, i) => s + (Number(i.wht_amount) || 0), 0);

  // Pending invoice = budget - invoiced (if positive)
  const totalPendingInvoice = Math.max(0, totalBudget - totalInvoiced);
  const estimatedProfitLoss = totalPaid - totalExpenses;
  const balanceDue = totalOutstanding;

  return {
    totalBudget,
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    totalPendingInvoice,
    totalExpenses,
    estimatedProfitLoss,
    totalWht,
    balanceDue,
  };
}

// ─── Audit Logging ──────────────────────────────────────────────────────────

export async function logReportExport(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  action: 'generated' | 'exported_pdf' | 'exported_csv' | 'shared' | 'template_used',
  filters: ReportFilters,
  financialVisibility: boolean,
  exportFormat?: string,
): Promise<void> {
  await supabase.from('report_audit_log').insert({
    company_id: companyId,
    user_id: userId,
    action,
    report_type: 'client_report',
    filters_used: filters,
    financial_visibility_enabled: financialVisibility,
    client_id: filters.clientId,
    project_ids: filters.projectIds,
    export_format: exportFormat || null,
  });
}
