import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import type { CreateCalendarEventPayload } from '@/types/calendar';
import { syncEventToGoogle } from '@/lib/calendar/calendarSync';

// GET /api/calendar/events?company_id=&start=&end=&project_id=&client_id=&status=&event_type=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const company_id = p.get('company_id');
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  let query = supabase
    .from('calendar_events')
    .select(`
      *,
      project:projects(id, project_name, project_code),
      client:clients(id, name, company_name),
      attendees:calendar_event_attendees(*)
    `)
    .eq('company_id', company_id)
    .neq('status', 'cancelled');

  const start = p.get('start');
  const end   = p.get('end');
  if (start) query = query.gte('start_at', start);
  if (end)   query = query.lte('end_at', end);

  const project_id  = p.get('project_id');
  const client_id   = p.get('client_id');
  const status      = p.get('status');
  const event_type  = p.get('event_type');
  const user_filter = p.get('user_id');

  if (project_id)  query = query.eq('project_id', project_id);
  if (client_id)   query = query.eq('client_id', client_id);
  if (status)      query = query.eq('status', status);
  if (event_type)  query = query.eq('event_type', event_type);
  if (user_filter) query = query.eq('user_id', user_filter);

  // Enforce visibility: only return private events owned by the current user
  query = query.or(`visibility.neq.private,user_id.eq.${user.id}`);

  const { data, error } = await query.order('start_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ events: data });
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as CreateCalendarEventPayload | null;
  if (!body?.company_id || !body?.title || !body?.start_at || !body?.end_at) {
    return NextResponse.json(
      { error: 'company_id, title, start_at, and end_at are required' },
      { status: 400 },
    );
  }

  if (new Date(body.start_at) >= new Date(body.end_at)) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 });
  }

  const permissions = new PermissionService(supabase);
  try {
    await permissions.assertCompanyAccess(user.id, body.company_id);
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const now = new Date().toISOString();
  const { data: event, error: insertErr } = await supabase
    .from('calendar_events')
    .insert({
      company_id:    body.company_id,
      user_id:       user.id,
      title:         body.title,
      description:   body.description ?? null,
      start_at:      body.start_at,
      end_at:        body.end_at,
      all_day:       body.all_day ?? false,
      timezone:      body.timezone ?? 'UTC',
      location:      body.location ?? null,
      meet_link:     body.meet_link ?? null,
      color:         body.color ?? null,
      project_id:    body.project_id ?? null,
      task_id:       body.task_id ?? null,
      client_id:     body.client_id ?? null,
      event_type:    body.event_type ?? 'meeting',
      status:        body.status ?? 'scheduled',
      visibility:    body.visibility ?? 'team',
      recurrence_rule: body.recurrence_rule ?? null,
      provider:      'internal',
      source:        'internal',
      created_by:    user.id,
      updated_by:    user.id,
      created_at:    now,
      updated_at:    now,
    })
    .select()
    .single();

  if (insertErr || !event) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
  }

  // Insert attendees
  const insertedAttendees: unknown[] = [];
  if (body.attendees?.length) {
    const rows = body.attendees.map((a) => ({
      event_id:      event.id,
      company_id:    body.company_id,
      user_id:       a.user_id ?? null,
      email:         a.email,
      name:          a.name ?? null,
      attendee_type: a.attendee_type ?? 'internal',
      is_optional:   a.is_optional ?? false,
      is_organizer:  false,
    }));
    const { data: attendeeRows } = await supabase
      .from('calendar_event_attendees')
      .insert(rows)
      .select();
    if (attendeeRows) insertedAttendees.push(...attendeeRows);
  }

  // Insert organizer as an attendee
  const { data: organizerProfile } = await supabase
    .from('app_users')
    .select('email, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (organizerProfile?.email) {
    await supabase.from('calendar_event_attendees').insert({
      event_id:      event.id,
      company_id:    body.company_id,
      user_id:       user.id,
      email:         organizerProfile.email,
      name:          organizerProfile.full_name ?? null,
      attendee_type: 'internal',
      is_organizer:  true,
      rsvp_status:   'accepted',
    });
  }

  // Insert reminders
  if (body.reminders?.length) {
    const reminderRows = body.reminders.map((r) => ({
      event_id:       event.id,
      company_id:     body.company_id,
      user_id:        user.id,
      method:         r.method,
      minutes_before: r.minutes_before,
    }));
    await supabase.from('calendar_reminders').insert(reminderRows);
  }

  // Sync to Google Calendar (fire-and-forget)
  if (body.sync_to_provider !== false) {
    syncEventToGoogle(
      supabase,
      event,
      insertedAttendees as Parameters<typeof syncEventToGoogle>[2],
      'create',
    ).catch((e) => console.error('[calendar/sync]', e));
  }

  return NextResponse.json({ event }, { status: 201 });
}
