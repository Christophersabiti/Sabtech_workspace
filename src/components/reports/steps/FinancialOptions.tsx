'use client';

import { DollarSign, TrendingUp, Receipt, AlertTriangle, BarChart3 } from 'lucide-react';
import type { ReportFinancialOptions } from '@/types';

type Props = {
  financials: ReportFinancialOptions;
  onChange: (f: ReportFinancialOptions) => void;
};

type FinancialToggle = {
  key: keyof ReportFinancialOptions;
  label: string;
  description: string;
  icon: React.ElementType;
  previewLabel: string;
};

const FINANCIAL_TOGGLES: FinancialToggle[] = [
  {
    key: 'showFinancialSummary',
    label: 'Financial Summary',
    description: 'Show budget, invoiced, paid, outstanding, expenses and profit/loss',
    icon: DollarSign,
    previewLabel: 'Budget overview, invoiced vs paid, expenses, profit/loss',
  },
  {
    key: 'showPerTaskFinancials',
    label: 'Per-Task Financials',
    description: 'Show billed amount, paid amount, and balance on each task row',
    icon: Receipt,
    previewLabel: 'Invoice status, payment status, amounts per task',
  },
  {
    key: 'showBudgetVsActual',
    label: 'Budget vs Actual',
    description: 'Show budget comparison with actual spend and variance',
    icon: BarChart3,
    previewLabel: 'Budget comparison chart and variance analysis',
  },
  {
    key: 'showWhtDetails',
    label: 'WHT Details',
    description: 'Show withholding tax amounts and certificate details',
    icon: TrendingUp,
    previewLabel: 'WHT withheld, remittance status, certificates',
  },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer
        ${checked ? 'bg-blue-600' : 'bg-slate-200'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

export default function FinancialOptions({ financials, onChange }: Props) {
  const toggle = (key: keyof ReportFinancialOptions) => {
    onChange({ ...financials, [key]: !financials[key] });
  };

  const anyEnabled = Object.values(financials).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {FINANCIAL_TOGGLES.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="flex items-center justify-between py-3 px-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center
                  ${financials[item.key] ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}
                `}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.description}</p>
                </div>
              </div>
              <Toggle checked={financials[item.key]} onChange={() => toggle(item.key)} />
            </div>
          );
        })}
      </div>

      {/* Preview of enabled sections */}
      {anyEnabled && (
        <div>
          <h4 className="text-sm font-semibold text-slate-800 mb-2">Report will include:</h4>
          <div className="space-y-2">
            {FINANCIAL_TOGGLES.filter(t => financials[t.key]).map(item => (
              <div
                key={item.key}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-700">{item.previewLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client-facing warning */}
      {anyEnabled && (
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <strong>Client-facing reports:</strong> Financial data will be visible in the exported report.
            If this report is for a client, ensure you have permission to share financial details.
          </p>
        </div>
      )}
    </div>
  );
}
