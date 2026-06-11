import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import type { UpdateCalendarEventPayload } from '@/types/calendar';
import { syncEventToGoogle } from '@/lib/calendar/calendarSync';

// GET /api/calendar/events/[id]?company_id=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const company_id = req.nextUrl.searchParams.get('company_id');
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      *,
      project:projects(id, project_name, project_code),
      client:clients(id, name, company_name),
      attendees:calendar_event_attendees(*),
      reminders:calendar_reminders(*)
    `)
    .eq('id', id)
    .eq('company_id', company_id)
    .or(`visibility.neq.private,user_id.eq.${user.id}`)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  return NextResponse.json({ event: data });
}

// PATCH /api/calendar/events/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as UpdateCalendarEventPayload | null;
  if (!body?.company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const permissions = new PermissionService(supabase);
  try {
    await permissions.assertCompanyAccess(user.id, body.company_id);
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // Fetch existing event to check ownership / visibility
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('id, user_id, company_id, provider_event_id')
    .eq('id', id)
    .eq('company_id', body.company_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const allowed = [
    'title', 'description', 'start_at', 'end_at', 'all_day', 'timezone',
    'location', 'meet_link', 'color', 'project_id', 'task_id', 'client_id',
    'event_type', 'status', 'visibility', 'recurrence_rule',
  ] as const;

  const updates: Record<string, unknown> = { updated_by: user.id, updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = (body as Record<string, unknown>)[key];
  }

  if (updates.start_at && updates.end_at) {
    if (new Date(updates.start_at as string) >= new Date(updates.end_at as string)) {
      return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 });
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .eq('company_id', body.company_id)
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? 'Update failed' }, { status: 500 });
  }

  // Sync update to Google
  syncEventToGoogle(supabase, updated, [], 'update').catch((e) =>
    console.error('[calendar/sync update]', e),
  );

  return NextResponse.json({ event: updated });
}

// DELETE /api/calendar/events/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { company_id?: string } | null;
  if (!body?.company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const { data: existing } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .eq('company_id', body.company_id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Soft-delete by marking cancelled
  await supabase
    .from('calendar_events')
    .update({ status: 'cancelled', updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id);

  // Delete from Google Calendar
  syncEventToGoogle(supabase, existing, [], 'delete').catch((e) =>
    console.error('[calendar/sync delete]', e),
  );

  return NextResponse.json({ ok: true });
}
