'use client';

import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { ProjectFinancialSummary } from '@/types';

type Props = {
  summary: ProjectFinancialSummary;
  currency?: string;
};

function formatCurrency(amount: number, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ` ${currency}`;
}

export default function ProjectFinancialSummary({ summary, currency = 'UGX' }: Props) {
  const profitPositive = summary.estimated_profit >= 0;
  const budgetUsed = summary.budget
    ? Math.min(100, Math.round(((summary.invoiced + summary.total_expenses) / summary.budget) * 100))
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-4 border border-blue-200/50">
          <div className="flex items-center gap-2 mb-1.5">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-blue-600 font-medium">Budget</span>
          </div>
          <p className="text-lg font-bold text-blue-900">{formatCurrency(summary.budget || 0, currency)}</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 border border-emerald-200/50">
          <div className="flex items-center gap-2 mb-1.5">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">Paid</span>
          </div>
          <p className="text-lg font-bold text-emerald-900">{formatCurrency(summary.paid, currency)}</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-4 border border-amber-200/50">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-600 font-medium">Outstanding</span>
          </div>
          <p className="text-lg font-bold text-amber-900">{formatCurrency(summary.outstanding, currency)}</p>
        </div>

        <div className={`bg-gradient-to-br rounded-xl p-4 border ${
          profitPositive
            ? 'from-emerald-50 to-emerald-100/50 border-emerald-200/50'
            : 'from-red-50 to-red-100/50 border-red-200/50'
        }`}>
          <div className="flex items-center gap-2 mb-1.5">
            {profitPositive ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-xs font-medium ${profitPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              Est. Profit
            </span>
          </div>
          <p className={`text-lg font-bold ${profitPositive ? 'text-emerald-900' : 'text-red-900'}`}>
            {formatCurrency(summary.estimated_profit, currency)}
          </p>
          <p className={`text-xs ${profitPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {summary.profit_margin_percent}% margin
          </p>
        </div>
      </div>

      {/* Budget utilization bar */}
      {summary.budget && summary.budget > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Budget Utilization</span>
            <span className={`text-sm font-bold ${budgetUsed > 90 ? 'text-red-600' : budgetUsed > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {budgetUsed}%
            </span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budgetUsed > 90 ? 'bg-red-500' : budgetUsed > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${budgetUsed}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Invoiced: {formatCurrency(summary.invoiced, currency)}</span>
            <span>Expenses: {formatCurrency(summary.total_expenses, currency)}</span>
          </div>
        </div>
      )}

      {/* Breakdown table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {[
              { label: 'Total Budget', value: summary.budget || 0 },
              { label: 'Invoiced', value: summary.invoiced },
              { label: 'Paid', value: summary.paid },
              { label: 'Outstanding', value: summary.outstanding },
              { label: 'Expenses', value: summary.total_expenses },
              { label: 'Time Cost', value: summary.total_time_cost },
              { label: 'Estimated Profit/Loss', value: summary.estimated_profit, highlight: true },
            ].map(row => (
              <tr key={row.label} className="hover:bg-slate-50/50">
                <td className={`px-4 py-2.5 ${row.highlight ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                  {row.label}
                </td>
                <td className={`px-4 py-2.5 text-right ${
                  row.highlight
                    ? `font-bold ${row.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`
                    : 'text-slate-700'
                }`}>
                  {formatCurrency(row.value, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
