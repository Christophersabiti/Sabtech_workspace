// Google Calendar two-way sync: import Google events into Sabtech calendar_events
// Uses syncToken for incremental updates after first full import.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from './calendarSync';
import { listGoogleEvents, type GoogleCalendarEventResult } from './googleCalendar';
import type { EventType, EventStatus } from '@/types/calendar';

type GoogleEventRaw = GoogleCalendarEventResult & {
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?:   { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; self?: boolean; responseStatus?: string; optional?: boolean }>;
  status?: string;
  summary?: string;
  recurrence?: string[];
  recurringEventId?: string;
};

function googleStatusToSabtech(status: string | undefined): EventStatus {
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function deriveEventType(summary: string = ''): EventType {
  const s = summary.toLowerCase();
  if (s.includes('kickoff'))   return 'kickoff';
  if (s.includes('discovery')) return 'discovery_call';
  if (s.includes('review'))    return 'review';
  if (s.includes('training'))  return 'training';
  if (s.includes('invoice') || s.includes('payment')) return 'payment_followup';
  if (s.includes('closure') || s.includes('handover')) return 'closure_meeting';
  if (s.includes('support') || s.includes('implementation')) return 'implementation_support';
  return 'meeting';
}

function rsvpStatus(resp: string | undefined): string {
  switch (resp) {
    case 'accepted':   return 'accepted';
    case 'declined':   return 'declined';
    case 'tentative':  return 'tentative';
    default:           return 'pending';
  }
}

/**
 * Import (or incrementally sync) events from Google Calendar into Sabtech.
 * Respects import_mode to decide how far back to import.
 * Stores the nextSyncToken in the connection for future incremental syncs.
 */
export async function importFromGoogle(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<{ imported: number; updated: number; deleted: number; error?: string; skipped?: boolean; reason?: string }> {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('provider', 'google')
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) return { imported: 0, updated: 0, deleted: 0, error: 'Connection not found' };
  if (!conn.sync_enabled) {
    return { imported: 0, updated: 0, deleted: 0, skipped: true, reason: 'Calendar sync is disabled' };
  }
  if (conn.sync_direction === 'outbound') {
    return { imported: 0, updated: 0, deleted: 0, skipped: true, reason: 'Inbound sync is disabled for this connection' };
  }
  if (conn.import_mode === 'none') return { imported: 0, updated: 0, deleted: 0 };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(supabase, conn);
  } catch (err) {
    return { imported: 0, updated: 0, deleted: 0, error: String(err) };
  }

  const calendarId = conn.provider_calendar_id ?? 'primary';
  let imported = 0, updated = 0, deleted = 0;

  // Build time range based on import_mode
  const listOptions: {
    timeMin?: string;
    timeMax?: string;
    syncToken?: string;
    maxResults?: number;
  } = { maxResults: 250 };

  if (conn.sync_token) {
    listOptions.syncToken = conn.sync_token;
  } else {
    if (conn.import_mode === 'from_today' || conn.import_mode === 'new_only') {
      listOptions.timeMin = new Date().toISOString();
    }
    if (conn.import_mode !== 'all') {
      // Limit to next 3 months for initial import
      const future = new Date();
      future.setMonth(future.getMonth() + 3);
      listOptions.timeMax = future.toISOString();
    }
  }

  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const result = await listGoogleEvents(accessToken, calendarId, {
      ...listOptions,
      pageToken,
    });

    nextSyncToken = result.nextSyncToken;
    pageToken = result.nextPageToken;

    for (const item of (result.items ?? []) as GoogleEventRaw[]) {
      if (!item.id) continue;

      if (item.status === 'cancelled') {
        // Soft-delete: mark matching Sabtech event as cancelled
        await supabase
          .from('calendar_events')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('provider_event_id', item.id)
          .eq('company_id', conn.company_id)
          .eq('source', 'google');
        deleted++;
        continue;
      }

      const startAt = item.start?.dateTime ?? (item.start?.date ? item.start.date + 'T00:00:00Z' : null);
      const endAt   = item.end?.dateTime   ?? (item.end?.date   ? item.end.date   + 'T00:00:00Z' : null);
      if (!startAt || !endAt) continue;

      const allDay = !item.start?.dateTime;
      const tz     = item.start?.timeZone ?? conn.timezone ?? 'UTC';

      const eventPayload = {
        company_id:           conn.company_id,
        user_id:              conn.user_id,
        title:                item.summary ?? '(No title)',
        description:          item.description ?? null,
        start_at:             startAt,
        end_at:               endAt,
        all_day:              allDay,
        timezone:             tz,
        location:             item.location ?? null,
        event_type:           deriveEventType(item.summary),
        status:               googleStatusToSabtech(item.status),
        visibility:           'team' as const,
        provider:             'google' as const,
        provider_event_id:    item.id,
        provider_calendar_id: calendarId,
        provider_sync_status: 'synced' as const,
        provider_synced_at:   new Date().toISOString(),
        source:               'google' as const,
        recurrence_rule:      item.recurrence?.[0]?.replace(/^RRULE:/, '') ?? null,
        updated_at:           new Date().toISOString(),
      };

      // Upsert by provider_event_id + company_id
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('provider_event_id', item.id)
        .eq('company_id', conn.company_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('calendar_events')
          .update(eventPayload)
          .eq('id', existing.id);
        updated++;
      } else {
        const { data: newEvent } = await supabase
          .from('calendar_events')
          .insert({ ...eventPayload, created_at: new Date().toISOString() })
          .select('id')
          .single();
        imported++;

        // Import attendees
        if (newEvent && item.attendees?.length) {
          const attendeeRows = item.attendees.map((a) => ({
            event_id:      newEvent.id,
            company_id:    conn.company_id,
            email:         a.email,
            name:          a.displayName ?? null,
            attendee_type: 'external' as const,
            is_organizer:  false,
            is_optional:   a.optional ?? false,
            rsvp_status:   rsvpStatus(a.responseStatus),
          }));
          await supabase.from('calendar_event_attendees').insert(attendeeRows);
        }
      }
    }
  } while (pageToken);

  // Store the new sync token for next incremental sync
  if (nextSyncToken) {
    await supabase
      .from('calendar_connections')
      .update({
        sync_token:  nextSyncToken,
        last_sync_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .eq('id', connectionId);
  }

  return { imported, updated, deleted };
}

/**
 * Process a Google Calendar webhook push notification.
 * Called from /api/calendar/webhook/google when resourceState is 'exists' or 'updated'.
 */
export async function processGoogleWebhook(
  supabase: SupabaseClient,
  channelId: string,
): Promise<void> {
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('webhook_channel_id', channelId)
    .eq('is_active', true)
    .maybeSingle();

  if (!conn) return;

  // Kick off incremental import (uses sync_token if available)
  await importFromGoogle(supabase, conn.id);
}
