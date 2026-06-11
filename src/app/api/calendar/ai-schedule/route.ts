import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestMeetingTimes } from '@/lib/calendar/availabilityService';
import { getAiSchedulingSuggestion } from '@/lib/calendar/aiScheduler';

// POST /api/calendar/ai-schedule
// Body: { company_id, meeting_title, duration_minutes, attendee_user_ids, preferred_date, timezone }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    company_id:        string;
    meeting_title:     string;
    duration_minutes:  number;
    attendee_user_ids: string[];
    preferred_date:    string;
    timezone?:         string;
  } | null;

  if (!body?.company_id || !body?.meeting_title || !body?.attendee_user_ids?.length || !body?.preferred_date) {
    return NextResponse.json({ error: 'company_id, meeting_title, attendee_user_ids, preferred_date required' }, { status: 400 });
  }

  const from = new Date(body.preferred_date);
  const to   = new Date(from.getTime() + 7 * 86400 * 1000);
  const tz   = body.timezone ?? 'Africa/Kampala';

  // Compute free slots
  const slots = await suggestMeetingTimes(
    supabase,
    body.company_id,
    body.attendee_user_ids,
    body.duration_minutes ?? 60,
    from,
    to,
    user.id,
  );

  // Fetch attendee names
  const { data: attendees } = await supabase
    .from('app_users')
    .select('auth_user_id, full_name, email')
    .in('auth_user_id', body.attendee_user_ids);

  const attendeeNames = (attendees ?? []).map((a: { full_name: string | null; email: string }) =>
    a.full_name ?? a.email,
  );

  const suggestion = await getAiSchedulingSuggestion({
    meetingTitle:    body.meeting_title,
    durationMinutes: body.duration_minutes ?? 60,
    attendeeNames,
    preferredWeek:   from.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    timezone:        tz,
    suggestedSlots:  slots,
    busySummary:     slots.length
      ? `${slots.length} free slot(s) found in the next 7 days.`
      : 'No common free slots found — all attendees are busy.',
  });

  return NextResponse.json({ slots, suggestion });
}
