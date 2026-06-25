'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { formatCurrency } from '@/lib/utils';
import { FolderKanban, Plus, TrendingUp, TrendingDown, Minus, X } from 'lucide-react';
import type { Portfolio } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  on_hold:   'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  archived:  'bg-slate-100 text-slate-500',
};

const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  on_track:  { label: 'On Track',  color: 'text-green-600',  icon: TrendingUp },
  at_risk:   { label: 'At Risk',   color: 'text-amber-600',  icon: Minus },
  off_track: { label: 'Off Track', color: 'text-red-600',    icon: TrendingDown },
  completed: { label: 'Completed', color: 'text-blue-600',   icon: TrendingUp },
};

type PortfolioForm = {
  name: string;
  description: string;
  status: Portfolio['status'];
  health_status: Portfolio['health_status'];
  budget_total: string;
  start_date: string;
  end_date: string;
};

const EMPTY_FORM: PortfolioForm = {
  name: '',
  description: '',
  status: 'active',
  health_status: 'on_track',
  budget_total: '',
  start_date: '',
  end_date: '',
};

export default function PortfoliosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PortfolioForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchPortfolios = useCallback(async () => {
    if (!activeCompanyId) return [];

    const { data } = await supabase
      .from('portfolios')
      .select('*, client:clients(name), portfolio_projects(project:projects(id, project_name, status))')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false });
    return (data || []) as any[];
  }, [activeCompanyId, supabase]);

  useEffect(() => {
    if (companyLoading || !activeCompanyId) return;

    let cancelled = false;
    void fetchPortfolios()
      .then((list) => {
        if (!cancelled) {
          setPortfolios(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeCompanyId, companyLoading, fetchPortfolios]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Portfolio) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description || '',
      status: p.status,
      health_status: p.health_status,
      budget_total: p.budget_total != null ? String(p.budget_total) : '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: activeCompanyId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      status: form.status,
      health_status: form.health_status,
      budget_total: form.budget_total ? parseFloat(form.budget_total) : 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };

    const { error } = editingId
      ? await supabase.from('portfolios').update(payload).eq('id', editingId)
      : await supabase.from('portfolios').insert(payload);

    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    showToast(editingId ? 'Portfolio updated.' : 'Portfolio created.', true);
    setShowForm(false);
    setPortfolios(await fetchPortfolios());
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this portfolio?')) return;
    await supabase.from('portfolios').delete().eq('id', id);
    showToast('Portfolio deleted.', true);
    setPortfolios(await fetchPortfolios());
  }

  if (companyLoading || (Boolean(activeCompanyId) && loading)) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Portfolios"
        subtitle="Group and track related projects together"
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> New Portfolio
          </button>
        }
      />

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <FolderKanban className="h-12 w-12 text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">No portfolios yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a portfolio to group related projects</p>
          <button
            onClick={openCreate}
            className="mt-6 inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus className="h-4 w-4" /> Create Portfolio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {portfolios.map(p => {
            const health = HEALTH_CONFIG[p.health_status] ?? HEALTH_CONFIG.on_track;
            const HealthIcon = health.icon;
            return (
              <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{p.name}</h3>
                    {p.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[p.status]}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1">
                    <HealthIcon className={`h-3.5 w-3.5 ${health.color}`} />
                    <span className={`text-xs font-medium ${health.color}`}>{health.label}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    {p.portfolio_projects?.length || 0} Project{p.portfolio_projects?.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Progress</span>
                    <span>{p.progress_percent ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${p.progress_percent ?? 0}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-slate-400 mb-0.5">Budget</p>
                    <p className="font-semibold text-slate-700">{formatCurrency(p.budget_total)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-slate-400 mb-0.5">Period</p>
                    <p className="font-medium text-slate-700">
                      {p.start_date ? p.start_date.slice(0, 7) : '—'} → {p.end_date ? p.end_date.slice(0, 7) : '—'}
                    </p>
                  </div>
                </div>

                {p.portfolio_projects && p.portfolio_projects.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 mt-3 mb-3">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Linked Projects</p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {p.portfolio_projects.map(({ project }: any) => {
                        if (!project) return null;
                        return (
                          <Link
                            key={project.id}
                            href={`/projects/${project.id}`}
                            className="inline-flex items-center gap-1.5 text-[11px] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-2.5 py-0.5 text-slate-600 hover:text-slate-900 transition-colors truncate max-w-[150px]"
                          >
                            <span className="truncate">{project.project_name}</span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${project.status === 'completed' ? 'bg-blue-500' : 'bg-green-500'}`} />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 py-1.5 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="flex-1 text-xs font-medium text-red-500 hover:text-red-700 border border-red-100 hover:bg-red-50 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Portfolio' : 'New Portfolio'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as Portfolio['status'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Health</label>
                  <select
                    value={form.health_status}
                    onChange={e => setForm(f => ({ ...f, health_status: e.target.value as Portfolio['health_status'] }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="on_track">On Track</option>
                    <option value="at_risk">At Risk</option>
                    <option value="off_track">Off Track</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Budget Total</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budget_total}
                  onChange={e => setForm(f => ({ ...f, budget_total: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Portfolio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
