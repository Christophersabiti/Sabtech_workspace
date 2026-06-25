'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { Project, Invoice, InvoiceSchedule, Client } from '@/types';
import { formatCurrency, formatDate, BILLING_TYPE_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  ArrowLeft, Plus, X, Pencil, Trash2, Tag, Settings2,
  CheckCircle, XCircle, Download, Upload, FileSpreadsheet, AlertCircle,
  Printer, Link2, ExternalLink, Clock, TrendingUp, TrendingDown, GitBranch,
} from 'lucide-react';

// ── New PM components ──────────────────────────────────────────────────────────
import { ProjectViewSwitcher }                       from '@/components/projects/ProjectViewSwitcher';
import { ProjectKpiCards }                           from '@/components/projects/ProjectKpiCards';
import { ProjectFilters, applyFilters, EMPTY_FILTERS } from '@/components/projects/ProjectFilters';
import type { TaskFilters }                          from '@/components/projects/ProjectFilters';
import { ProjectKanbanView }                         from '@/components/projects/ProjectKanbanView';
import { ProjectGanttView }                          from '@/components/projects/ProjectGanttView';
import { ProjectTaskDrawer }                         from '@/components/projects/ProjectTaskDrawer';
import { TimeLogDrawer }                             from '@/components/projects/TimeLogDrawer';
import type { TaskFormValues }                       from '@/components/projects/ProjectTaskDrawer';
import type { EnhancedProjectTask, TaskDependency, TaskViewMode, TaskStatus } from '@/components/projects/types';
import RaidLogPanel                                  from '@/components/projects/RaidLogPanel';
import MilestonesPanel                               from '@/components/projects/MilestonesPanel';
import ChangeRequestPanel                            from '@/components/projects/ChangeRequestPanel';
import type { RaidEntry, Milestone, ChangeRequest }  from '@/types';
import { formatScheduleVariance, getTaskBaselineVariance } from '@/components/projects/scheduleUtils';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_STATUS_DOT,
} from '@/components/projects/types';

// ─── Legacy types preserved for CSV upload compatibility ─────────────────────

type Tab = 'overview' | 'tasks' | 'invoices' | 'schedule' | 'milestones' | 'raid' | 'changes';

type TaskUploadRow = {
  rowNumber: number;
  task_number?: number | null;
  phase?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  assigned_to: string;
  status: TaskStatus;
  errors: string[];
};

type ScheduleFormState = {
  schedule_name: string;
  description: string;
  percentage: string;
  fixed_amount: string;
  due_date: string;
  invoice_id: string;
};

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  schedule_name: '',
  description: '',
  percentage: '',
  fixed_amount: '',
  due_date: '',
  invoice_id: '',
};

const TASK_TEMPLATE_HEADERS = ['Task Number', 'Phase', 'Title', 'Description', 'Start Date', 'Due Date', 'Assigned To', 'Status'];

const TASK_STATUS_ALIASES: Record<string, TaskStatus> = {
  pending:     'pending',
  notstarted:  'pending',
  not_started: 'pending',
  todo:        'pending',
  backlog:     'backlog',
  inprogress:  'in_progress',
  in_progress: 'in_progress',
  progress:    'in_progress',
  inreview:    'in_review',
  in_review:   'in_review',
  review:      'in_review',
  blocked:     'blocked',
  block:       'blocked',
  completed:   'completed',
  complete:    'completed',
  done:        'completed',
  cancelled:   'cancelled',
  canceled:    'cancelled',
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function encodeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; i++; } else { quoted = !quoted; }
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(value.trim());
      if (row.some(c => c.length > 0)) rows.push(row);
      row = []; value = '';
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(c => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeTaskStatus(v: string): TaskStatus | null {
  if (!v.trim()) return 'pending';
  const key = v.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
  return TASK_STATUS_ALIASES[key] || null;
}
function normalizeHeader(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function parseAndNormalizeCsvDate(v: string): { isoDate: string; error: string | null } {
  const trimmed = v.trim();
  if (!trimmed) return { isoDate: '', error: null };
  
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return { isoDate: '', error: 'must use DD/MM/YYYY format.' };
  }
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  if (month < 1 || month > 12) {
    return { isoDate: '', error: 'month must be between 1 and 12.' };
  }
  
  const maxDays = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDays) {
    return { isoDate: '', error: `day must be between 1 and ${maxDays}.` };
  }
  
  const mm = month < 10 ? `0${month}` : `${month}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return { isoDate: `${year}-${mm}-${dd}`, error: null };
}

function buildTaskUploadRows(text: string): { rows: TaskUploadRow[]; error: string | null } {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return { rows: [], error: 'Upload a CSV with a header row and at least one task.' };
  const headers = csvRows[0].map(normalizeHeader);
  const idx = (names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const titleIdx   = idx(['title','task','task_title']);
  if (titleIdx < 0) return { rows: [], error: 'The CSV must include a Title column.' };
  const taskNoIdx  = idx(['task_number', 'task_no', 'task_num', 'number', 'no', '#']);
  const phaseIdx   = idx(['phase', 'phases']);
  const descIdx    = idx(['description','details','notes']);
  const startIdx   = idx(['start_date','start']);
  const dueIdx     = idx(['due_date','end_date','deadline','due']);
  const assignIdx  = idx(['assigned_to','assignee','owner']);
  const statusIdx  = idx(['status']);
  const rows = csvRows.slice(1).map((r, i) => {
    const sv = statusIdx >= 0 ? r[statusIdx] || '' : '';
    const status = normalizeTaskStatus(sv);
    const rawNo = taskNoIdx >= 0 ? r[taskNoIdx]?.trim() || '' : '';
    const parsedNo = rawNo ? parseInt(rawNo, 10) : null;
    const task_number = (parsedNo != null && !isNaN(parsedNo)) ? parsedNo : null;
    const phase = phaseIdx >= 0 ? r[phaseIdx]?.trim() || '' : '';

    const row: TaskUploadRow = {
      rowNumber: i + 2,
      task_number,
      phase,
      title:       r[titleIdx]?.trim()   || '',
      description: descIdx  >= 0 ? r[descIdx]?.trim()  || '' : '',
      start_date:  startIdx >= 0 ? r[startIdx]?.trim() || '' : '',
      end_date:    dueIdx   >= 0 ? r[dueIdx]?.trim()   || '' : '',
      assigned_to: assignIdx>= 0 ? r[assignIdx]?.trim()|| '' : '',
      status:      status || 'pending',
      errors: [],
    };
    if (!row.title) row.errors.push('Title is required.');
    if (!status)    row.errors.push('Invalid status value.');
    if (rawNo && (parsedNo === null || isNaN(parsedNo))) {
      row.errors.push('Task Number must be a valid integer.');
    }
    
    const startParse = parseAndNormalizeCsvDate(row.start_date);
    const dueParse = parseAndNormalizeCsvDate(row.end_date);
    
    if (startParse.error) {
      row.errors.push(`Start Date: ${startParse.error}`);
    } else {
      row.start_date = startParse.isoDate;
    }
    
    if (dueParse.error) {
      row.errors.push(`Due Date: ${dueParse.error}`);
    } else {
      row.end_date = dueParse.isoDate;
    }
    
    if (row.start_date && row.end_date && row.end_date < row.start_date)
      row.errors.push('Due Date cannot be before Start Date.');
    return row;
  }).filter(r => r.title || r.description || r.start_date || r.end_date || r.assigned_to || r.phase || r.task_number != null);
  if (rows.length === 0) return { rows: [], error: 'No task rows found in the CSV.' };
  return { rows, error: null };
}

function sortTasksByTaskNumberAsc(list: EnhancedProjectTask[]) {
  return [...list].sort((a, b) => {
    const aNum = a.task_number ?? 0;
    const bNum = b.task_number ?? 0;
    if (aNum !== bNum) return aNum - bNum;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
}

function parseOptionalAmount(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scheduleStatusFromInvoice(invoice: Invoice | null, fallback: InvoiceSchedule['status']): InvoiceSchedule['status'] {
  if (!invoice) return fallback;
  if (invoice.status === 'paid' || Number(invoice.balance_due || 0) <= 0) return 'paid';
  if (invoice.status === 'cancelled' || invoice.status === 'void') return 'pending';
  return 'invoiced';
}

const scheduleStatusClasses: Record<InvoiceSchedule['status'], string> = {
  pending: 'bg-slate-100 text-slate-600',
  invoiced: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function scheduleVarianceBadgeClass(days: number) {
  if (days === 0) return 'text-slate-600 bg-slate-50 border-slate-200';
  return days > 0
    ? 'text-red-700 bg-red-50 border-red-100'
    : 'text-emerald-700 bg-emerald-50 border-emerald-100';
}

const TASK_VIEW_KEY = 'sabtech_task_view';

export default function ProjectProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [project,   setProject]   = useState<Project & { client: Client } | null>(null);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [schedules, setSchedules] = useState<InvoiceSchedule[]>([]);
  const [tasks,     setTasks]     = useState<EnhancedProjectTask[]>([]);
  const [loading,   setLoading]   = useState(true);

  // ── PM state ──────────────────────────────────────────────────────────────
  const [milestones,     setMilestones]     = useState<Milestone[]>([]);
  const [raidEntries,    setRaidEntries]    = useState<RaidEntry[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<TaskDependency[]>([]);

  // ── Timesheets + Expenses P&L state ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [expenses, setExpenses] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [timeLogDrawerOpen, setTimeLogDrawerOpen] = useState(false);
  const [timeLogDrawerTask, setTimeLogDrawerTask] = useState<EnhancedProjectTask | null>(null);

  // ── View mode ──────────────────────────────────────────────────────────────
  const [taskView, setTaskView] = useState<TaskViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (window.localStorage.getItem(TASK_VIEW_KEY) as TaskViewMode) || 'list';
    }
    return 'list';
  });
  const [taskFilters, setTaskFilters] = useState<TaskFilters>(EMPTY_FILTERS);

  function handleViewChange(v: TaskViewMode) {
    setTaskView(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(TASK_VIEW_KEY, v);
  }

  // ── Task drawer ────────────────────────────────────────────────────────────
  const [drawerOpen,          setDrawerOpen]          = useState(false);
  const [drawerTask,          setDrawerTask]          = useState<EnhancedProjectTask | null>(null);
  const [drawerDefaultStatus, setDrawerDefaultStatus] = useState<TaskStatus | undefined>(undefined);
  const [savingDrawer,        setSavingDrawer]        = useState(false);

  // ── Project edit modal ─────────────────────────────────────────────────────
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState({
    project_name: '', project_manager: '', status: 'active' as Project['status'],
    start_date: '', end_date: '', total_contract_amount: '', description: '',
    portfolio_id: '',
  });
  const [savingProject, setSavingProject] = useState(false);
  const [projectToast,  setProjectToast]  = useState<{ msg: string; ok: boolean } | null>(null);

  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>('');

  // ── Schedule modal ─────────────────────────────────────────────────────────
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<InvoiceSchedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [linkingScheduleId, setLinkingScheduleId] = useState<string | null>(null);

  // ── CSV Upload ─────────────────────────────────────────────────────────────
  const [showTaskUpload,    setShowTaskUpload]    = useState(false);
  const [taskUploadFileName, setTaskUploadFileName] = useState('');
  const [taskUploadRows,    setTaskUploadRows]    = useState<TaskUploadRow[]>([]);
  const [taskUploadError,   setTaskUploadError]   = useState<string | null>(null);
  const [savingTaskUpload,  setSavingTaskUpload]  = useState(false);

  // ── Active tab ─────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('overview');

  // ── Confirm delete ─────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (companyLoading) return;
    if (!activeCompanyId) {
      setProject(null); setInvoices([]); setSchedules([]); setTasks([]); setTaskDependencies([]); setLoading(false);
      return;
    }
    setLoading(true);
    const [
      { data: proj },
      { data: inv },
      { data: sched },
      { data: tsk },
      { data: exp },
      { data: ports },
      { data: ppLinks }
    ] = await Promise.all([
      supabase.from('projects').select('*, client:clients(*)').eq('id', id).eq('company_id', activeCompanyId).single(),
      supabase.from('invoices').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('issue_date', { ascending: false }),
      supabase.from('invoice_schedules').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('sort_order'),
      supabase.from('project_tasks').select('*').eq('project_id', id).eq('company_id', activeCompanyId)
        .order('sort_order').order('start_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('expenses').select('*, category:expense_categories(name)').eq('project_id', id).eq('company_id', activeCompanyId),
      supabase.from('portfolios').select('id, name').eq('company_id', activeCompanyId).order('name'),
      supabase.from('portfolio_projects').select('portfolio_id').eq('project_id', id).eq('company_id', activeCompanyId).limit(1)
    ]);
    setProject(proj as Project & { client: Client });
    setInvoices(inv || []);
    setSchedules(sched || []);
    setExpenses(exp || []);
    setPortfolios((ports || []) as { id: string; name: string }[]);
    const linkedPortId = ppLinks && ppLinks[0] ? ppLinks[0].portfolio_id : '';
    setCurrentPortfolioId(linkedPortId);

    // Load PM data in parallel
    const [{ data: msData }, { data: raidData }, { data: crData }, { data: depData }] = await Promise.all([
      supabase.from('milestones').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('sort_order').order('target_date', { ascending: true, nullsFirst: false }),
      supabase.from('raid_log').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('created_at', { ascending: false }),
      supabase.from('change_requests').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('created_at', { ascending: false }),
      supabase.from('task_dependencies').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('created_at', { ascending: true }),
    ]);
    setMilestones((msData || []) as Milestone[]);
    setRaidEntries((raidData || []) as RaidEntry[]);
    setChangeRequests((crData || []) as ChangeRequest[]);
    setTaskDependencies((depData || []) as TaskDependency[]);

    // Load time logs for project tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskIds = (tsk || []).map((t: any) => t.id);
    if (taskIds.length > 0) {
      const { data: logs } = await supabase
        .from('task_time_logs')
        .select('*')
        .in('task_id', taskIds)
        .eq('company_id', activeCompanyId);
      setTimeLogs(logs || []);
    } else {
      setTimeLogs([]);
    }

    // Normalise tasks — ensure new fields have defaults for rows created before migration
    setTasks(sortTasksByTaskNumberAsc((tsk || []).map((t: Record<string, unknown>) => ({
      ...t,
      priority:      t.priority      ?? 'medium',
      progress:      t.progress      ?? 0,
      sort_order:    t.sort_order    ?? 0,
      parent_task_id: t.parent_task_id ?? null,
      tags:          Array.isArray(t.tags) ? t.tags : [],
      task_number:   t.task_number != null ? Number(t.task_number) : null,
      phase:         t.phase         ?? null,
      baseline_start_date: t.baseline_start_date ?? null,
      baseline_due_date:   t.baseline_due_date   ?? null,
      revised_due_date:    t.revised_due_date    ?? null,
      actual_start_date:   t.actual_start_date   ?? null,
      actual_completion_date: t.actual_completion_date ?? null,
      is_critical_path: Boolean(t.is_critical_path),
      is_blocker:       Boolean(t.is_blocker),
    })) as EnhancedProjectTask[]));
    setLoading(false);
  }, [activeCompanyId, companyLoading, id, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setProject(null); setInvoices([]); setSchedules([]); setTasks([]); setTaskDependencies([]);
      setMilestones([]); setRaidEntries([]); setChangeRequests([]);
      return load();
    });
  }, [load]);

  // ── Project edit ───────────────────────────────────────────────────────────
  function openEditProject() {
    if (!project) return;
    setEditProjectForm({
      project_name:           project.project_name,
      project_manager:        project.project_manager || '',
      status:                 project.status,
      start_date:             project.start_date || '',
      end_date:               project.end_date || '',
      total_contract_amount:  project.total_contract_amount != null ? String(project.total_contract_amount) : '',
      description:            project.description || '',
      portfolio_id:           currentPortfolioId,
    });
    setShowEditProject(true);
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSavingProject(true);
    const payload: Partial<Project> = {
      project_name:          editProjectForm.project_name.trim(),
      project_manager:       editProjectForm.project_manager.trim() || null,
      status:                editProjectForm.status,
      start_date:            editProjectForm.start_date || null,
      end_date:              editProjectForm.end_date || null,
      total_contract_amount: editProjectForm.total_contract_amount ? parseFloat(editProjectForm.total_contract_amount) : null,
      description:           editProjectForm.description.trim() || null,
    };
    
    // Save project changes
    const { error } = await supabase.from('projects').update(payload).eq('id', id).eq('company_id', project.company_id);
    
    if (error) {
      setProjectToast({ msg: error.message, ok: false });
    } else {
      // Sync portfolio linkage if changed
      if (editProjectForm.portfolio_id !== currentPortfolioId) {
        await supabase.from('portfolio_projects').delete().eq('project_id', id).eq('company_id', project.company_id);
        if (editProjectForm.portfolio_id) {
          await supabase.from('portfolio_projects').insert({
            company_id: project.company_id,
            project_id: id,
            portfolio_id: editProjectForm.portfolio_id,
          });
        }
        setCurrentPortfolioId(editProjectForm.portfolio_id);
      }

      setProject(p => p ? { ...p, ...payload } : p);
      setShowEditProject(false);
      setProjectToast({ msg: 'Project updated.', ok: true });
    }
    setSavingProject(false);
    setTimeout(() => setProjectToast(null), 3000);
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────
  function getScheduleAmount(schedule: InvoiceSchedule): number | null {
    const fixedAmount = schedule.fixed_amount != null ? Number(schedule.fixed_amount) : null;
    if (fixedAmount != null && Number.isFinite(fixedAmount)) return fixedAmount;

    const percentage = schedule.percentage != null ? Number(schedule.percentage) : null;
    const contractAmount = project?.total_contract_amount != null ? Number(project.total_contract_amount) : null;
    if (percentage != null && contractAmount != null && Number.isFinite(percentage) && Number.isFinite(contractAmount)) {
      return contractAmount * percentage / 100;
    }

    return null;
  }

  function getScheduleInvoice(schedule: InvoiceSchedule): Invoice | null {
    return (
      invoices.find(inv => inv.id === schedule.generated_invoice_id) ||
      invoices.find(inv => inv.schedule_id === schedule.id) ||
      null
    );
  }

  function getScheduleStatus(schedule: InvoiceSchedule, invoice: Invoice | null): InvoiceSchedule['status'] {
    return scheduleStatusFromInvoice(invoice, schedule.status);
  }

  function openAddSchedule() {
    setEditingSchedule(null);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setShowScheduleForm(true);
  }

  function openEditSchedule(schedule: InvoiceSchedule) {
    const linkedInvoice = getScheduleInvoice(schedule);
    setEditingSchedule(schedule);
    setScheduleForm({
      schedule_name: schedule.schedule_name,
      description: schedule.description || '',
      percentage: schedule.percentage != null ? String(schedule.percentage) : '',
      fixed_amount: schedule.fixed_amount != null ? String(schedule.fixed_amount) : '',
      due_date: schedule.due_date || '',
      invoice_id: linkedInvoice?.id || '',
    });
    setShowScheduleForm(true);
  }

  function closeScheduleForm() {
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
  }

  async function saveScheduleLine(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;

    const selectedInvoice = invoices.find(inv => inv.id === scheduleForm.invoice_id) || null;
    const percentage = parseOptionalAmount(scheduleForm.percentage);
    const fixedAmount = parseOptionalAmount(scheduleForm.fixed_amount);

    setSavingSchedule(true);

    const schedulePayload = {
      schedule_name: scheduleForm.schedule_name.trim(),
      description: scheduleForm.description.trim() || null,
      percentage,
      fixed_amount: fixedAmount,
      due_date: scheduleForm.due_date || null,
      status: scheduleStatusFromInvoice(selectedInvoice, selectedInvoice ? 'invoiced' : 'pending'),
      generated_invoice_id: selectedInvoice?.id ?? null,
    };

    let scheduleId = editingSchedule?.id;
    let saveError: { message: string } | null = null;

    if (editingSchedule) {
      const { error } = await supabase
        .from('invoice_schedules')
        .update(schedulePayload)
        .eq('id', editingSchedule.id)
        .eq('company_id', project.company_id);
      saveError = error;
    } else {
      const { data, error } = await supabase
        .from('invoice_schedules')
        .insert({
          ...schedulePayload,
          company_id: project.company_id,
          project_id: id,
          sort_order: schedules.length,
        })
        .select('id')
        .single();
      scheduleId = data?.id;
      saveError = error;
    }

    if (!saveError && scheduleId) {
      const previousInvoice = editingSchedule ? getScheduleInvoice(editingSchedule) : null;
      const updatePromises = [];

      if (selectedInvoice) {
        updatePromises.push(
          supabase
            .from('invoices')
            .update({ schedule_id: scheduleId, project_id: id })
            .eq('id', selectedInvoice.id)
            .eq('company_id', project.company_id),
        );
      }

      if (previousInvoice && previousInvoice.id !== selectedInvoice?.id) {
        updatePromises.push(
          supabase
            .from('invoices')
            .update({ schedule_id: null })
            .eq('id', previousInvoice.id)
            .eq('schedule_id', scheduleId)
            .eq('company_id', project.company_id),
        );
      }

      const linkResults = await Promise.all(updatePromises);
      saveError = linkResults.find(result => result.error)?.error ?? null;
    }

    if (!saveError) {
      closeScheduleForm();
      await load();
    } else {
      alert('Error: ' + saveError.message);
    }

    setSavingSchedule(false);
  }

  async function linkScheduleToInvoice(schedule: InvoiceSchedule, invoice: Invoice) {
    if (!project) return;
    setLinkingScheduleId(schedule.id);

    const scheduleStatus = scheduleStatusFromInvoice(invoice, 'invoiced');
    const [scheduleResult, invoiceResult] = await Promise.all([
      supabase
        .from('invoice_schedules')
        .update({ generated_invoice_id: invoice.id, status: scheduleStatus })
        .eq('id', schedule.id)
        .eq('company_id', project.company_id),
      supabase
        .from('invoices')
        .update({ schedule_id: schedule.id, project_id: id })
        .eq('id', invoice.id)
        .eq('company_id', project.company_id),
    ]);

    const error = scheduleResult.error || invoiceResult.error;
    if (error) alert('Error: ' + error.message);
    else await load();

    setLinkingScheduleId(null);
  }

  function openScheduleDocument(print = false) {
    window.open(`/api/pdf/project/${id}/billing-schedule${print ? '?print=1' : ''}`, '_blank');
  }

  // ── Task CRUD (unified) ────────────────────────────────────────────────────
  function openAddTask(defaultStatus?: TaskStatus) {
    setDrawerTask(null);
    setDrawerDefaultStatus(defaultStatus ?? 'pending');
    setDrawerOpen(true);
  }

  function openEditTask(task: EnhancedProjectTask) {
    setDrawerTask(task);
    setDrawerDefaultStatus(undefined);
    setDrawerOpen(true);
  }

  async function saveTaskDependencies(taskId: string, dependencies: TaskFormValues['dependencies']) {
    if (!project) return false;

    const allowedTaskIds = new Set(tasks.filter(t => t.id !== taskId).map(t => t.id));
    const seen = new Set<string>();
    const normalized = dependencies.filter((dependency) => {
      if (!allowedTaskIds.has(dependency.depends_on_task_id)) return false;
      if (seen.has(dependency.depends_on_task_id)) return false;
      seen.add(dependency.depends_on_task_id);
      return true;
    });

    const { error: deleteError } = await supabase
      .from('task_dependencies')
      .delete()
      .eq('task_id', taskId)
      .eq('company_id', project.company_id);

    if (deleteError) {
      setProjectToast({ msg: deleteError.message, ok: false });
      setTimeout(() => setProjectToast(null), 3000);
      return false;
    }

    if (normalized.length === 0) {
      setTaskDependencies(prev => prev.filter(dependency => dependency.task_id !== taskId));
      return true;
    }

    const payload = normalized.map(dependency => ({
      company_id: project.company_id,
      project_id: id,
      task_id: taskId,
      depends_on_task_id: dependency.depends_on_task_id,
      dependency_type: dependency.dependency_type,
    }));

    const { data, error } = await supabase
      .from('task_dependencies')
      .insert(payload)
      .select();

    if (error) {
      setProjectToast({ msg: error.message, ok: false });
      setTimeout(() => setProjectToast(null), 3000);
      return false;
    }

    setTaskDependencies(prev => [
      ...prev.filter(dependency => dependency.task_id !== taskId),
      ...((data || []) as TaskDependency[]),
    ]);
    return true;
  }

  async function saveTaskFromDrawer(values: TaskFormValues) {
    if (!project) return;
    setSavingDrawer(true);

    const tagsArray = values.tags
      ? values.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const payload = {
      title:           values.title.trim(),
      description:     values.description.trim() || null,
      status:          values.status,
      priority:        values.priority,
      progress:        values.status === 'completed' ? 100 : values.progress,
      start_date:      values.start_date || null,
      end_date:        values.end_date   || null,
      assigned_to:     values.assigned_to.trim() || null,
      is_billable:     values.is_billable,
      estimated_hours: values.estimated_hours ? parseFloat(values.estimated_hours) : null,
      tags:            tagsArray,
      task_number:     values.task_number ? parseInt(values.task_number, 10) : null,
      phase:           values.phase.trim() || null,
      parent_task_id:  values.parent_task_id || null,
      baseline_start_date: values.baseline_start_date || null,
      baseline_due_date:   values.baseline_due_date   || null,
      revised_due_date:    values.revised_due_date    || null,
      actual_start_date:   values.actual_start_date   || null,
      actual_completion_date: values.actual_completion_date || null,
      is_critical_path: values.is_critical_path,
      is_blocker:       values.is_blocker,
    };

    if (drawerTask) {
      // Update
      const { error } = await supabase
        .from('project_tasks')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', drawerTask.id)
        .eq('company_id', project.company_id);
      if (!error) {
        const dependenciesSaved = await saveTaskDependencies(drawerTask.id, values.dependencies);
        if (!dependenciesSaved) {
          setSavingDrawer(false);
          return;
        }
        setTasks(ts => sortTasksByTaskNumberAsc(
          ts.map(t => t.id === drawerTask.id ? { ...t, ...payload } : t)
        ));
        setProjectToast({ msg: 'Task updated.', ok: true });
        setTimeout(() => setProjectToast(null), 2500);
      }
    } else {
      // Create
      const { data, error } = await supabase
        .from('project_tasks')
        .insert({ ...payload, company_id: project.company_id, project_id: id, sort_order: tasks.length })
        .select()
        .single();
      if (!error && data) {
        const newTask = {
          ...data,
          priority:      data.priority       ?? 'medium',
          progress:      data.progress       ?? 0,
          sort_order:    data.sort_order     ?? tasks.length,
          parent_task_id: data.parent_task_id ?? null,
          tags:          Array.isArray(data.tags) ? data.tags : [],
          task_number:   data.task_number    ?? null,
          phase:         data.phase          ?? null,
          baseline_start_date: data.baseline_start_date ?? null,
          baseline_due_date:   data.baseline_due_date   ?? null,
          revised_due_date:    data.revised_due_date    ?? null,
          actual_start_date:   data.actual_start_date   ?? null,
          actual_completion_date: data.actual_completion_date ?? null,
          is_critical_path: Boolean(data.is_critical_path),
          is_blocker:       Boolean(data.is_blocker),
        } as EnhancedProjectTask;
        await saveTaskDependencies(newTask.id, values.dependencies);
        setTasks(ts => sortTasksByTaskNumberAsc([...ts, newTask]));
        setProjectToast({ msg: 'Task created.', ok: true });
        setTimeout(() => setProjectToast(null), 2500);
      }
    }

    setSavingDrawer(false);
    setDrawerOpen(false);
  }

  async function deleteTask(taskId: string) {
    if (!project) return;
    await supabase.from('project_tasks').delete().eq('id', taskId).eq('company_id', project.company_id);
    setTasks(ts => ts
      .filter(t => t.id !== taskId)
      .map(t => t.parent_task_id === taskId ? { ...t, parent_task_id: null } : t)
    );
    setTaskDependencies(dependencies => dependencies.filter(d =>
      d.task_id !== taskId && d.depends_on_task_id !== taskId,
    ));
    setConfirmDeleteId(null);
    setDrawerOpen(false);
    setProjectToast({ msg: 'Task deleted.', ok: true });
    setTimeout(() => setProjectToast(null), 2500);
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
    if (!project) return;
    setTasks(ts => sortTasksByTaskNumberAsc(ts.map(t =>
      t.id === taskId
        ? {
            ...t,
            status: newStatus,
            progress: newStatus === 'completed' ? 100 : t.progress,
            actual_completion_date: newStatus === 'completed' ? (t.actual_completion_date ?? today) : t.actual_completion_date,
          }
        : t
    )));
    const statusPayload = {
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : undefined,
      actual_completion_date: newStatus === 'completed' ? today : undefined,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('project_tasks')
      .update(statusPayload)
      .eq('id', taskId).eq('company_id', project.company_id);
  }

  // ── CSV Upload ─────────────────────────────────────────────────────────────
  function downloadTaskTemplate() {
    const csv = `${TASK_TEMPLATE_HEADERS.map(encodeCsvCell).join(',')}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'project-task-upload-template.csv'; link.click();
    URL.revokeObjectURL(url);
  }

  async function readTaskUploadFile(file: File) {
    setTaskUploadFileName(file.name); setTaskUploadError(null); setTaskUploadRows([]);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setTaskUploadError('Please upload a CSV file.'); return;
    }
    const text = await file.text();
    const { rows, error } = buildTaskUploadRows(text);
    setTaskUploadRows(rows); setTaskUploadError(error);
  }

  async function saveTaskUpload() {
    if (!project) return;
    const validRows = taskUploadRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;
    setSavingTaskUpload(true);
    const payload = validRows.map((r, i) => ({
      company_id:  project.company_id, project_id: id,
      title:       r.title, description: r.description || null,
      start_date:  r.start_date || null, end_date: r.end_date || null,
      assigned_to: r.assigned_to || null, status: r.status,
      priority: 'medium', progress: 0, sort_order: tasks.length + i,
      tags: [],
      task_number: r.task_number || null,
      phase:       r.phase || null,
      parent_task_id: null,
      baseline_start_date: null,
      baseline_due_date: null,
      revised_due_date: null,
      actual_start_date: null,
      actual_completion_date: null,
      is_critical_path: false,
      is_blocker: false,
    }));
    const { data, error } = await supabase.from('project_tasks').insert(payload).select();
    if (error) {
      setTaskUploadError(error.message);
    } else {
      const newTasks = (data || []).map((t: Record<string, unknown>) => ({
        ...t,
        priority:      t.priority      ?? 'medium',
        progress:      t.progress      ?? 0,
        sort_order:    t.sort_order    ?? 0,
        parent_task_id: t.parent_task_id ?? null,
        tags:          Array.isArray(t.tags) ? t.tags : [],
        task_number:   t.task_number != null ? Number(t.task_number) : null,
        phase:         t.phase         ?? null,
        baseline_start_date: t.baseline_start_date ?? null,
        baseline_due_date:   t.baseline_due_date   ?? null,
        revised_due_date:    t.revised_due_date    ?? null,
        actual_start_date:   t.actual_start_date   ?? null,
        actual_completion_date: t.actual_completion_date ?? null,
        is_critical_path: Boolean(t.is_critical_path),
        is_blocker:       Boolean(t.is_blocker),
      })) as EnhancedProjectTask[];
      setTasks(ts => sortTasksByTaskNumberAsc([...ts, ...newTasks]));
      setShowTaskUpload(false);
      setProjectToast({ msg: `${validRows.length} task${validRows.length === 1 ? '' : 's'} uploaded.`, ok: true });
      setTimeout(() => setProjectToast(null), 3000);
    }
    setSavingTaskUpload(false);
  }

  // ── Early returns ──────────────────────────────────────────────────────────
  if (loading) return <div className="p-12 text-center text-slate-400">Loading…</div>;
  if (!project) return <div className="p-12 text-center text-red-500">Project not found</div>;

  // ── Derived values ─────────────────────────────────────────────────────────
  const totalBilled      = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPaid        = invoices.reduce((s, i) => s + (i.total_paid   || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + (i.balance_due  || 0), 0);

  const filteredTasks = applyFilters(tasks, taskFilters);
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const dependencyCountByTask = (() => {
    const counts = new Map<string, number>();
    taskDependencies.forEach((dependency) => {
      counts.set(dependency.task_id, (counts.get(dependency.task_id) ?? 0) + 1);
    });
    return counts;
  })();
  const childCountByTask = (() => {
    const counts = new Map<string, number>();
    tasks.forEach((task) => {
      if (task.parent_task_id) {
        counts.set(task.parent_task_id, (counts.get(task.parent_task_id) ?? 0) + 1);
      }
    });
    return counts;
  })();

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'tasks',       label: `Tasks (${tasks.length})` },
    { id: 'milestones',  label: `Milestones (${milestones.length})` },
    { id: 'raid',        label: `RAID (${raidEntries.length})` },
    { id: 'changes',     label: `Change Requests (${changeRequests.length})` },
    { id: 'invoices',    label: `Invoices (${invoices.length})` },
    { id: 'schedule',    label: 'Billing Schedule' },
  ];

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    on_hold:   'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };

  const taskUploadInvalidCount = taskUploadRows.filter(r => r.errors.length > 0).length;
  const taskUploadValidCount   = taskUploadRows.length - taskUploadInvalidCount;
  const linkableInvoices = invoices.filter(inv =>
    !inv.schedule_id ||
    inv.schedule_id === editingSchedule?.id ||
    inv.id === editingSchedule?.generated_invoice_id ||
    inv.id === scheduleForm.invoice_id
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toast */}
      {projectToast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          projectToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {projectToast.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {projectToast.msg}
        </div>
      )}

      {/* Back + Header */}
      <div className="mb-6">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
        <PageHeader
          title={project.project_name}
          subtitle={`${project.project_code} · ${project.client?.name}`}
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={openEditProject}
                className="inline-flex items-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Settings2 className="h-4 w-4" /> Edit Project
              </button>
              <Link
                href={`/invoices/new?project=${project.id}&client=${project.client_id}`}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                + New Invoice
              </Link>
            </div>
          }
        />
      </div>

      {/* Billing summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contract Amount', value: project.total_contract_amount ? formatCurrency(project.total_contract_amount) : '—', color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'Total Billed',    value: formatCurrency(totalBilled),     color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Total Paid',      value: formatCurrency(totalPaid),        color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Outstanding',     value: formatCurrency(totalOutstanding), color: 'bg-amber-50 border-amber-200 text-amber-800' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border px-5 py-4 ${color}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (() => {
        const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalLoggedHours = timeLogs.reduce((s, l) => s + (Number(l.hours_logged) || 0), 0);
        const standardLaborRate = project.client?.currency === 'USD' ? 50 : 50000;
        const totalLaborCost = totalLoggedHours * standardLaborRate;
        const totalProjectCost = totalExpenses + totalLaborCost;
        const netMargin = totalBilled - totalProjectCost;
        const marginPercent = totalBilled > 0 ? (netMargin / totalBilled) * 100 : 0;

        let marginBg = 'bg-red-50 border-red-200 text-red-700';
        let MarginIcon = TrendingDown;
        if (marginPercent > 30) {
          marginBg = 'bg-green-50 border-green-200 text-green-700';
          MarginIcon = TrendingUp;
        } else if (marginPercent >= 5) {
          marginBg = 'bg-amber-50 border-amber-200 text-amber-700';
          MarginIcon = TrendingUp;
        }

        return (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Identity details */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-2 gap-6">
              {[
                { label: 'Project Code',    value: project.project_code },
                { label: 'Client',          value: project.client?.name },
                { label: 'Billing Type',    value: BILLING_TYPE_LABELS[project.billing_type] },
                { label: 'Status',          value: <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[project.status]}`}>{project.status.replace('_', ' ')}</span> },
                { label: 'Project Manager', value: project.project_manager },
                { label: 'Start Date',      value: formatDate(project.start_date) },
                { label: 'End Date',        value: formatDate(project.end_date) },
                { label: 'Description',     value: project.description },
              ].map(({ label, value }) => (
                <div key={label} className={label === 'Description' ? 'col-span-2' : ''}>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
                  <p className="mt-1 text-sm text-slate-800 leading-relaxed">{value || '—'}</p>
                </div>
              ))}
            </div>

            {/* P&L Dashboard box */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 border border-slate-700/40 rounded-2xl p-6 text-white shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Project Profitability (P&L)
                  </h3>
                  <span className="text-[10px] bg-white/10 text-slate-300 font-semibold px-2 py-0.5 rounded-full">
                    Base: {project.client?.currency || 'UGX'}
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Total Billed Revenue</span>
                    <span className="font-bold">{formatCurrency(totalBilled, project.client?.currency)}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Project Expenses</span>
                    <span className="font-bold text-red-400">-{formatCurrency(totalExpenses, project.client?.currency)}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div className="flex flex-col">
                      <span className="text-slate-400">Labor Hours ({totalLoggedHours.toFixed(1)} hrs)</span>
                      <span className="text-[10px] text-slate-500 font-medium">Est. @ {formatCurrency(standardLaborRate, project.client?.currency)}/hr</span>
                    </div>
                    <span className="font-bold text-red-400">-{formatCurrency(totalLaborCost, project.client?.currency)}</span>
                  </div>

                  <div className="border-t border-white/5 pt-3 flex justify-between items-center text-sm font-bold">
                    <span className="text-slate-300">Total Cost Burden</span>
                    <span className="text-red-400">{formatCurrency(totalProjectCost, project.client?.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Health margin indicator */}
              <div className={`mt-6 border rounded-xl p-4 flex items-center justify-between ${marginBg}`}>
                <div className="space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider opacity-85">Net Profit Margin</p>
                  <p className="text-2xl font-black tabular-nums">{formatCurrency(netMargin, project.client?.currency)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-base font-black">
                    <MarginIcon className="w-5 h-5 shrink-0" />
                    <span>{marginPercent.toFixed(1)}%</span>
                  </div>
                  <span className="text-[9px] font-extrabold uppercase tracking-wide opacity-80">
                    {marginPercent > 30 ? 'Highly Profitable' : marginPercent >= 5 ? 'Healthy Margin' : 'Burden Exceeded'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TASKS ── */}
      {tab === 'tasks' && (
        <div className="space-y-4">

          {/* KPI Cards */}
          <ProjectKpiCards tasks={tasks} projectEndDate={project.end_date} />

          {/* Toolbar: View switcher + filters + actions */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <ProjectViewSwitcher view={taskView} onChange={handleViewChange} taskCount={filteredTasks.length} />

            <div className="flex items-center gap-2">
              <button
                onClick={downloadTaskTemplate}
                className="inline-flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm px-3 py-2 rounded-lg"
                title="Download CSV template"
              >
                <Download className="h-3.5 w-3.5" /> Template
              </button>
              <button
                onClick={() => setShowTaskUpload(true)}
                className="inline-flex items-center gap-1.5 border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm px-3 py-2 rounded-lg"
              >
                <Upload className="h-3.5 w-3.5" /> Bulk Upload
              </button>
              <button
                onClick={() => openAddTask()}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Add Task
              </button>
            </div>
          </div>

          {/* Filters */}
          <ProjectFilters tasks={tasks} filters={taskFilters} onChange={setTaskFilters} />

          {/* ── LIST VIEW ── */}
          {taskView === 'list' && (
            <>
              {filteredTasks.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                  {tasks.length === 0 ? 'No tasks yet. Add tasks manually or bulk upload a CSV.' : 'No tasks match the current filters.'}
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['#', 'Task', 'Phase', 'Priority', 'Progress', 'Dates', 'Assigned To', 'Status', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTasks.map(task => {
                          const isOverdue = !!task.end_date && task.end_date < today && task.status !== 'completed' && task.status !== 'cancelled';
                          const varianceDays = getTaskBaselineVariance(task);
                          const parentTask = task.parent_task_id ? taskById.get(task.parent_task_id) : null;
                          const childCount = childCountByTask.get(task.id) ?? 0;
                          return (
                            <tr key={task.id} className={`group cursor-pointer ${isOverdue ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}
                              onClick={() => openEditTask(task)}>
                              <td className="px-4 py-3 text-xs font-semibold text-slate-400 tabular-nums">
                                #{task.task_number != null ? task.task_number : '—'}
                              </td>
                              <td className="px-4 py-3 max-w-[220px]">
                                <p className={`font-medium ${isOverdue ? 'text-red-700' : 'text-slate-900'} truncate`}>{task.title}</p>
                                {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>}
                                {task.quotation_id && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                    <Tag className="h-2.5 w-2.5" /> From Quotation
                                  </span>
                                )}
                                {task.tags?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {task.tags.slice(0, 2).map(tag => (
                                      <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded">{tag}</span>
                                    ))}
                                  </div>
                                )}
                                {(parentTask || childCount > 0) && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {parentTask && (
                                      <span className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                        <GitBranch className="h-2.5 w-2.5" /> Child of {parentTask.task_number != null ? `#${parentTask.task_number}` : parentTask.title}
                                      </span>
                                    )}
                                    {childCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                        <GitBranch className="h-2.5 w-2.5" /> {childCount} subtask{childCount === 1 ? '' : 's'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {(dependencyCountByTask.get(task.id) ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                    <Link2 className="h-2.5 w-2.5" /> Depends on {dependencyCountByTask.get(task.id)}
                                  </span>
                                )}
                                {(task.is_critical_path || task.is_blocker || varianceDays !== null) && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {task.is_critical_path && (
                                      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                                        <AlertCircle className="h-2.5 w-2.5" /> Critical path
                                      </span>
                                    )}
                                    {task.is_blocker && (
                                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                                        <AlertCircle className="h-2.5 w-2.5" /> Blocker
                                      </span>
                                    )}
                                    {varianceDays !== null && (
                                      <span className={`inline-flex items-center gap-1 text-xs border rounded px-1.5 py-0.5 ${scheduleVarianceBadgeClass(varianceDays)}`}>
                                        {formatScheduleVariance(varianceDays)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600 font-medium">
                                {task.phase || '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                                  task.priority === 'critical' ? 'bg-red-100 text-red-600' :
                                  task.priority === 'high'     ? 'bg-orange-100 text-orange-600' :
                                  task.priority === 'medium'   ? 'bg-amber-50 text-amber-600' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS_DOT[task.status]}`} />
                                  {task.priority}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} />
                                  </div>
                                  <span className="text-xs text-gray-500 tabular-nums">{task.progress}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500" onClick={e => e.stopPropagation()}>
                                {task.start_date && <p>Start: {formatDate(task.start_date)}</p>}
                                {task.end_date && (
                                  <p className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                                    Due: {formatDate(task.end_date)}{isOverdue ? ' ⚠' : ''}
                                  </p>
                                )}
                                {!task.start_date && !task.end_date && <span>—</span>}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">{task.assigned_to || '—'}</td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <select
                                  value={task.status}
                                  onChange={e => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                                  className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:ring-1 focus:ring-offset-0 cursor-pointer ${TASK_STATUS_COLORS[task.status]}`}
                                >
                                  {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map(s => (
                                    <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => { setTimeLogDrawerTask(task); setTimeLogDrawerOpen(true); }} className="p-1.5 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50" title="Timesheets / Log hours">
                                    <Clock className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => openEditTask(task)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => setConfirmDeleteId(task.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {filteredTasks.map(task => {
                      const isOverdue = !!task.end_date && task.end_date < today && task.status !== 'completed' && task.status !== 'cancelled';
                      const varianceDays = getTaskBaselineVariance(task);
                      const parentTask = task.parent_task_id ? taskById.get(task.parent_task_id) : null;
                      const childCount = childCountByTask.get(task.id) ?? 0;
                      return (
                        <div
                          key={task.id}
                          className={`bg-white border rounded-xl p-4 cursor-pointer ${isOverdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}
                          onClick={() => openEditTask(task)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className={`font-medium text-sm truncate ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>
                                {task.task_number != null ? `#${task.task_number} ` : ''}{task.title}
                              </p>
                              {task.phase && (
                                <span className="inline-flex items-center mt-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                  {task.phase}
                                </span>
                              )}
                              {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>}
                              {(parentTask || childCount > 0) && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {parentTask && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                      <GitBranch className="h-2.5 w-2.5" /> Child of {parentTask.task_number != null ? `#${parentTask.task_number}` : parentTask.title}
                                    </span>
                                  )}
                                  {childCount > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                                      <GitBranch className="h-2.5 w-2.5" /> {childCount} subtask{childCount === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                              )}
                              {(task.is_critical_path || task.is_blocker || varianceDays !== null) && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {task.is_critical_path && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">
                                      <AlertCircle className="h-2.5 w-2.5" /> Critical path
                                    </span>
                                  )}
                                  {task.is_blocker && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                                      <AlertCircle className="h-2.5 w-2.5" /> Blocker
                                    </span>
                                  )}
                                  {varianceDays !== null && (
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded px-1.5 py-0.5 ${scheduleVarianceBadgeClass(varianceDays)}`}>
                                      {formatScheduleVariance(varianceDays)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
                              {TASK_STATUS_LABELS[task.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            {task.end_date && (
                              <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                                Due {formatDate(task.end_date)}{isOverdue ? ' ⚠' : ''}
                              </span>
                            )}
                            {task.assigned_to && <span>{task.assigned_to}</span>}
                            {(dependencyCountByTask.get(task.id) ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <Link2 className="h-3 w-3" /> {dependencyCountByTask.get(task.id)}
                              </span>
                            )}
                            <span className="ml-auto">{task.progress}%</span>
                          </div>
                          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${task.progress}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── KANBAN VIEW ── */}
          {taskView === 'kanban' && (
            <ProjectKanbanView
              tasks={filteredTasks}
              companyId={project.company_id}
              projectId={id}
              onTasksChange={updated => setTasks(sortTasksByTaskNumberAsc(updated))}
              onEditTask={openEditTask}
              onAddTask={openAddTask}
            />
          )}

          {/* ── GANTT VIEW ── */}
          {taskView === 'gantt' && (
            <ProjectGanttView
              tasks={filteredTasks}
              projectStartDate={project.start_date}
              projectEndDate={project.end_date}
              onEditTask={openEditTask}
            />
          )}
        </div>
      )}

      {/* ── MILESTONES ── */}
      {tab === 'milestones' && (
        <MilestonesPanel
          projectId={project.id}
          milestones={milestones}
          onRefresh={load}
        />
      )}

      {/* ── RAID LOG ── */}
      {tab === 'raid' && (
        <RaidLogPanel
          projectId={project.id}
          entries={raidEntries}
          onRefresh={load}
        />
      )}

      {/* ── CHANGE REQUESTS ── */}
      {tab === 'changes' && (
        <ChangeRequestPanel
          projectId={project.id}
          requests={changeRequests}
          onRefresh={load}
        />
      )}

      {/* ── INVOICES ── */}
      {tab === 'invoices' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Invoice #','Date','Due Date','Total','Paid','Balance','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No invoices for this project yet</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(inv.total_amount, inv.currency)}</td>
                  <td className="px-4 py-3 text-green-700">{formatCurrency(inv.total_paid, inv.currency)}</td>
                  <td className="px-4 py-3 text-amber-700 font-medium">{formatCurrency(inv.balance_due, inv.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${inv.id}`} className="text-blue-600 text-xs hover:text-blue-800">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SCHEDULE ── */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => openScheduleDocument(true)} className="inline-flex items-center gap-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm px-4 py-2 rounded-lg">
              <Printer className="h-4 w-4" /> Print Schedule
            </button>
            <button onClick={openAddSchedule} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> Add Schedule Line
            </button>
          </div>
          {schedules.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">No billing schedule defined.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Stage</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Description</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase w-20">%</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase w-36">Fixed Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-32">Due Date</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase w-32">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-40">Invoice</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase w-44">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map(s => {
                    const computedAmount = getScheduleAmount(s);
                    const linkedInvoice = getScheduleInvoice(s);
                    const displayStatus = getScheduleStatus(s, linkedInvoice);
                    const generateHref = `/invoices/new?project=${id}&client=${project.client_id}&schedule=${s.id}&amount=${computedAmount || ''}`;
                    const needsLinkSync = !!linkedInvoice && linkedInvoice.id !== s.generated_invoice_id;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.schedule_name}</td>
                        <td className="px-4 py-3 text-slate-600">{s.description || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{s.percentage != null ? `${s.percentage}%` : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{computedAmount != null ? formatCurrency(computedAmount, project.client?.currency) : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(s.due_date)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex min-w-20 justify-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${scheduleStatusClasses[displayStatus]}`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {linkedInvoice ? (
                            <Link href={`/invoices/${linkedInvoice.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                              {linkedInvoice.invoice_number}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {needsLinkSync && (
                              <button
                                type="button"
                                onClick={() => linkedInvoice && linkScheduleToInvoice(s, linkedInvoice)}
                                disabled={linkingScheduleId === s.id}
                                className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <Link2 className="h-3.5 w-3.5" /> Link
                              </button>
                            )}
                            {!linkedInvoice && (
                            <Link
                              href={generateHref}
                              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded"
                            >
                              Generate Invoice
                            </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditSchedule(s)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              title="Edit schedule line"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TASK DRAWER ── */}
      <ProjectTaskDrawer
        task={drawerTask}
        open={drawerOpen}
        saving={savingDrawer}
        defaultStatus={drawerDefaultStatus}
        companyId={activeCompanyId ?? undefined}
        availableTasks={tasks}
        taskDependencies={taskDependencies}
        onClose={() => setDrawerOpen(false)}
        onSave={saveTaskFromDrawer}
        onDelete={id => setConfirmDeleteId(id)}
      />

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Delete Task?</h2>
            <p className="text-sm text-slate-500 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={() => deleteTask(confirmDeleteId)} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {showTaskUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bulk Upload Tasks</h2>
                <p className="text-xs text-slate-500 mt-1">Use the CSV template, review rows, then upload.</p>
              </div>
              <button onClick={() => setShowTaskUpload(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-blue-300 hover:bg-blue-50/50">
                  <FileSpreadsheet className="h-7 w-7 text-blue-600" />
                  <span className="mt-2 text-sm font-medium text-slate-800">{taskUploadFileName || 'Choose a CSV file'}</span>
                  <span className="mt-1 text-xs text-slate-500">Columns: Task Number, Phase, Title, Description, Start Date, Due Date, Assigned To, Status</span>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void readTaskUploadFile(f); e.currentTarget.value = ''; }} />
                </label>
                <button type="button" onClick={downloadTaskTemplate} className="inline-flex h-28 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Download Template
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs font-medium text-slate-500">Ready</p><p className="mt-1 text-lg font-bold text-green-700">{taskUploadValidCount}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Needs Review</p><p className="mt-1 text-lg font-bold text-red-600">{taskUploadInvalidCount}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Default Priority</p><p className="mt-1 text-sm font-semibold text-slate-800">Medium</p></div>
              </div>

              {taskUploadError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {taskUploadError}
                </div>
              )}

              {taskUploadRows.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase text-slate-500">Preview</p>
                  </div>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-white border-b border-slate-100">
                        <tr>{['Row','Task #','Phase','Title','Due Date','Assigned To','Status','Validation'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {taskUploadRows.map(row => (
                          <tr key={row.rowNumber} className={row.errors.length > 0 ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.rowNumber}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.task_number != null ? `#${row.task_number}` : '-'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.phase || '-'}</td>
                            <td className="px-4 py-3"><p className="font-medium text-slate-900">{row.title || '-'}</p></td>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.end_date || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{row.assigned_to || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS_COLORS[row.status]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS_DOT[row.status]}`} />
                                {TASK_STATUS_LABELS[row.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {row.errors.length === 0
                                ? <span className="font-medium text-green-700">Ready</span>
                                : <span className="text-red-700">{row.errors.join(' ')}</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-200 p-6">
              <button type="button" onClick={() => setShowTaskUpload(false)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={saveTaskUpload} disabled={savingTaskUpload || taskUploadValidCount === 0 || taskUploadInvalidCount > 0} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {savingTaskUpload ? 'Uploading…' : `Upload ${taskUploadValidCount} Task${taskUploadValidCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE FORM MODAL ── */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">{editingSchedule ? 'Edit Schedule Line' : 'Add Schedule Line'}</h2>
              <button onClick={closeScheduleForm}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveScheduleLine} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Stage Name *</label>
                <input required type="text" placeholder="e.g. Deposit, Design Approval, Final Delivery"
                  value={scheduleForm.schedule_name}
                  onChange={e => setScheduleForm(f => ({ ...f, schedule_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input type="text" value={scheduleForm.description}
                  onChange={e => setScheduleForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Percentage (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={scheduleForm.percentage}
                    onChange={e => setScheduleForm(f => ({ ...f, percentage: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fixed Amount</label>
                  <input type="number" min="0" step="0.01" value={scheduleForm.fixed_amount}
                    onChange={e => setScheduleForm(f => ({ ...f, fixed_amount: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                <input type="date" value={scheduleForm.due_date}
                  onChange={e => setScheduleForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Linked Invoice</label>
                <select
                  value={scheduleForm.invoice_id}
                  onChange={e => setScheduleForm(f => ({ ...f, invoice_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No invoice linked</option>
                  {linkableInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} - {formatCurrency(inv.total_amount, inv.currency)} - {inv.status.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeScheduleForm} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={savingSchedule} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingSchedule ? 'Saving...' : editingSchedule ? 'Save Line' : 'Add Line'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT PROJECT MODAL ── */}
      {showEditProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit Project</h2>
                <p className="text-xs text-slate-400 mt-0.5">{project.project_code}</p>
              </div>
              <button onClick={() => setShowEditProject(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveProject} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
                <input required type="text" value={editProjectForm.project_name}
                  onChange={e => setEditProjectForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Portfolio (Optional)</label>
                <select
                  value={editProjectForm.portfolio_id}
                  onChange={e => setEditProjectForm(f => ({ ...f, portfolio_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (Independent Project)</option>
                  {portfolios.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
                <select value={editProjectForm.status}
                  onChange={e => setEditProjectForm(f => ({ ...f, status: e.target.value as Project['status'] }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[editProjectForm.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {editProjectForm.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager</label>
                <input type="text" value={editProjectForm.project_manager} placeholder="Full name"
                  onChange={e => setEditProjectForm(f => ({ ...f, project_manager: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contract Amount</label>
                <input type="number" min="0" step="0.01" value={editProjectForm.total_contract_amount} placeholder="0"
                  onChange={e => setEditProjectForm(f => ({ ...f, total_contract_amount: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" value={editProjectForm.start_date}
                    onChange={e => setEditProjectForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" value={editProjectForm.end_date}
                    onChange={e => setEditProjectForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea rows={3} value={editProjectForm.description}
                  onChange={e => setEditProjectForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditProject(false)} className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-medium">Cancel</button>
                <button type="submit" disabled={savingProject} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                  {savingProject ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TimeLogDrawer
        task={timeLogDrawerTask}
        open={timeLogDrawerOpen}
        onClose={() => setTimeLogDrawerOpen(false)}
        onLoggedChange={load}
      />
    </div>
  );
}
