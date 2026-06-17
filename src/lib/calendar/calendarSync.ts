// Calendar sync service: pushes Sabtech events to external providers.
// Phase 1: Google Calendar outbound sync.

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken, encryptToken } from './tokenEncryption';
import {
  refreshGoogleAccessToken,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  GoogleCalendarEventInput,
} from './googleCalendar';
import type { CalendarEvent, CalendarEventAttendee } from '@/types/calendar';

type Connection = {
  id: string;
  user_id: string;
  company_id: string;
  provider: string;
  provider_calendar_id: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  sync_enabled: boolean;
  sync_direction: string;
};

export type GoogleEventSyncResult = {
  status: 'success' | 'error' | 'skipped';
  providerEventId?: string;
  error?: string;
  reason?: string;
};

/**
 * Returns a valid (possibly refreshed) access token for a connection.
 * Updates the stored token in DB if refreshed.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  conn: Connection,
): Promise<string> {
  const accessToken = decryptToken(conn.access_token_encrypted);
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const bufferMs = 5 * 60 * 1000; // refresh 5 min early

  if (expiresAt && Date.now() < expiresAt.getTime() - bufferMs) {
    return accessToken;
  }

  if (!conn.refresh_token_encrypted) {
    throw new Error('No refresh token available; user must reconnect their calendar');
  }

  const refreshToken = decryptToken(conn.refresh_token_encrypted);
  const refreshed = await refreshGoogleAccessToken(refreshToken);

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from('calendar_connections')
    .update({
      access_token_encrypted: encryptToken(refreshed.access_token),
      token_expires_at:       newExpiry,
      updated_at:             new Date().toISOString(),
    })
    .eq('id', conn.id);

  return refreshed.access_token;
}

function buildGoogleEventBody(
  event: CalendarEvent,
  attendees: CalendarEventAttendee[],
): GoogleCalendarEventInput {
  const body: GoogleCalendarEventInput = {
    summary:     event.title,
    description: event.description ?? undefined,
    location:    event.location ?? undefined,
    start: event.all_day
      ? { date: event.start_at.substring(0, 10) }
      : { dateTime: event.start_at, timeZone: event.timezone },
    end: event.all_day
      ? { date: event.end_at.substring(0, 10) }
      : { dateTime: event.end_at, timeZone: event.timezone },
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
    visibility:
      event.visibility === 'private'
        ? 'private'
        : event.visibility === 'company'
        ? 'public'
        : 'default',
  };

  if (attendees.length > 0) {
    body.attendees = attendees.map((a) => ({
      email:       a.email,
      displayName: a.name ?? undefined,
      optional:    a.is_optional,
    }));
  }

  if (event.recurrence_rule) {
    body.recurrence = [`RRULE:${event.recurrence_rule}`];
  }

  return body;
}

async function logSync(
  supabase: SupabaseClient,
  entry: {
    company_id: string;
    user_id: string;
    connection_id: string | null;
    event_id: string | null;
    provider: string;
    operation: string;
    status: 'success' | 'error' | 'skipped';
    provider_event_id?: string;
    error_message?: string;
  },
) {
  await supabase.from('calendar_sync_logs').insert(entry).then(() => undefined);
}

/**
 * Push a Sabtech calendar event to the user's connected Google Calendar.
 * operation: 'create' | 'update' | 'delete'
 */
export async function syncEventToGoogle(
  supabase: SupabaseClient,
  event: CalendarEvent,
  attendees: CalendarEventAttendee[],
  operation: 'create' | 'update' | 'delete',
): Promise<GoogleEventSyncResult> {
  const { data: conn, error: connErr } = await supabase
    .from('calendar_connections')
    .select(
      'id, user_id, company_id, provider, provider_calendar_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, sync_enabled, sync_direction',
    )
    .eq('user_id', event.user_id)
    .eq('company_id', event.company_id)
    .eq('provider', 'google')
    .eq('is_active', true)
    .eq('sync_enabled', true)
    .maybeSingle();

  if (connErr) {
    const msg = connErr.message;
    await supabase
      .from('calendar_events')
      .update({ provider_sync_status: 'error' })
      .eq('id', event.id);
    return { status: 'error', error: msg };
  }

  if (!conn) {
    return { status: 'skipped', reason: 'No active Google Calendar connection' };
  }

  if (conn.sync_direction === 'inbound') {
    return { status: 'skipped', reason: 'Outbound sync is disabled for this connection' };
  }

  const calendarId = conn.provider_calendar_id ?? 'primary';
  const effectiveOperation =
    operation === 'update' && !event.provider_event_id ? 'create' : operation;

  try {
    const accessToken = await getValidAccessToken(supabase, conn as Connection);
    let providerEventId: string | undefined;

    if (effectiveOperation === 'create') {
      const body = buildGoogleEventBody(event, attendees);
      const result = await createGoogleEvent(accessToken, calendarId, body, false);
      providerEventId = result.id;

      await supabase
        .from('calendar_events')
        .update({
          provider_event_id:    result.id,
          provider_calendar_id: calendarId,
          provider_sync_status: 'synced',
          provider_synced_at:   new Date().toISOString(),
          meet_link:            result.hangoutLink ?? event.meet_link,
        })
        .eq('id', event.id);
    } else if (effectiveOperation === 'update' && event.provider_event_id) {
      const body = buildGoogleEventBody(event, attendees);
      await updateGoogleEvent(accessToken, calendarId, event.provider_event_id, body);
      providerEventId = event.provider_event_id;

      await supabase
        .from('calendar_events')
        .update({
          provider_sync_status: 'synced',
          provider_synced_at:   new Date().toISOString(),
        })
        .eq('id', event.id);
    } else if (effectiveOperation === 'delete' && event.provider_event_id) {
      await deleteGoogleEvent(accessToken, calendarId, event.provider_event_id);
      providerEventId = event.provider_event_id;
    } else {
      return { status: 'skipped', reason: 'No Google event id to sync' };
    }

    await logSync(supabase, {
      company_id:        event.company_id,
      user_id:           event.user_id,
      connection_id:     conn.id,
      event_id:          event.id,
      provider:          'google',
      operation:         effectiveOperation,
      status:            'success',
      provider_event_id: providerEventId,
    });

    return { status: 'success', providerEventId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await supabase
      .from('calendar_events')
      .update({ provider_sync_status: 'error' })
      .eq('id', event.id);

    await logSync(supabase, {
      company_id:    event.company_id,
      user_id:       event.user_id,
      connection_id: conn.id,
      event_id:      event.id,
      provider:      'google',
      operation:     effectiveOperation,
      status:        'error',
      error_message: msg,
    });

    return { status: 'error', error: msg };
  }
}
