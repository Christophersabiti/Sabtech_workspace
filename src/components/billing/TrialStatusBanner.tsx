'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, CreditCard } from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';

const STATUS_COPY = {
  trial_active: {
    icon: Clock,
    tone: 'border-[#BFEADB] bg-[#E1F5EE] text-[#091545]',
    action: 'Trial active',
  },
  trial_expired: {
    icon: AlertTriangle,
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    action: 'Trial expired',
  },
  active: {
    icon: CheckCircle2,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    action: 'Subscription active',
  },
  past_due: {
    icon: AlertTriangle,
    tone: 'border-red-200 bg-red-50 text-red-900',
    action: 'Payment past due',
  },
  cancelled: {
    icon: AlertTriangle,
    tone: 'border-slate-200 bg-slate-100 text-slate-800',
    action: 'Subscription cancelled',
  },
  suspended: {
    icon: AlertTriangle,
    tone: 'border-red-200 bg-red-50 text-red-900',
    action: 'Account suspended',
  },
};

export function TrialStatusBanner() {
  const { snapshot, loading } = useEntitlements();

  if (loading || !snapshot) return null;

  const status = STATUS_COPY[snapshot.billingStatus];
  const Icon = status.icon;
  const isRestricted = ['trial_expired', 'past_due', 'cancelled', 'suspended'].includes(snapshot.billingStatus);
  const detail = snapshot.billingStatus === 'trial_active'
    ? `${snapshot.trialDaysRemaining} day${snapshot.trialDaysRemaining === 1 ? '' : 's'} remaining on ${snapshot.packageName}.`
    : `${snapshot.packageName} package. ${isRestricted ? 'Major create/export actions are restricted.' : 'Workspace access is enabled.'}`;

  return (
    <div className={`mb-5 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm md:flex-row md:items-center md:justify-between ${status.tone}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold">{status.action}</p>
          <p className="mt-0.5 text-xs opacity-80">{detail}</p>
        </div>
      </div>
      <Link
        href="/admin/settings/billing"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#091545] px-3 text-xs font-bold text-white hover:bg-[#112068]"
      >
        <CreditCard className="h-4 w-4" />
        Billing
      </Link>
    </div>
  );
}
