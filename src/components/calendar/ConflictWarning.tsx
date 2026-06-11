'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import type { ConflictCheckResult } from '@/lib/calendar/conflictDetection';

type Conflict = ConflictCheckResult['conflicts'][number];

type Props = {
  companyId: string;
  startAt: string;
  endAt: string;
  excludeEventId?: string;
};

export function ConflictWarning({ companyId, startAt, endAt, excludeEventId }: Props) {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!startAt || !endAt || !companyId) return;
    const start = new Date(startAt);
    const end   = new Date(endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) return;

    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const p = new URLSearchParams({
      company_id: companyId,
      start_at:   start.toISOString(),
      end_at:     end.toISOString(),
    });
    if (excludeEventId) p.set('exclude_event_id', excludeEventId);

    fetch(`/api/calendar/conflicts?${p}`, { signal: ac.signal })
      .then((r) => r.ok ? r.json() : { conflicts: [] })
      .then((d) => setConflicts(d.conflicts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [companyId, startAt, endAt, excludeEventId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-1 animate-pulse">
        <Clock className="w-3 h-3" />Checking for conflicts…
      </div>
    );
  }

  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2.5">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium text-sm mb-1.5">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected
      </div>
      <div className="space-y-1.5">
        {conflicts.map((c) => (
          <div key={c.event.id} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-300">
            <div>
              <span className="font-medium capitalize">{c.type.replace('_', ' ')}</span>
              {' '}with{' '}
              <span className="font-medium">&ldquo;{c.event.title}&rdquo;</span>
              {c.overlapMinutes > 0 && ` (${c.overlapMinutes} min overlap)`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
