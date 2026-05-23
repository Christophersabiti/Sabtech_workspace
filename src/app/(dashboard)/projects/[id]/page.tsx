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
} from 'lucide-react';

// ── New PM components ──────────────────────────────────────────────────────────
import { ProjectViewSwitcher }                       from '@/components/projects/ProjectViewSwitcher';
import { ProjectKpiCards }                           from '@/components/projects/ProjectKpiCards';
import { ProjectFilters, applyFilters, EMPTY_FILTERS } from '@/components/projects/ProjectFilters';
import type { TaskFilters }                          from '@/components/projects/ProjectFilters';
import { ProjectKanbanView }                         from '@/components/projects/ProjectKanbanView';
import { ProjectGanttView }                          from '@/components/projects/ProjectGanttView';
import { ProjectTaskDrawer }                         from '@/components/projects/ProjectTaskDrawer';
import type { TaskFormValues }                       from '@/components/projects/ProjectTaskDrawer';
import type { EnhancedProjectTask, TaskViewMode, TaskStatus } from '@/components/projects/types';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_STATUS_DOT,
} from '@/components/projects/types';

// ─── Legacy types preserved for CSV upload compatibility ─────────────────────

type Tab = 'overview' | 'tasks' | 'invoices' | 'schedule';

type TaskUploadRow = {
  rowNumber: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  assigned_to: string;
  status: TaskStatus;
  errors: string[];
};

const TASK_TEMPLATE_HEADERS = ['Title', 'Description', 'Start Date', 'Due Date', 'Assigned To', 'Status'];

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
function isValidIsoDate(v: string) { return !v || /^\d{4}-\d{2}-\d{2}$/.test(v); }

function buildTaskUploadRows(text: string): { rows: TaskUploadRow[]; error: string | null } {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return { rows: [], error: 'Upload a CSV with a header row and at least one task.' };
  const headers = csvRows[0].map(normalizeHeader);
  const idx = (names: string[]) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const titleIdx   = idx(['title','task','task_title']);
  if (titleIdx < 0) return { rows: [], error: 'The CSV must include a Title column.' };
  const descIdx   = idx(['description','details','notes']);
  const startIdx  = idx(['start_date','start']);
  const dueIdx    = idx(['due_date','end_date','deadline','due']);
  const assignIdx = idx(['assigned_to','assignee','owner']);
  const statusIdx = idx(['status']);
  const rows = csvRows.slice(1).map((r, i) => {
    const sv = statusIdx >= 0 ? r[statusIdx] || '' : '';
    const status = normalizeTaskStatus(sv);
    const row: TaskUploadRow = {
      rowNumber: i + 2,
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
    if (!isValidIsoDate(row.start_date)) row.errors.push('Start Date must use YYYY-MM-DD.');
    if (!isValidIsoDate(row.end_date))   row.errors.push('Due Date must use YYYY-MM-DD.');
    if (row.start_date && row.end_date && row.end_date < row.start_date)
      row.errors.push('Due Date cannot be before Start Date.');
    return row;
  }).filter(r => r.title || r.description || r.start_date || r.end_date || r.assigned_to);
  if (rows.length === 0) return { rows: [], error: 'No task rows found in the CSV.' };
  return { rows, error: null };
}

function sortTasksByStartDateDesc(list: EnhancedProjectTask[]) {
  return [...list].sort((a, b) => {
    const aDate = a.start_date ?? '';
    const bDate = b.start_date ?? '';
    if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const [tab,       setTab]       = useState<Tab>('overview');
  const [loading,   setLoading]   = useState(true);

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
  });
  const [savingProject, setSavingProject] = useState(false);
  const [projectToast,  setProjectToast]  = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Schedule modal ─────────────────────────────────────────────────────────
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ schedule_name: '', description: '', percentage: '', fixed_amount: '', due_date: '' });
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ── CSV Upload ─────────────────────────────────────────────────────────────
  const [showTaskUpload,    setShowTaskUpload]    = useState(false);
  const [taskUploadFileName, setTaskUploadFileName] = useState('');
  const [taskUploadRows,    setTaskUploadRows]    = useState<TaskUploadRow[]>([]);
  const [taskUploadError,   setTaskUploadError]   = useState<string | null>(null);
  const [savingTaskUpload,  setSavingTaskUpload]  = useState(false);

  // ── Confirm delete ─────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // ── Data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (companyLoading) return;
    if (!activeCompanyId) {
      setProject(null); setInvoices([]); setSchedules([]); setTasks([]); setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: proj }, { data: inv }, { data: sched }, { data: tsk }] = await Promise.all([
      supabase.from('projects').select('*, client:clients(*)').eq('id', id).eq('company_id', activeCompanyId).single(),
      supabase.from('invoices').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('issue_date', { ascending: false }),
      supabase.from('invoice_schedules').select('*').eq('project_id', id).eq('company_id', activeCompanyId).order('sort_order'),
      supabase.from('project_tasks').select('*').eq('project_id', id).eq('company_id', activeCompanyId)
        .order('sort_order').order('start_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    ]);
    setProject(proj as Project & { client: Client });
    setInvoices(inv || []);
    setSchedules(sched || []);
    // Normalise tasks — ensure new fields have defaults for rows created before migration
    setTasks(sortTasksByStartDateDesc((tsk || []).map((t: Record<string, unknown>) => ({
      ...t,
      priority:      t.priority      ?? 'medium',
      progress:      t.progress      ?? 0,
      sort_order:    t.sort_order    ?? 0,
      parent_task_id: t.parent_task_id ?? null,
      tags:          Array.isArray(t.tags) ? t.tags : [],
    })) as EnhancedProjectTask[]));
    setLoading(false);
  }, [activeCompanyId, companyLoading, id, supabase]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setProject(null); setInvoices([]); setSchedules([]); setTasks([]);
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
    const { error } = await supabase.from('projects').update(payload).eq('id', id).eq('company_id', project.company_id);
    if (error) {
      setProjectToast({ msg: error.message, ok: false });
    } else {
      setProject(p => p ? { ...p, ...payload } : p);
      setShowEditProject(false);
      setProjectToast({ msg: 'Project updated.', ok: true });
    }
    setSavingProject(false);
    setTimeout(() => setProjectToast(null), 3000);
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────
  async function addScheduleLine(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSavingSchedule(true);
    const { error } = await supabase.from('invoice_schedules').insert({
      company_id: project.company_id, project_id: id,
      schedule_name: scheduleForm.schedule_name,
      description:   scheduleForm.description || null,
      percentage:    scheduleForm.percentage  ? parseFloat(scheduleForm.percentage)  : null,
      fixed_amount:  scheduleForm.fixed_amount? parseFloat(scheduleForm.fixed_amount): null,
      due_date:      scheduleForm.due_date || null,
      sort_order:    schedules.length,
    });
    if (!error) {
      setShowScheduleForm(false);
      setScheduleForm({ schedule_name: '', description: '', percentage: '', fixed_amount: '', due_date: '' });
      load();
    } else { alert('Error: ' + error.message); }
    setSavingSchedule(false);
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
    };

    if (drawerTask) {
      // Update
      const { error } = await supabase
        .from('project_tasks')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', drawerTask.id)
        .eq('company_id', project.company_id);
      if (!error) {
        setTasks(ts => sortTasksByStartDateDesc(
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
        } as EnhancedProjectTask;
        setTasks(ts => sortTasksByStartDateDesc([...ts, newTask]));
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
    setTasks(ts => ts.filter(t => t.id !== taskId));
    setConfirmDeleteId(null);
    setDrawerOpen(false);
    setProjectToast({ msg: 'Task deleted.', ok: true });
    setTimeout(() => setProjectToast(null), 2500);
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
    if (!project) return;
    setTasks(ts => sortTasksByStartDateDesc(ts.map(t =>
      t.id === taskId
        ? { ...t, status: newStatus, progress: newStatus === 'completed' ? 100 : t.progress }
        : t
    )));
    await supabase.from('project_tasks')
      .update({ status: newStatus, progress: newStatus === 'completed' ? 100 : undefined, updated_at: new Date().toISOString() })
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
      })) as EnhancedProjectTask[];
      setTasks(ts => sortTasksByStartDateDesc([...ts, ...newTasks]));
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

  const taskSummary = {
    total:       tasks.length,
    pending:     tasks.filter(t => t.status === 'pending' || t.status === 'backlog').length,
    in_progress: tasks.filter(t => t.status === 'in_progress' || t.status === 'in_review').length,
    completed:   tasks.filter(t => t.status === 'completed').length,
    blocked:     tasks.filter(t => t.status === 'blocked').length,
    overdue:     tasks.filter(t => t.end_date && t.end_date < today && t.status !== 'completed' && t.status !== 'cancelled').length,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'tasks',     label: `Tasks (${tasks.length})` },
    { id: 'invoices',  label: `Invoices (${invoices.length})` },
    { id: 'schedule',  label: 'Billing Schedule' },
  ];

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    on_hold:   'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };

  const taskUploadInvalidCount = taskUploadRows.filter(r => r.errors.length > 0).length;
  const taskUploadValidCount   = taskUploadRows.length - taskUploadInvalidCount;

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
      {tab === 'overview' && (
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
            <div key={label}>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-sm text-slate-800">{value || '—'}</p>
            </div>
          ))}
        </div>
      )}

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
                          {['Task', 'Priority', 'Progress', 'Dates', 'Assigned To', 'Status', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTasks.map(task => {
                          const isOverdue = !!task.end_date && task.end_date < today && task.status !== 'completed' && task.status !== 'cancelled';
                          return (
                            <tr key={task.id} className={`group cursor-pointer ${isOverdue ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}
                              onClick={() => openEditTask(task)}>
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
                      return (
                        <div
                          key={task.id}
                          className={`bg-white border rounded-xl p-4 cursor-pointer ${isOverdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}
                          onClick={() => openEditTask(task)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className={`font-medium text-sm truncate ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>{task.title}</p>
                              {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>}
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
              onTasksChange={updated => setTasks(sortTasksByStartDateDesc(updated))}
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
          <div className="flex justify-end">
            <button onClick={() => setShowScheduleForm(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
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
                    {['Stage','Description','%','Fixed Amount','Due Date','Status','Invoice',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map(s => {
                    const computedAmount = s.fixed_amount || (project.total_contract_amount && s.percentage ? project.total_contract_amount * s.percentage / 100 : null);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{s.schedule_name}</td>
                        <td className="px-4 py-3 text-slate-600">{s.description || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{s.percentage ? `${s.percentage}%` : '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{computedAmount ? formatCurrency(computedAmount) : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(s.due_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.status === 'paid'     ? 'bg-green-100 text-green-700' :
                            s.status === 'invoiced' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.generated_invoice_id
                            ? <Link href={`/invoices/${s.generated_invoice_id}`} className="text-blue-600 hover:underline">View Invoice</Link>
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {s.status === 'pending' && (
                            <Link
                              href={`/invoices/new?project=${id}&client=${project.client_id}&schedule=${s.id}&amount=${computedAmount || ''}`}
                              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded"
                            >
                              Generate Invoice
                            </Link>
                          )}
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
                  <span className="mt-1 text-xs text-slate-500">Columns: Title, Description, Start Date, Due Date, Assigned To, Status</span>
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
                        <tr>{['Row','Title','Due Date','Assigned To','Status','Validation'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-500">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {taskUploadRows.map(row => (
                          <tr key={row.rowNumber} className={row.errors.length > 0 ? 'bg-red-50/60' : 'hover:bg-slate-50'}>
                            <td className="px-4 py-3 text-xs text-slate-500">{row.rowNumber}</td>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">Add Schedule Line</h2>
              <button onClick={() => setShowScheduleForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={addScheduleLine} className="p-6 space-y-4">
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
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowScheduleForm(false)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={savingSchedule} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingSchedule ? 'Saving…' : 'Add Line'}
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
    </div>
  );
}
