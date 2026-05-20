'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart2, CreditCard, FileText, FolderOpen, ReceiptText, TrendingUp, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/utils';

type DashboardStats = {
  clients: number;
  projects: number;
  invoices: number;
  payments: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstanding: number;
};

function monthStart() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    clients: 0,
    projects: 0,
    invoices: 0,
    payments: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    outstanding: 0,
  });

  const loadStats = useCallback(async () => {
    if (companyLoading) return;
    if (!activeCompanyId) {
      setStats({
        clients: 0,
        projects: 0,
        invoices: 0,
        payments: 0,
        monthlyRevenue: 0,
        monthlyExpenses: 0,
        outstanding: 0,
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    const start = monthStart();
    const [
      { count: clients },
      { count: projects },
      { data: invoices },
      { data: payments },
      { data: expenses },
    ] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId).eq('is_archived', false),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', activeCompanyId),
      supabase.from('invoices').select('id, balance_due').eq('company_id', activeCompanyId).not('status', 'in', '("void","cancelled")'),
      supabase.from('payments').select('id, amount_paid, payment_date, status').eq('company_id', activeCompanyId).gte('payment_date', start),
      supabase.from('expenses').select('amount, expense_date, status').eq('company_id', activeCompanyId).gte('expense_date', start),
    ]);

    const confirmedPayments = (payments ?? []).filter((payment) => payment.status !== 'reversed');
    const activeExpenses = (expenses ?? []).filter((expense) => expense.status !== 'rejected');
    setStats({
      clients: clients ?? 0,
      projects: projects ?? 0,
      invoices: invoices?.length ?? 0,
      payments: confirmedPayments.length,
      monthlyRevenue: confirmedPayments.reduce((sum, payment) => sum + Number(payment.amount_paid), 0),
      monthlyExpenses: activeExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
      outstanding: (invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.balance_due), 0),
    });
    setLoading(false);
  }, [activeCompanyId, companyLoading, supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadStats);
  }, [loadStats]);

  const monthlyProfit = stats.monthlyRevenue - stats.monthlyExpenses;
  const profitMargin = stats.monthlyRevenue > 0 ? Math.round((monthlyProfit / stats.monthlyRevenue) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Company KPI summary, financial health, and quick access"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Monthly Revenue', value: formatCurrency(stats.monthlyRevenue), icon: CreditCard, tone: 'bg-green-50 text-green-600' },
          { label: 'Monthly Expenses', value: formatCurrency(stats.monthlyExpenses), icon: ReceiptText, tone: 'bg-red-50 text-red-600' },
          { label: 'Monthly Profit', value: formatCurrency(monthlyProfit), icon: TrendingUp, tone: monthlyProfit >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600' },
          { label: 'Profit Margin', value: `${profitMargin}%`, icon: BarChart2, tone: 'bg-purple-50 text-purple-600' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{loading ? '...' : value}</p>
          </div>
        ))}
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Clients', value: stats.clients, href: '/clients', icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'Projects', value: stats.projects, href: '/projects', icon: FolderOpen, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Invoices', value: stats.invoices, href: '/invoices', icon: FileText, color: 'bg-amber-50 text-amber-600' },
          { label: 'Payments', value: stats.payments, href: '/payments', icon: CreditCard, color: 'bg-green-50 text-green-600' },
          { label: 'Expenses', value: formatCurrency(stats.monthlyExpenses), href: '/expenses', icon: ReceiptText, color: 'bg-red-50 text-red-600', sub: 'This month' },
        ].map(({ label, value, href, icon: Icon, color, sub }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <span className="block font-semibold text-slate-800">{label}</span>
              <span className="text-sm text-slate-500">{sub ? `${sub}: ${value}` : value}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold text-slate-700">Ready to go</h2>
        <p className="text-sm text-slate-500">
          Start by adding a <Link href="/clients" className="text-blue-600 hover:underline">Client</Link>,{' '}
          create a <Link href="/projects" className="text-blue-600 hover:underline">Project</Link>,{' '}
          raise an <Link href="/invoices/new" className="text-blue-600 hover:underline">Invoice</Link>, and track related{' '}
          <Link href="/expenses" className="text-blue-600 hover:underline">Expenses</Link>.
        </p>
      </div>
    </div>
  );
}
