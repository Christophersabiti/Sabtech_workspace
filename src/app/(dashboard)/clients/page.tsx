'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ClientWithStats } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { EditClientPanel } from '@/components/clients/EditClientPanel';
import { useClientFilters } from '@/hooks/useClientFilters';
import {
  Plus,
  Search,
  Filter,
  X,
  Download,
  Users,
  AlertCircle,
  ChevronRight,
  Edit2,
  Archive,
  ArchiveRestore,
} from 'lucide-react';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];

function exportToCSV(clients: ClientWithStats[]) {
  const headers = [
    'Client Code', 'Name', 'Company', 'Contact Person', 'Email', 'Phone',
    'City', 'Country', 'Currency', 'Status', 'Active Projects',
    'Outstanding Balance', 'Has Overdue', 'Archived', 'Created',
  ];
  const rows = clients.map(c => [
    c.client_code,
    c.name,
    c.company_name ?? '',
    c.contact_person ?? '',
    c.email ?? '',
    c.phone ?? '',
    c.city ?? '',
    c.country ?? '',
    c.currency,
    c.status,
    c.active_projects,
    c.total_outstanding,
    c.has_overdue ? 'Yes' : 'No',
    c.is_archived ? 'Yes' : 'No',
    c.created_at.slice(0, 10),
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClientsPage() {
  const supabase = createClient();
  const { filters, patch, clear, hasActive } = useClientFilters();

  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithStats | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);

    if (showArchived) {
      // Simple query for archived view — no stats needed
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('is_archived', true)
        .order('name');

      setClients(
        ((data || []) as ClientWithStats[]).map(c => ({
          ...c,
          active_projects: 0,
          total_outstanding: 0,
          has_overdue: false,
        })),
      );
    } else {
      const { data } = await supabase.rpc('get_clients_filtered', {
        p_search: filters.search || null,
        p_status: filters.status || null,
        p_has_overdue: filters.hasOverdue,
        p_has_active_projects: filters.hasActiveProjects,
        p_currency: filters.currency || null,
      });

      setClients((data || []) as ClientWithStats[]);
    }

    setLoading(false);
  }, [filters, showArchived]);

  useEffect(() => { load(); }, [load]);

  // Stats from current result set (non-archived)
  const totalClients = clients.length;
  const activeCount = clients.filter(c => c.status === 'active').length;
  const overdueCount = clients.filter(c => c.has_overdue).length;

  async function toggleArchive(client: ClientWithStats, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await supabase
      .from('clients')
      .update({ is_archived: !client.is_archived })
      .eq('id', client.id);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Manage client accounts, contacts, and billing relationships"
        action={
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> New Client
          </Link>
        }
      />

      {/* Stats bar */}
      {!showArchived && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total Clients', value: totalClients, icon: Users, cls: 'text-blue-600 bg-blue-50' },
            { label: 'Active', value: activeCount, icon: Users, cls: 'text-green-600 bg-green-50' },
            { label: 'Overdue', value: overdueCount, icon: AlertCircle, cls: 'text-red-600 bg-red-50' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs font-medium text-slate-500 hidden sm:block">{label}</p>
              </div>
              <p className="text-xs font-medium text-slate-500 sm:hidden mb-1">{label}</p>
              <p className="text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search clients…"
            value={filters.search}
            onChange={e => patch('search', e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={() => setShowFilters(f => !f)}
          className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
            hasActive
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActive && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-xs rounded-full font-bold">
              !
            </span>
          )}
        </button>

        {hasActive && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}

        <button
          onClick={() => { setShowArchived(a => !a); clear(); }}
          className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
            showArchived
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Archive className="h-4 w-4" />
          {showArchived ? 'Active Clients' : 'Archived'}
        </button>

        <button
          onClick={() => exportToCSV(clients)}
          disabled={clients.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && !showArchived && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={e => patch('status', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
            <select
              value={filters.currency}
              onChange={e => patch('currency', e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All currencies</option>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Overdue</label>
            <select
              value={filters.hasOverdue === null ? '' : String(filters.hasOverdue)}
              onChange={e => patch('hasOverdue', e.target.value === '' ? null : e.target.value === 'true')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any</option>
              <option value="true">Has overdue</option>
              <option value="false">No overdue</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Projects</label>
            <select
              value={filters.hasActiveProjects === null ? '' : String(filters.hasActiveProjects)}
              onChange={e => patch('hasActiveProjects', e.target.value === '' ? null : e.target.value === 'true')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any</option>
              <option value="true">Has active projects</option>
              <option value="false">No active projects</option>
            </select>
          </div>
        </div>
      )}

      {/* Client list */}
      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          {showArchived ? 'No archived clients.' : hasActive ? 'No clients match your filters.' : 'No clients yet.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Client', 'Contact', 'Currency', 'Active Projects', 'Outstanding', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${client.id}`} className="block">
                        <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {client.name}
                        </p>
                        {client.company_name && (
                          <p className="text-xs text-slate-400">{client.company_name}</p>
                        )}
                        <p className="text-xs text-slate-400 font-mono">{client.client_code}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{client.email || '—'}</p>
                      {client.phone && <p className="text-xs text-slate-400">{client.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{client.currency}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${client.active_projects > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                        {client.active_projects}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${client.total_outstanding > 0 ? (client.has_overdue ? 'text-red-600' : 'text-amber-600') : 'text-slate-400'}`}>
                        {client.total_outstanding > 0 ? formatCurrency(client.total_outstanding, client.currency) : '—'}
                      </span>
                      {client.has_overdue && (
                        <span className="ml-1 text-xs text-red-500 font-medium">overdue</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => { e.preventDefault(); setEditingClient(client); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={e => toggleArchive(client, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          title={client.is_archived ? 'Restore' : 'Archive'}
                        >
                          {client.is_archived
                            ? <ArchiveRestore className="h-3.5 w-3.5" />
                            : <Archive className="h-3.5 w-3.5" />}
                        </button>
                        <Link
                          href={`/clients/${client.id}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          title="View profile"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {clients.map(client => (
              <div key={client.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Link href={`/clients/${client.id}`} className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{client.name}</p>
                    {client.company_name && (
                      <p className="text-xs text-slate-400 truncate">{client.company_name}</p>
                    )}
                    <p className="text-xs text-slate-400 font-mono">{client.client_code}</p>
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {client.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-slate-400">Currency</p>
                    <p className="font-mono font-medium">{client.currency}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Projects</p>
                    <p className={`font-semibold ${client.active_projects > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                      {client.active_projects}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Outstanding</p>
                    <p className={`font-semibold ${client.total_outstanding > 0 ? (client.has_overdue ? 'text-red-600' : 'text-amber-600') : 'text-slate-400'}`}>
                      {client.total_outstanding > 0 ? formatCurrency(client.total_outstanding, client.currency) : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={e => { e.preventDefault(); setEditingClient(client); }}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-50"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={e => toggleArchive(client, e)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 px-2 py-1.5 rounded-lg hover:bg-amber-50"
                  >
                    {client.is_archived
                      ? <><ArchiveRestore className="h-3.5 w-3.5" /> Restore</>
                      : <><Archive className="h-3.5 w-3.5" /> Archive</>}
                  </button>
                  <Link
                    href={`/clients/${client.id}`}
                    className="ml-auto inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 px-2 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    View Profile <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit panel */}
      {editingClient && (
        <EditClientPanel
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => { setEditingClient(null); load(); }}
        />
      )}
    </div>
  );
}
