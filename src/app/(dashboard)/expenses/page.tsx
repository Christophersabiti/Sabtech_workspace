'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle,
  Download,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { Client, Expense, ExpenseCategory, ExpenseRecurrence, ExpenseStatus, Project } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

type ExpenseRow = Expense & {
  client: { name: string; company_name: string | null } | null;
  project: { project_name: string } | null;
  category: { name: string } | null;
};

const RECURRENCE_OPTIONS: Array<{ value: ExpenseRecurrence; label: string }> = [
  { value: 'one_off', label: 'One-off' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
];

const STATUS_OPTIONS: Array<{ value: ExpenseStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];

const DEFAULT_FORM = {
  clientId: '',
  projectId: '',
  categoryId: '',
  amount: '',
  currency: 'UGX',
  expenseDate: new Date().toISOString().slice(0, 10),
  vendor: '',
  description: '',
  receiptUrl: '',
  recurrence: 'one_off' as ExpenseRecurrence,
  isSystemSubscription: false,
  renewalDate: '',
  status: 'pending' as ExpenseStatus,
};

function daysUntil(date: string | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(date);
  renewal.setHours(0, 0, 0, 0);
  return Math.ceil((renewal.getTime() - today.getTime()) / 86_400_000);
}

function renewalBadge(expense: ExpenseRow) {
  if (!expense.is_system_subscription || !expense.renewal_date) return null;
  const days = daysUntil(expense.renewal_date);
  if (days === null) return null;
  if (days < 0) return { text: `${Math.abs(days)} days overdue`, className: 'bg-red-100 text-red-700' };
  if (days === 0) return { text: 'Renews today', className: 'bg-amber-100 text-amber-700' };
  if (days <= 30) return { text: `${days} days left`, className: 'bg-amber-100 text-amber-700' };
  return { text: `${days} days left`, className: 'bg-green-100 text-green-700' };
}

function exportExpensesCSV(expenses: ExpenseRow[]) {
  const headers = ['Date', 'Client', 'Project', 'Category', 'Vendor', 'Amount', 'Currency', 'Recurrence', 'Renewal Date', 'Status'];
  const rows = expenses.map((expense) => [
    expense.expense_date,
    expense.client?.name ?? '',
    expense.project?.project_name ?? '',
    expense.category?.name ?? '',
    expense.vendor ?? '',
    expense.amount,
    expense.currency,
    expense.recurrence,
    expense.renewal_date ?? '',
    expense.status,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const anchor = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const loadData = useCallback(async () => {
    if (companyLoading) return;
    if (!activeCompanyId) {
      setExpenses([]);
      setClients([]);
      setProjects([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const appUserQuery = session
      ? supabase.from('app_users').select('id').eq('auth_user_id', session.user.id).maybeSingle()
      : Promise.resolve({ data: null });

    let expenseQuery = supabase
      .from('expenses')
      .select('*, client:clients(name, company_name), project:projects(project_name), category:expense_categories(name)')
      .eq('company_id', activeCompanyId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (dateFrom) expenseQuery = expenseQuery.gte('expense_date', dateFrom);
    if (dateTo) expenseQuery = expenseQuery.lte('expense_date', dateTo);
    if (clientFilter) expenseQuery = expenseQuery.eq('client_id', clientFilter);

    const [{ data: expenseRows }, { data: clientRows }, { data: projectRows }, { data: categoryRows }, { data: appUser }] =
      await Promise.all([
        expenseQuery,
        supabase.from('clients').select('*').eq('company_id', activeCompanyId).eq('is_archived', false).order('name'),
        supabase.from('projects').select('*').eq('company_id', activeCompanyId).order('project_name'),
        supabase.from('expense_categories').select('*').eq('company_id', activeCompanyId).order('name'),
        appUserQuery,
      ]);

    setExpenses((expenseRows ?? []) as ExpenseRow[]);
    setClients((clientRows ?? []) as Client[]);
    setProjects((projectRows ?? []) as Project[]);
    setCategories((categoryRows ?? []) as ExpenseCategory[]);
    setAppUserId((appUser as { id?: string } | null)?.id ?? null);
    setLoading(false);
  }, [activeCompanyId, clientFilter, companyLoading, dateFrom, dateTo, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return expenses;
    return expenses.filter((expense) =>
      [
        expense.vendor,
        expense.description,
        expense.client?.name,
        expense.project?.project_name,
        expense.category?.name,
        expense.status,
      ].some((value) => (value ?? '').toLowerCase().includes(term)),
    );
  }, [expenses, search]);

  const formProjects = form.clientId
    ? projects.filter((project) => project.client_id === form.clientId)
    : projects;

  const reportTotal = filteredExpenses
    .filter((expense) => expense.status !== 'rejected')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const monthlyTotal = filteredExpenses
    .filter((expense) => expense.recurrence === 'monthly' && expense.status !== 'rejected')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const annualTotal = filteredExpenses
    .filter((expense) => expense.recurrence === 'annual' && expense.status !== 'rejected')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const dueSoon = filteredExpenses.filter((expense) => {
    const days = daysUntil(expense.renewal_date);
    return expense.is_system_subscription && days !== null && days <= 30;
  }).length;

  function updateForm(field: keyof typeof form, value: string | boolean) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'clientId') next.projectId = '';
      if (field === 'recurrence' && value === 'one_off') {
        next.isSystemSubscription = false;
        next.renewalDate = '';
      }
      return next;
    });
  }

  async function createExpense(event: FormEvent) {
    event.preventDefault();
    if (!activeCompanyId) return;
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      company_id: activeCompanyId,
      client_id: form.clientId || null,
      project_id: form.projectId || null,
      category_id: form.categoryId || null,
      amount: Number(form.amount),
      currency: form.currency,
      expense_date: form.expenseDate,
      vendor: form.vendor || null,
      description: form.description || null,
      receipt_url: form.receiptUrl || null,
      recurrence: form.recurrence,
      is_system_subscription: form.isSystemSubscription,
      renewal_date: form.renewalDate || null,
      created_by: appUserId,
      status: form.status,
    });

    if (error) {
      setToast({ type: 'error', message: error.message });
      setSaving(false);
      return;
    }

    setToast({ type: 'success', message: 'Expense created.' });
    setShowCreate(false);
    setForm(DEFAULT_FORM);
    await loadData();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track project costs, subscriptions, renewal alerts, and expense reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Expense
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Period Expenses', value: formatCurrency(reportTotal), icon: ReceiptText, tone: 'bg-red-50 text-red-600' },
          { label: 'Monthly Recurring', value: formatCurrency(monthlyTotal), icon: CalendarClock, tone: 'bg-blue-50 text-blue-600' },
          { label: 'Annual Recurring', value: formatCurrency(annualTotal), icon: CalendarClock, tone: 'bg-purple-50 text-purple-600' },
          { label: 'Renewals Due', value: dueSoon, icon: AlertCircle, tone: 'bg-amber-50 text-amber-600' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vendor, client, project..."
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => exportExpensesCSV(filteredExpenses)}
            disabled={filteredExpenses.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading expenses...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300">
              <ReceiptText className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800">No expenses found.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Create your first expense to track project costs, recurring subscriptions, and renewal reminders.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Expense</th>
                  <th className="px-5 py-3">Client / Project</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Recurrence</th>
                  <th className="px-5 py-3">Renewal</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map((expense) => {
                  const badge = renewalBadge(expense);
                  return (
                    <tr key={expense.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{expense.vendor ?? expense.category?.name ?? 'Expense'}</p>
                        <p className="text-xs text-slate-500">{expense.description ?? expense.category?.name ?? 'Uncategorised'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-700">{expense.client?.name ?? 'No client'}</p>
                        <p className="text-xs text-slate-400">{expense.project?.project_name ?? 'No project'}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(expense.expense_date)}</td>
                      <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(Number(expense.amount), expense.currency)}</td>
                      <td className="px-5 py-4 capitalize text-slate-600">{expense.recurrence.replace('_', '-')}</td>
                      <td className="px-5 py-4">
                        {badge ? (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.text}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                          {expense.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Expense</h2>
                <p className="text-sm text-slate-500">Link the cost to a client, project, and renewal cycle.</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createExpense}>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Client</span>
                  <select
                    value={form.clientId}
                    onChange={(event) => updateForm('clientId', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Project</span>
                  <select
                    value={form.projectId}
                    onChange={(event) => updateForm('projectId', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No project</option>
                    {formProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.project_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
                  <select
                    value={form.categoryId}
                    onChange={(event) => updateForm('categoryId', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Vendor</span>
                  <input
                    value={form.vendor}
                    onChange={(event) => updateForm('vendor', event.target.value)}
                    placeholder="Supplier or subscription name"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Amount</span>
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={form.amount}
                    onChange={(event) => updateForm('amount', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Currency</span>
                  <input
                    required
                    value={form.currency}
                    onChange={(event) => updateForm('currency', event.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Expense Date</span>
                  <input
                    required
                    type="date"
                    value={form.expenseDate}
                    onChange={(event) => updateForm('expenseDate', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateForm('status', event.target.value as ExpenseStatus)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Recurrence</span>
                  <select
                    value={form.recurrence}
                    onChange={(event) => updateForm('recurrence', event.target.value as ExpenseRecurrence)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RECURRENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Renewal Date</span>
                  <input
                    type="date"
                    disabled={form.recurrence === 'one_off'}
                    value={form.renewalDate}
                    onChange={(event) => updateForm('renewalDate', event.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.isSystemSubscription}
                    disabled={form.recurrence === 'one_off'}
                    onChange={(event) => updateForm('isSystemSubscription', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">This is a system subscription that requires renewal alerts</span>
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Receipt URL</span>
                  <input
                    value={form.receiptUrl}
                    onChange={(event) => updateForm('receiptUrl', event.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Description</span>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) => updateForm('description', event.target.value)}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              </div>
              <div className="flex gap-3 border-t border-slate-100 p-5">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Create Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
