// Availability service: busy slot computation + meeting time suggestions.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkingHours } from '@/types/calendar';

export type TimeSlot = { start: string; end: string };
export type BusyBlock = TimeSlot & { title?: string; eventId: string };

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function parseHHMM(hhmm: string, baseDate: Date): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Get a user's busy blocks for a given date range.
 * Private events are returned with title redacted as "Busy".
 */
export async function getUserBusyBlocks(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  startAt: string,
  endAt: string,
  requestingUserId: string,
): Promise<BusyBlock[]> {
  const { data: events } = await supabase
    .from('calendar_events')
    .select('id, title, start_at, end_at, visibility, user_id, status')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .neq('status', 'cancelled')
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  return (events ?? []).map((e: {
    id: string; title: string; start_at: string; end_at: string;
    visibility: string; user_id: string; status: string;
  }) => ({
    eventId: e.id,
    start:   e.start_at,
    end:     e.end_at,
    title:   (e.visibility === 'private' && e.user_id !== requestingUserId)
      ? 'Busy'
      : e.title,
  }));
}

/**
 * Find available time slots for a meeting of `durationMinutes` within a date range,
 * respecting each attendee's working hours and existing busy blocks.
 */
export async function suggestMeetingTimes(
  supabase: SupabaseClient,
  companyId: string,
  attendeeUserIds: string[],
  durationMinutes: number,
  fromDate: Date,
  toDate: Date,
  requestingUserId: string,
): Promise<TimeSlot[]> {
  // Fetch availability settings for all attendees
  const { data: settings } = await supabase
    .from('user_availability_settings')
    .select('user_id, timezone, working_hours, buffer_before_minutes, buffer_after_minutes, allow_back_to_back')
    .in('user_id', attendeeUserIds)
    .eq('company_id', companyId);

  const settingsMap = new Map(
    (settings ?? []).map((s: { user_id: string; working_hours: WorkingHours; buffer_before_minutes: number; buffer_after_minutes: number; allow_back_to_back: boolean }) =>
      [s.user_id, s]
    ),
  );

  // Fetch busy blocks for all attendees
  const allBusy: Map<string, BusyBlock[]> = new Map();
  for (const uid of attendeeUserIds) {
    const busy = await getUserBusyBlocks(
      supabase, uid, companyId,
      fromDate.toISOString(), toDate.toISOString(),
      requestingUserId,
    );
    allBusy.set(uid, busy);
  }

  const suggestions: TimeSlot[] = [];
  const durationMs = durationMinutes * 60 * 1000;

  // Walk through each day in the range
  const day = new Date(fromDate);
  day.setHours(0, 0, 0, 0);

  while (day <= toDate && suggestions.length < 5) {
    const dayName = DAY_NAMES[day.getDay()];

    // Determine the intersection of all attendees' working hours on this day
    let windowStart: Date | null = null;
    let windowEnd:   Date | null = null;

    for (const uid of attendeeUserIds) {
      const s = settingsMap.get(uid);
      const wh: WorkingHours | undefined = s?.working_hours;
      const dayWh = wh?.[dayName] as { enabled: boolean; start?: string; end?: string } | undefined;

      if (!dayWh?.enabled || !dayWh.start || !dayWh.end) {
        windowStart = null;
        break;
      }

      const ws = parseHHMM(dayWh.start, day);
      const we = parseHHMM(dayWh.end, day);

      windowStart = windowStart ? new Date(Math.max(windowStart.getTime(), ws.getTime())) : ws;
      windowEnd   = windowEnd   ? new Date(Math.min(windowEnd.getTime(), we.getTime()))   : we;
    }

    if (windowStart && windowEnd && windowEnd.getTime() - windowStart.getTime() >= durationMs) {
      // Collect all busy intervals for this day across all attendees
      const intervals: Array<{ start: number; end: number }> = [];
      for (const uid of attendeeUserIds) {
        const s = settingsMap.get(uid);
        const bufBefore = (s?.buffer_before_minutes ?? 0) * 60 * 1000;
        const bufAfter  = (s?.buffer_after_minutes  ?? 0) * 60 * 1000;

        for (const block of allBusy.get(uid) ?? []) {
          const bs = new Date(block.start).getTime() - bufBefore;
          const be = new Date(block.end).getTime()   + bufAfter;
          intervals.push({ start: bs, end: be });
        }
      }

      // Sort and merge overlapping intervals
      intervals.sort((a, b) => a.start - b.start);
      const merged: typeof intervals = [];
      for (const iv of intervals) {
        if (merged.length && iv.start <= merged[merged.length - 1].end) {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
        } else {
          merged.push({ ...iv });
        }
      }

      // Find free slots within the working window
      let cursor = windowStart.getTime();
      for (const iv of [...merged, { start: windowEnd.getTime(), end: windowEnd.getTime() }]) {
        if (cursor + durationMs <= iv.start) {
          suggestions.push({
            start: new Date(cursor).toISOString(),
            end:   new Date(cursor + durationMs).toISOString(),
          });
          if (suggestions.length >= 5) break;
        }
        cursor = Math.max(cursor, iv.end);
      }
    }

    day.setDate(day.getDate() + 1);
  }

  return suggestions;
}
