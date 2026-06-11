import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBusyBlocks, suggestMeetingTimes } from '@/lib/calendar/availabilityService';

// GET /api/calendar/availability?company_id=&user_id=&start=&end=
// Returns busy blocks for a specific user visible to the current user.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p          = req.nextUrl.searchParams;
  const company_id = p.get('company_id');
  const target_uid = p.get('user_id');
  const start      = p.get('start');
  const end        = p.get('end');

  if (!company_id || !target_uid || !start || !end) {
    return NextResponse.json({ error: 'company_id, user_id, start, end required' }, { status: 400 });
  }

  const busy = await getUserBusyBlocks(
    supabase, target_uid, company_id, start, end, user.id,
  );
  return NextResponse.json({ busy });
}

// POST /api/calendar/availability — suggest meeting times for multiple attendees
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    company_id:       string;
    attendee_user_ids: string[];
    duration_minutes: number;
    from_date:        string;
    to_date?:         string;
  } | null;

  if (!body?.company_id || !body?.attendee_user_ids?.length || !body?.duration_minutes || !body?.from_date) {
    return NextResponse.json({ error: 'company_id, attendee_user_ids, duration_minutes, from_date required' }, { status: 400 });
  }

  const from = new Date(body.from_date);
  const to   = body.to_date ? new Date(body.to_date) : new Date(from.getTime() + 7 * 86400 * 1000);

  const slots = await suggestMeetingTimes(
    supabase,
    body.company_id,
    body.attendee_user_ids,
    body.duration_minutes,
    from,
    to,
    user.id,
  );
  return NextResponse.json({ slots });
}
