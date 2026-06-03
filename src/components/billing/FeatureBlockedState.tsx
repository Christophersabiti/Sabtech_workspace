'use client';

import Link from 'next/link';
import { AlertTriangle, CreditCard } from 'lucide-react';

export function FeatureBlockedState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-amber-800">{description}</p>
      <Link
        href="/admin/settings/billing"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#091545] px-4 py-2 text-sm font-bold text-white hover:bg-[#112068]"
      >
        <CreditCard className="h-4 w-4" />
        Open Billing
      </Link>
    </div>
  );
}
