// Conflict detection: find overlapping calendar_events for a user in a time window.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent } from '@/types/calendar';

export type ConflictCheckResult = {
  hasConflict: boolean;
  conflicts: Array<{
    event: CalendarEvent;
    overlapMinutes: number;
    type: 'overlap' | 'back_to_back' | 'double_booking';
  }>;
};

/**
 * Check if a proposed [startAt, endAt] window conflicts with the user's existing events.
 * excludeEventId: skip checking against an event we're currently editing.
 */
export async function checkConflicts(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  startAt: string,
  endAt: string,
  excludeEventId?: string,
): Promise<ConflictCheckResult> {
  const start = new Date(startAt);
  const end   = new Date(endAt);

  // Add 15-minute buffer around the window to detect back-to-back
  const bufferedStart = new Date(start.getTime() - 15 * 60 * 1000).toISOString();
  const bufferedEnd   = new Date(end.getTime()   + 15 * 60 * 1000).toISOString();

  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .neq('status', 'cancelled')
    .lt('start_at', bufferedEnd)
    .gt('end_at', bufferedStart);

  if (excludeEventId) query = query.neq('id', excludeEventId);

  const { data: nearby } = await query;
  if (!nearby?.length) return { hasConflict: false, conflicts: [] };

  const conflicts: ConflictCheckResult['conflicts'] = [];

  for (const event of nearby as CalendarEvent[]) {
    const evStart = new Date(event.start_at);
    const evEnd   = new Date(event.end_at);

    const overlapStart = Math.max(start.getTime(), evStart.getTime());
    const overlapEnd   = Math.min(end.getTime(),   evEnd.getTime());
    const overlapMs    = overlapEnd - overlapStart;

    if (overlapMs > 0) {
      const overlapMinutes = Math.round(overlapMs / 60000);
      conflicts.push({
        event,
        overlapMinutes,
        type: overlapMinutes >= (end.getTime() - start.getTime()) / 60000
          ? 'double_booking'
          : 'overlap',
      });
    } else {
      // Back-to-back: gap is < 15 minutes
      const gapMs = start > evEnd
        ? start.getTime() - evEnd.getTime()
        : evStart.getTime() - end.getTime();
      if (gapMs >= 0 && gapMs < 15 * 60 * 1000) {
        conflicts.push({ event, overlapMinutes: 0, type: 'back_to_back' });
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}

/**
 * Persist detected conflicts to calendar_conflicts table.
 */
export async function persistConflicts(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  eventId: string,
  conflicts: ConflictCheckResult['conflicts'],
): Promise<void> {
  if (!conflicts.length) return;

  const rows = conflicts.map((c) => ({
    company_id:           companyId,
    user_id:              userId,
    event_id:             eventId,
    conflicting_event_id: c.event.id,
    conflict_type:        c.type,
    detected_at:          new Date().toISOString(),
    resolved:             false,
  }));

  // Upsert to avoid duplicates
  await supabase
    .from('calendar_conflicts')
    .upsert(rows, { onConflict: 'event_id,conflicting_event_id' as never })
    .then(() => undefined);
}
