'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Project, Invoice, InvoiceSchedule, Client } from '@/types';
import { formatCurrency, formatDate, BILLING_TYPE_LABELS } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ArrowLeft, Plus, X, Pencil, Trash2, Tag, Settings2, CheckCircle, XCircle } from 'lucide-react';

type Tab = 'overview' | 'tasks' | 'invoices' | 'schedule';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

type ProjectTask = {
  id: string;
  project_id: string | null;
  quotation_id: string | null;
  quotation_item_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  start_date: string | null;
  end_date: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string | null;
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     'Not Started',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  pending:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-red-100 text-red-500',
};

const emptyTaskForm = () => ({
  title: '',
  description: '',
  start_date: '',
  end_date: '',
  assigned_to: '',
  status: 'pending' as TaskStatus,
});

export default function ProjectProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [project, setProject]       = useState<Project & { client: Client } | null>(null);
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [schedules, setSchedules]   = useState<InvoiceSchedule[]>([]);
  const [tasks, setTasks]           = useState<ProjectTask[]>([]);
  const [tab, setTab]               = useState<Tab>('overview');
  const [loading, setLoading]       = useState(true);

  // Edit project modal
  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState<{
    project_name: string;
    project_manager: string;
    status: Project['status'];
    start_date: string;
    end_date: string;
    total_contract_amount: string;
    description: string;
  }>({
    project_name: '', project_manager: '', status: 'active',
    start_date: '', end_date: '', total_contract_amount: '', description: '',
  });
  const [savingProject, setSavingProject]   = useState(false);
  const [projectToast, setProjectToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm]         = useState({ schedule_name: '', description: '', percentage: '', fixed_amount: '', due_date: '' });
  const [savingSchedule, setSavingSchedule]     = useState(false);

  // Task modals
  const [showTaskForm, setShowTaskForm]       = useState(false);
  const [editingTask, setEditingTask]         = useState<ProjectTask | null>(null);
  const [taskForm, setTaskForm]               = useState(emptyTaskForm());
  const [savingTask, setSavingTask]           = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: proj }, { data: inv }, { data: sched }, { data: tsk }] = await Promise.all([
      supabase.from('projects').select('*, client:clients(*)').eq('id', id).single(),
      supabase.from('invoices').select('*').eq('project_id', id).order('issue_date', { ascending: false }),
      supabase.from('invoice_schedules').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('project_tasks').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    ]);
    setProject(proj as Project & { client: Client });
    setInvoices(inv || []);
    setSchedules(sched || []);
    setTasks((tsk || []) as ProjectTask[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    setSavingProject(true);
    const payload: Partial<Project> = {
      project_name:          editProjectForm.project_name.trim(),
      project_manager:       editProjectForm.project_manager.trim() || null,
      status:                editProjectForm.status as Project['status'],
      start_date:            editProjectForm.start_date || null,
      end_date:              editProjectForm.end_date || null,
      total_contract_amount: editProjectForm.total_contract_amount ? parseFloat(editProjectForm.total_contract_amount) : null,
      description:           editProjectForm.description.trim() || null,
    };
    const { error } = await supabase.from('projects').update(payload).eq('id', id);
    if (error) {
      setProjectToast({ msg: error.message, ok: false });
    } else {
      setProject(p => p ? { ...p, ...payload } : p);
      setShowEditProject(false);
      setProjectToast({ msg: 'Project updated successfully.', ok: true });
    }
    setSavingProject(false);
    setTimeout(() => setProjectToast(null), 3000);
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────
  async function addScheduleLine(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    const { error } = await supabase.from('invoice_schedules').insert({
      project_id:   id,
      schedule_name: scheduleForm.schedule_name,
      description:   scheduleForm.description || null,
      percentage:    scheduleForm.percentage ? parseFloat(scheduleForm.percentage) : null,
      fixed_amount:  scheduleForm.fixed_amount ? parseFloat(scheduleForm.fixed_amount) : null,
      due_date:      scheduleForm.due_date || null,
      sort_order:    schedules.length,
    });
    if (!error) {
      setShowScheduleForm(false);
      setScheduleForm({ schedule_name: '', description: '', percentage: '', fixed_amount: '', due_date: '' });
      load();
    } else {
      alert('Error: ' + error.message);
    }
    setSavingSchedule(false);
  }

  // ── Task CRUD ──────────────────────────────────────────────────────────────
  function openAddTask() {
    setEditingTask(null);
    setTaskForm(emptyTaskForm());
    setShowTaskForm(true);
  }

  function openEditTask(task: ProjectTask) {
    setEditingTask(task);
    setTaskForm({
      title:       task.title,
      description: task.description || '',
      start_date:  task.start_date || '',
      end_date:    task.end_date || '',
      assigned_to: task.assigned_to || '',
      status:      task.status,
    });
    setShowTaskForm(true);
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    setSavingTask(true);
    const payload = {
      title:       taskForm.title.trim(),
      description: taskForm.description.trim() || null,
      start_date:  taskForm.start_date || null,
      end_date:    taskForm.end_date || null,
      assigned_to: taskForm.assigned_to.trim() || null,
      status:      taskForm.status,
    };

    if (editingTask) {
      const { error } = await supabase
        .from('project_tasks')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingTask.id);
      if (!error) {
        setTasks(ts => ts.map(t => t.id === editingTask.id ? { ...t, ...payload } : t));
      }
    } else {
      const { data, error } = await supabase
        .from('project_tasks')
        .insert({ ...payload, project_id: id })
        .select()
        .single();
      if (!error && data) {
        setTasks(ts => [...ts, data as ProjectTask]);
      }
    }

    setSavingTask(false);
    setShowTaskForm(false);
    setEditingTask(null);
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskStatus) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    await supabase
      .from('project_tasks')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', taskId);
  }

  async function deleteTask(taskId: string) {
    await supabase.from('project_tasks').delete().eq('id', taskId);
    setTasks(ts => ts.filter(t => t.id !== taskId));
    setConfirmDeleteId(null);
  }

  // ── Derived values ────────────────────────────────────────────────────────
  if (loading) return <div className="p-12 text-center text-slate-400">Loading...</div>;
  if (!project) return <div className="p-12 text-center text-red-500">Project not found</div>;

  const totalBilled      = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalPaid        = invoices.reduce((s, i) => s + (i.total_paid || 0), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  const taskSummary = {
    total:       tasks.length,
    pending:     tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed:   tasks.filter(t => t.status === 'completed').length,
    overdue:     tasks.filter(t => t.end_date && t.end_date < today && t.status !== 'completed' && t.status !== 'cancelled').length,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks',    label: `Tasks (${tasks.length})` },
    { id: 'invoices', label: `Invoices (${invoices.length})` },
    { id: 'schedule', label: 'Billing Schedule' },
  ];

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    on_hold:   'bg-amber-100 text-amber-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };

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

      {/* Billing Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contract Amount', value: project.total_contract_amount ? formatCurrency(project.total_contract_amount) : '—', color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'Total Billed',    value: formatCurrency(totalBilled),      color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Total Paid',      value: formatCurrency(totalPaid),         color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Outstanding',     value: formatCurrency(totalOutstanding),  color: 'bg-amber-50 border-amber-200 text-amber-800' },
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
          {/* Task summary bar */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Total',       value: taskSummary.total,       color: 'text-slate-700 bg-slate-50 border-slate-200' },
              { label: 'Not Started', value: taskSummary.pending,     color: 'text-slate-600 bg-slate-50 border-slate-200' },
              { label: 'In Progress', value: taskSummary.in_progress, color: 'text-blue-700 bg-blue-50 border-blue-200' },
              { label: 'Completed',   value: taskSummary.completed,   color: 'text-green-700 bg-green-50 border-green-200' },
              { label: 'Overdue',     value: taskSummary.overdue,     color: taskSummary.overdue > 0 ? 'text-red-700 bg-red-50 border-red-200' : 'text-slate-500 bg-slate-50 border-slate-200' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border px-4 py-3 ${color}`}>
                <p className="text-xs font-medium opacity-70 mb-0.5">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={openAddTask}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              No tasks yet. Add tasks manually or convert a quotation.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Task', 'Dates', 'Assigned To', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tasks.map(task => {
                      const isOverdue = !!task.end_date && task.end_date < today && task.status !== 'completed' && task.status !== 'cancelled';
                      return (
                        <tr key={task.id} className={`group ${isOverdue ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3 max-w-[260px]">
                            <div className="flex items-start gap-2">
                              <div>
                                <p className={`font-medium ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>{task.title}</p>
                                {task.description && (
                                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                                )}
                                {task.quotation_id && (
                                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                    <Tag className="h-2.5 w-2.5" /> From Quotation
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {task.start_date && <p>Start: {formatDate(task.start_date)}</p>}
                            {task.end_date && (
                              <p className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                                Due: {formatDate(task.end_date)}{isOverdue ? ' ⚠' : ''}
                              </p>
                            )}
                            {!task.start_date && !task.end_date && <span>—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{task.assigned_to || '—'}</td>
                          <td className="px-4 py-3">
                            <select
                              value={task.status}
                              onChange={e => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                              className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:ring-1 focus:ring-offset-0 cursor-pointer ${TASK_STATUS_STYLES[task.status]}`}
                            >
                              {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map(s => (
                                <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEditTask(task)}
                                className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(task.id)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Delete"
                              >
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
                {tasks.map(task => {
                  const isOverdue = !!task.end_date && task.end_date < today && task.status !== 'completed' && task.status !== 'cancelled';
                  return (
                    <div key={task.id} className={`bg-white border rounded-xl p-4 ${isOverdue ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className={`font-medium text-sm ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>{task.title}</p>
                          {task.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{task.description}</p>}
                          {task.quotation_id && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                              <Tag className="h-2.5 w-2.5" /> From Quotation
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => openEditTask(task)} className="p-1.5 rounded text-slate-400 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirmDeleteId(task.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="text-xs text-slate-500">
                          {task.end_date && <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>Due {formatDate(task.end_date)}</span>}
                          {task.assigned_to && <span className="ml-2">· {task.assigned_to}</span>}
                        </div>
                        <select
                          value={task.status}
                          onChange={e => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                          className={`text-xs font-medium rounded-full px-2 py-1 border-0 ${TASK_STATUS_STYLES[task.status]}`}
                        >
                          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map(s => (
                            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── INVOICES ── */}
      {tab === 'invoices' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Invoice #', 'Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', ''].map(h => (
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
            <button
              onClick={() => setShowScheduleForm(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
            >
              <Plus className="h-4 w-4" /> Add Schedule Line
            </button>
          </div>

          {schedules.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
              No billing schedule defined. Add lines for deposit, milestone, and final payment.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Stage', 'Description', '%', 'Fixed Amount', 'Due Date', 'Status', 'Invoice', ''].map(h => (
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
                          {s.generated_invoice_id ? (
                            <Link href={`/invoices/${s.generated_invoice_id}`} className="text-blue-600 hover:underline">View Invoice</Link>
                          ) : '—'}
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

      {/* ── TASK FORM MODAL ── */}
      {showTaskForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">{editingTask ? 'Edit Task' : 'Add Task'}</h2>
              <button onClick={() => setShowTaskForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. UI Design, Server Setup"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={taskForm.description}
                  onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={taskForm.start_date}
                    onChange={e => setTaskForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskForm.end_date}
                    onChange={e => setTaskForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assigned To</label>
                  <input
                    type="text"
                    value={taskForm.assigned_to}
                    onChange={e => setTaskForm(f => ({ ...f, assigned_to: e.target.value }))}
                    placeholder="Name or email"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={taskForm.status}
                    onChange={e => setTaskForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map(s => (
                      <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTaskForm(false)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={savingTask} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingTask ? 'Saving…' : editingTask ? 'Save Changes' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
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
                <input
                  required
                  type="text"
                  placeholder="e.g. Deposit, Design Approval, Final Delivery"
                  value={scheduleForm.schedule_name}
                  onChange={e => setScheduleForm(f => ({ ...f, schedule_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={scheduleForm.description}
                  onChange={e => setScheduleForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Percentage (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={scheduleForm.percentage}
                    onChange={e => setScheduleForm(f => ({ ...f, percentage: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fixed Amount</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={scheduleForm.fixed_amount}
                    onChange={e => setScheduleForm(f => ({ ...f, fixed_amount: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={scheduleForm.due_date}
                  onChange={e => setScheduleForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowScheduleForm(false)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={savingSchedule} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingSchedule ? 'Saving...' : 'Add Line'}
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
              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
                <input
                  required
                  type="text"
                  value={editProjectForm.project_name}
                  onChange={e => setEditProjectForm(f => ({ ...f, project_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
                <select
                  value={editProjectForm.status}
                  onChange={e => setEditProjectForm(f => ({ ...f, status: e.target.value as Project['status'] }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {/* Status preview pill */}
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor[editProjectForm.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {editProjectForm.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager</label>
                <input
                  type="text"
                  value={editProjectForm.project_manager}
                  onChange={e => setEditProjectForm(f => ({ ...f, project_manager: e.target.value }))}
                  placeholder="Full name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Contract Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contract Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editProjectForm.total_contract_amount}
                  onChange={e => setEditProjectForm(f => ({ ...f, total_contract_amount: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editProjectForm.start_date}
                    onChange={e => setEditProjectForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editProjectForm.end_date}
                    onChange={e => setEditProjectForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editProjectForm.description}
                  onChange={e => setEditProjectForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditProject(false)}
                  className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProject}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
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
