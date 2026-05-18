'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Client, Invoice, Payment, ProjectWithTotals } from '@/types';
import {
  formatCurrency,
  formatDate,
  BILLING_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  STATUS_LABELS,
} from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EditClientPanel } from '@/components/clients/EditClientPanel';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Edit2,
  Archive,
  ArchiveRestore,
  Plus,
  FileText,
  CreditCard,
  FolderOpen,
  AlertCircle,
  FileDown,
} from 'lucide-react';

type Tab = 'overview' | 'details' | 'projects' | 'invoices' | 'payments' | 'statement';

type PaymentWithInvoice = Payment & {
  invoice?: {
    invoice_number?: string;
  } | null;
};

const TAB_LIST: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'projects', label: 'Projects' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'statement', label: 'Statement' },
];

const statusColor: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

function paymentStatusColor(status: string) {
  if (status === 'reversed') return 'bg-red-100 text-red-600';
  if (status === 'failed') return 'bg-amber-100 text-amber-700';
  if (status === 'pending') return 'bg-slate-100 text-slate-500';
  return 'bg-green-100 text-green-700';
}

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const supabase = createClient();

  // Guard: if the segment is literally "new", redirect to the create page.
  // This handles Next.js 16 Turbopack routing where [id] can match before
  // the static /clients/new segment in some edge cases.
  useEffect(() => {
    if (id === 'new') {
      router.replace('/clients/new');
    }
  }, [id, router]);

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<ProjectWithTotals[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setErrorMessage('Missing client ID.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);

      const [clientRes, projectsRes, invoicesRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase
          .from('project_totals')
          .select('*')
          .eq('client_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*')
          .eq('client_id', id)
          .order('issue_date', { ascending: false }),
      ]);

      if (clientRes.error) {
        throw clientRes.error;
      }

      const loadedClient = (clientRes.data ?? null) as Client | null;
      const loadedProjects = (projectsRes.data ?? []) as ProjectWithTotals[];
      const loadedInvoices = (invoicesRes.data ?? []) as Invoice[];

      setClient(loadedClient);
      setProjects(loadedProjects);
      setInvoices(loadedInvoices);

      if (loadedInvoices.length > 0) {
        const invoiceIds = loadedInvoices.map((invoice) => invoice.id);

        const paymentsRes = await supabase
          .from('payments')
          .select('*, invoice:invoices(invoice_number)')
          .in('invoice_id', invoiceIds)
          .order('payment_date', { ascending: false });

        if (paymentsRes.error) {
          throw paymentsRes.error;
        }

        setPayments((paymentsRes.data ?? []) as PaymentWithInvoice[]);
      } else {
        setPayments([]);
      }
    } catch (error) {
      console.error('Failed to load client profile:', error);
      setErrorMessage('Failed to load client details.');
      setClient(null);
      setProjects([]);
      setInvoices([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.status !== 'void' && invoice.status !== 'cancelled'),
    [invoices]
  );

  const totalBilled = useMemo(
    () => activeInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
    [activeInvoices]
  );

  const totalPaid = useMemo(
    () => activeInvoices.reduce((sum, invoice) => sum + Number(invoice.total_paid || 0), 0),
    [activeInvoices]
  );

  const totalOutstanding = useMemo(
    () => activeInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due || 0), 0),
    [activeInvoices]
  );

  const confirmedPayments = useMemo(
    () => payments.filter((payment) => payment.status !== 'reversed'),
    [payments]
  );

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === 'active').slice(0, 3),
    [projects]
  );

  const tabLabels: Record<Tab, string> = {
    overview: 'Overview',
    details: 'Details',
    projects: `Projects (${projects.length})`,
    invoices: `Invoices (${invoices.length})`,
    payments: `Payments (${confirmedPayments.length})`,
    statement: 'Statement',
  };

  async function handleArchiveToggle() {
    if (!client) return;

    try {
      setArchiving(true);

      const nextArchivedState = !client.is_archived;

      const { error } = await supabase
        .from('clients')
        .update({ is_archived: nextArchivedState })
        .eq('id', client.id);

      if (error) {
        console.error('Failed to toggle archive status:', error);
        return;
      }

      setClient((current) =>
        current ? { ...current, is_archived: nextArchivedState } : current
      );
    } catch (error) {
      console.error('Unexpected archive toggle error:', error);
    } finally {
      setArchiving(false);
    }
  }

  // While redirecting "new" to the create page, show blank rather than error
  if (id === 'new') {
    return <div className="p-12 text-center text-slate-400">Redirecting…</div>;
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading...</div>;
  }

  if (errorMessage) {
    return (
      <div className="p-12 text-center">
        <p className="text-red-500 font-medium">{errorMessage}</p>
        <button
          onClick={() => void load()}
          className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!client) {
    return <div className="p-12 text-center text-red-500">Client not found</div>;
  }

  return (
    <div>
      <div className="mb-5">
        <button
          onClick={() => router.back()}
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </button>

        <PageHeader
          title={client.name}
          subtitle={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{client.client_code}</span>
              {client.company_name && <span className="text-slate-400">·</span>}
              {client.company_name && <span>{client.company_name}</span>}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  client.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {client.status ?? 'active'}
              </span>
              {client.is_archived && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Archived
                </span>
              )}
            </span>
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </button>

              <button
                onClick={() => void handleArchiveToggle()}
                disabled={archiving}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {client.is_archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Archive
                  </>
                )}
              </button>

              <Link
                href={`/invoices/new?client=${client.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Invoice
              </Link>
            </div>
          }
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Total Billed',
            value: formatCurrency(totalBilled, client.currency),
            color: 'bg-blue-50 border-blue-200 text-blue-800',
            icon: FileText,
          },
          {
            label: 'Total Paid',
            value: formatCurrency(totalPaid, client.currency),
            color: 'bg-green-50 border-green-200 text-green-800',
            icon: CreditCard,
          },
          {
            label: 'Outstanding',
            value: formatCurrency(totalOutstanding, client.currency),
            color: 'bg-amber-50 border-amber-200 text-amber-800',
            icon: AlertCircle,
          },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${color}`}
          >
            <Icon className="h-5 w-5 flex-shrink-0 opacity-60" />
            <div>
              <p className="text-xs font-medium opacity-70">{label}</p>
              <p className="mt-0.5 text-lg font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 overflow-x-auto border-b border-slate-200 pb-px">
        <nav className="flex min-w-max gap-1">
          {TAB_LIST.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === tabItem.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tabLabels[tabItem.id]}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Contact Information</h3>
            <div className="space-y-3">
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <a
                    href={`mailto:${client.email}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {client.email}
                  </a>
                </div>
              )}

              {client.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span className="text-sm text-slate-700">{client.phone}</span>
                </div>
              )}

              {client.alternate_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 flex-shrink-0 text-slate-300" />
                  <span className="text-sm text-slate-500">{client.alternate_phone}</span>
                </div>
              )}

              {(client.city || client.country) && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {[client.city, client.country].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}

              {client.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />
                  <span className="whitespace-pre-line text-sm text-slate-500">
                    {client.address}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Business Details</h3>
            <dl className="space-y-2.5">
              {[
                { label: 'Client Code', value: client.client_code, mono: true },
                { label: 'Company', value: client.company_name },
                { label: 'Contact Person', value: client.contact_person },
                { label: 'TIN Number', value: client.tin_number, mono: true },
                { label: 'Currency', value: client.currency },
                { label: 'Client Since', value: formatDate(client.created_at) },
              ].map(({ label, value, mono }) =>
                value ? (
                  <div key={label} className="flex items-start justify-between gap-4">
                    <dt className="flex-shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
                      {label}
                    </dt>
                    <dd className={`text-right text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>
                      {value}
                    </dd>
                  </div>
                ) : null
              )}
            </dl>
          </div>

          {activeProjects.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 md:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Active Projects</h3>
              <div className="space-y-2">
                {activeProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{project.project_name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {BILLING_TYPE_LABELS[project.billing_type]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-amber-700">
                        {formatCurrency(project.outstanding, client.currency)}
                      </p>
                      <p className="text-xs text-slate-400">outstanding</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'details' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {[
              { label: 'Client Code', value: client.client_code, mono: true },
              { label: 'Status', value: client.status ?? 'active' },
              { label: 'Client Name', value: client.name },
              { label: 'Company Name', value: client.company_name },
              { label: 'Contact Person', value: client.contact_person },
              { label: 'Email', value: client.email },
              { label: 'Phone', value: client.phone },
              { label: 'Alternate Phone', value: client.alternate_phone },
              { label: 'City', value: client.city },
              { label: 'Country', value: client.country },
              { label: 'TIN Number', value: client.tin_number, mono: true },
              { label: 'Currency', value: client.currency },
              { label: 'Billing Address', value: client.address, full: true },
              { label: 'Notes', value: client.notes, full: true },
              { label: 'Registered', value: formatDate(client.created_at) },
              { label: 'Last Updated', value: formatDate(client.updated_at) },
            ].map(({ label, value, mono, full }) => (
              <div key={label} className={full ? 'sm:col-span-2' : ''}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p
                  className={`mt-1 text-sm text-slate-800 ${mono ? 'font-mono' : ''} ${
                    !value ? 'text-slate-300' : ''
                  }`}
                >
                  {value || '—'}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Edit2 className="h-4 w-4" />
              Edit Client Details
            </button>
          </div>
        </div>
      )}

      {tab === 'projects' && (
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <FolderOpen className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-500">No projects yet</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {[
                        'Project',
                        'Billing',
                        'Invoiced',
                        'Paid',
                        'Outstanding',
                        'Status',
                        '',
                      ].map((header) => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projects.map((project) => (
                      <tr key={project.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{project.project_name}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-400">
                            {project.project_code}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {BILLING_TYPE_LABELS[project.billing_type]}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatCurrency(project.total_invoiced, client.currency)}
                        </td>
                        <td className="px-4 py-3 text-green-700">
                          {formatCurrency(project.total_paid, client.currency)}
                        </td>
                        <td className="px-4 py-3 font-medium text-amber-700">
                          {formatCurrency(project.outstanding, client.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              statusColor[project.status] ?? 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {project.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 sm:hidden">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{project.project_name}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">
                          {project.project_code}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          statusColor[project.status] ?? 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400">Invoiced</p>
                        <p className="font-medium text-slate-700">
                          {formatCurrency(project.total_invoiced, client.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Paid</p>
                        <p className="font-medium text-green-700">
                          {formatCurrency(project.total_paid, client.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Outstanding</p>
                        <p className="font-medium text-amber-700">
                          {formatCurrency(project.outstanding, client.currency)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {invoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-500">No invoices yet</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {['Invoice #', 'Date', 'Due', 'Total', 'Paid', 'Balance', 'Status', ''].map(
                        (header) => (
                          <th
                            key={header}
                            className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                          >
                            {header}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className={`hover:bg-slate-50 ${invoice.status === 'void' ? 'opacity-40' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(invoice.issue_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(invoice.due_date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatCurrency(invoice.total_amount, invoice.currency)}
                        </td>
                        <td className="px-4 py-3 text-green-700">
                          {formatCurrency(invoice.total_paid, invoice.currency)}
                        </td>
                        <td className="px-4 py-3 font-medium text-amber-700">
                          {formatCurrency(invoice.balance_due, invoice.currency)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 sm:hidden">
                {invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`p-4 ${invoice.status === 'void' ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-slate-500">
                          {invoice.invoice_number}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDate(invoice.issue_date)}
                          {invoice.due_date && ` · Due ${formatDate(invoice.due_date)}`}
                        </p>
                      </div>
                      <StatusBadge status={invoice.status} />
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-slate-400">Total</p>
                        <p className="font-semibold text-slate-900">
                          {formatCurrency(invoice.total_amount, invoice.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Paid</p>
                        <p className="font-medium text-green-700">
                          {formatCurrency(invoice.total_paid, invoice.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Balance</p>
                        <p className="font-medium text-amber-700">
                          {formatCurrency(invoice.balance_due, invoice.currency)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 text-right">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="text-xs font-medium text-blue-600"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {payments.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCard className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-500">No payments yet</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      {[
                        'Receipt #',
                        'Date',
                        'Invoice',
                        'Amount',
                        'Method',
                        'Reference',
                        'Status',
                      ].map((header) => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className={`hover:bg-slate-50 ${
                          payment.status === 'reversed' ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {payment.payment_number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDate(payment.payment_date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {payment.invoice?.invoice_number ?? '—'}
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${
                            payment.status === 'reversed'
                              ? 'text-slate-400 line-through'
                              : 'text-green-700'
                          }`}
                        >
                          {formatCurrency(payment.amount_paid, client.currency)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {PAYMENT_METHOD_LABELS[payment.payment_method]}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {payment.reference_number || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              paymentStatusColor(payment.status ?? 'confirmed')
                            }`}
                          >
                            {payment.status ?? 'confirmed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 sm:hidden">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className={`p-4 ${payment.status === 'reversed' ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`text-base font-bold ${
                            payment.status === 'reversed'
                              ? 'text-slate-400 line-through'
                              : 'text-green-700'
                          }`}
                        >
                          {formatCurrency(payment.amount_paid, client.currency)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDate(payment.payment_date)}
                        </p>
                      </div>

                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                          paymentStatusColor(payment.status ?? 'confirmed')
                        }`}
                      >
                        {payment.status ?? 'confirmed'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{PAYMENT_METHOD_LABELS[payment.payment_method]}</span>
                      <span className="font-mono text-slate-400">
                        {payment.invoice?.invoice_number ?? '—'}
                      </span>
                      {payment.reference_number && (
                        <span className="font-mono">{payment.reference_number}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'statement' && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <FileDown className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h3 className="mb-2 text-base font-semibold text-slate-700">Client Statement</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-slate-500">
            Generate a full account statement showing all invoices, payments, and current
            balance for {client.name}.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={`/api/pdf/statement/${client.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <FileDown className="h-4 w-4" />
              View Statement
            </a>
            <a
              href={`/api/pdf/statement/${client.id}?print=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" />
              Save as PDF
            </a>
          </div>

          <div className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-3 text-left sm:grid-cols-3">
            {[
              {
                label: 'Total Invoiced',
                value: formatCurrency(totalBilled, client.currency),
                color: 'text-slate-900',
              },
              {
                label: 'Total Received',
                value: formatCurrency(totalPaid, client.currency),
                color: 'text-green-700',
              },
              {
                label: 'Balance Due',
                value: formatCurrency(totalOutstanding, client.currency),
                color: 'text-amber-700',
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {activeInvoices.length > 0 && (
            <div className="mx-auto mt-6 max-w-lg text-left">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                {activeInvoices.length} active invoices
              </p>

              {activeInvoices.slice(0, 5).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0"
                >
                  <div>
                    <p className="font-mono text-xs text-slate-600">
                      {invoice.invoice_number}
                    </p>
                    <p className="text-xs text-slate-400">
                      {STATUS_LABELS[invoice.status]}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-amber-700">
                    {formatCurrency(invoice.balance_due, invoice.currency)}
                  </p>
                </div>
              ))}

              {activeInvoices.length > 5 && (
                <p className="mt-2 text-xs text-slate-400">
                  +{activeInvoices.length - 5} more invoices
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <EditClientPanel
        client={editing ? client : null}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setClient(updated);
          setEditing(false);
        }}
      />
    </div>
  );
}
