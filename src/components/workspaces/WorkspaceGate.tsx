'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { memberships, loading } = useActiveCompany();

  useEffect(() => {
    if (!loading && memberships.length === 0) {
      router.replace('/onboarding/company');
    }
  }, [loading, memberships.length, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading workspace...
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Building2 className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-slate-700">Redirecting to workspace setup...</p>
      </div>
    );
  }

  return children;
}
