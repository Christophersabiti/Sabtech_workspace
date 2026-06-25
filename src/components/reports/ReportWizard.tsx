'use client';

import { useState, useCallback } from 'react';
import {
  Users, FolderKanban, Filter, Eye, DollarSign,
  FileSearch, Download, ChevronLeft, ChevronRight, Check,
} from 'lucide-react';
import type { ReportFilters, ReportVisibilityOptions, ReportFinancialOptions } from '@/types';
import { DEFAULT_FILTERS, DEFAULT_VISIBILITY, DEFAULT_FINANCIALS, REPORT_STEPS } from './reportTypes';

const STEP_ICONS = { Users, FolderKanban, Filter, Eye, DollarSign, FileSearch, Download };

type Props = {
  children: (step: number) => React.ReactNode;
  filters: ReportFilters;
  visibility: ReportVisibilityOptions;
  financials: ReportFinancialOptions;
  onFiltersChange: (f: ReportFilters) => void;
  onVisibilityChange: (v: ReportVisibilityOptions) => void;
  onFinancialsChange: (f: ReportFinancialOptions) => void;
  onStepChange?: (step: number) => void;
  onReset?: () => void;
};

export default function ReportWizard({
  children,
  filters,
  onStepChange,
  onReset,
}: Props) {
  const [currentStep, setCurrentStep] = useState(1);

  const goTo = useCallback((step: number) => {
    setCurrentStep(step);
    onStepChange?.(step);
  }, [onStepChange]);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 1: return true; // client selection is optional (all clients)
      case 2: return true; // project selection optional (all projects for client)
      default: return true;
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < 7 && canProceed()) goTo(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) goTo(currentStep - 1);
  };

  const handleReset = () => {
    setCurrentStep(1);
    onReset?.();
  };

  return (
    <div className="space-y-6">
      {/* ─── Step Progress Bar ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[640px]">
          {REPORT_STEPS.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const IconComponent = STEP_ICONS[step.icon as keyof typeof STEP_ICONS];

            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                {/* Step circle + label */}
                <button
                  onClick={() => {
                    if (isCompleted || isActive) goTo(step.id);
                  }}
                  className={`
                    flex flex-col items-center gap-1.5 group cursor-pointer
                    transition-all duration-300
                    ${isCompleted || isActive ? 'opacity-100' : 'opacity-50'}
                  `}
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    transition-all duration-300 border-2
                    ${isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : isActive
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/25 scale-110'
                        : 'bg-white border-slate-300 text-slate-400'
                    }
                  `}>
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <IconComponent className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <span className={`
                    text-xs font-medium whitespace-nowrap
                    ${isActive ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}
                  `}>
                    {step.label}
                  </span>
                </button>

                {/* Connector line */}
                {idx < REPORT_STEPS.length - 1 && (
                  <div className="flex-1 mx-2 h-0.5 rounded-full overflow-hidden bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted
                          ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 w-full'
                          : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Step Content ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        {/* Step header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <h3 className="text-lg font-semibold text-slate-800">
            Step {currentStep}: {REPORT_STEPS[currentStep - 1].label}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {REPORT_STEPS[currentStep - 1].description}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[400px]">
          {children(currentStep)}
        </div>

        {/* ─── Navigation Footer ─────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                           text-slate-600 bg-white border border-slate-200 rounded-lg
                           hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              onClick={handleReset}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            Step {currentStep} of {REPORT_STEPS.length}
          </div>

          {currentStep < 7 && (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium
                         text-white bg-blue-600 rounded-lg shadow-sm
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors cursor-pointer"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_FILTERS, DEFAULT_VISIBILITY, DEFAULT_FINANCIALS };
