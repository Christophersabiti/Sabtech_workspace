import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncEventToGoogle } from '@/lib/calendar/calendarSync';
import { importFromGoogle } from '@/lib/calendar/googleImport';

// POST /api/calendar/sync - push pending workspace events and pull Google changes when enabled.
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
  let skipped = 0;

  for (const event of events ?? []) {
    const operation = event.provider_event_id ? 'update' : 'create';
    const result = await syncEventToGoogle(supabase, event, event.attendees ?? [], operation);
    if (result.status === 'success') {
      synced++;
    } else if (result.status === 'error') {
      failed++;
    } else {
      skipped++;
    }
  }

  let imported = 0;
  let updated = 0;
  let deleted = 0;
  let importError: string | undefined;

  if (!body.event_id) {
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('id, sync_enabled, sync_direction, import_mode')
      .eq('company_id', body.company_id)
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle();

    if (
      conn?.sync_enabled &&
      conn.sync_direction !== 'outbound' &&
      conn.import_mode !== 'none'
    ) {
      const importResult = await importFromGoogle(supabase, conn.id as string);
      imported = importResult.imported;
      updated = importResult.updated;
      deleted = importResult.deleted;
      importError = importResult.error;
      if (importError) failed++;
    }
  }

  // Update last_sync_at on connection
  await supabase
    .from('calendar_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('company_id', body.company_id)
    .eq('user_id', user.id)
    .eq('provider', 'google');

  return NextResponse.json({
    ok: true,
    synced,
    failed,
    skipped,
    imported,
    updated,
    deleted,
    importError,
  });
}
