'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { CalendarDashboard } from '@/components/calendar/CalendarDashboard';
import { Settings } from 'lucide-react';
import Link from 'next/link';

export default function CalendarPage() {
  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)]">
      <div className="shrink-0">
        <PageHeader
          title="Calendar"
          subtitle="Manage meetings, task schedules, consultations, and team availability."
          action={
            <Link
              href="/settings/calendar"
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            >
              <Settings className="w-4 h-4" />
              Connect Calendar
            </Link>
          }
        />
      </div>
      <div className="flex-1 px-6 pb-6 overflow-hidden">
        <CalendarDashboard />
      </div>
    </div>
  );
}
