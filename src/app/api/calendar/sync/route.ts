import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncEventToGoogle } from '@/lib/calendar/calendarSync';

// POST /api/calendar/sync — manually re-sync unsynced events to Google Calendar
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { company_id?: string; event_id?: string } | null;
  if (!body?.company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  let eventsQuery = supabase
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(*)')
    .eq('company_id', body.company_id)
    .eq('user_id', user.id)
    .neq('status', 'cancelled');

  if (body.event_id) {
    eventsQuery = eventsQuery.eq('id', body.event_id);
  } else {
    eventsQuery = eventsQuery.in('provider_sync_status', ['pending', 'error']);
  }

  const { data: events, error } = await eventsQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let failed = 0;

  for (const event of events ?? []) {
    const operation = event.provider_event_id ? 'update' : 'create';
    try {
      await syncEventToGoogle(supabase, event, event.attendees ?? [], operation);
      synced++;
    } catch {
      failed++;
    }
  }

  // Update last_sync_at on connection
  await supabase
    .from('calendar_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('company_id', body.company_id)
    .eq('user_id', user.id)
    .eq('provider', 'google');

  return NextResponse.json({ ok: true, synced, failed });
}
