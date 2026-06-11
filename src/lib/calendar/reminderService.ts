// Reminder processor — evaluates due reminders and dispatches them.
// Designed to be called from a scheduled job or API route (e.g. every 5 minutes via Vercel cron).
// Email: uses Resend (RESEND_API_KEY). WhatsApp: stub, ready for Twilio/Waba wiring.

import type { SupabaseClient } from '@supabase/supabase-js';

type DueReminder = {
  id: string;
  method: 'email' | 'in_app' | 'whatsapp';
  event_id: string;
  user_id: string;
  company_id: string;
  minutes_before: number;
  event: {
    title: string;
    start_at: string;
    meet_link: string | null;
    location: string | null;
  };
  user: { email: string; full_name: string | null };
};

/**
 * Find reminders due within the next `windowMinutes` minutes that haven't been sent.
 */
export async function processDueReminders(
  supabase: SupabaseClient,
  windowMinutes = 2,
): Promise<{ sent: number; errors: number }> {
  const now     = new Date();
  const horizon = new Date(now.getTime() + windowMinutes * 60 * 1000).toISOString();

  // Fetch reminders where the reminder fire time is ≤ horizon
  const { data: reminders } = await supabase
    .from('calendar_reminders')
    .select(`
      id, method, event_id, user_id, company_id, minutes_before,
      event:calendar_events(title, start_at, meet_link, location),
      user:app_users!inner(email, full_name)
    `)
    .eq('is_sent', false)
    .order('id');

  let sent = 0, errors = 0;

  for (const r of (reminders ?? []) as unknown as DueReminder[]) {
    const fireAt = new Date(new Date(r.event.start_at).getTime() - r.minutes_before * 60 * 1000);
    if (fireAt > new Date(horizon)) continue; // not due yet

    try {
      if (r.method === 'email') {
        await sendEmailReminder(r.user.email, r.user.full_name, r.event);
      } else if (r.method === 'in_app') {
        await sendInAppReminder(supabase, r.user_id, r.company_id, r.event_id, r.event);
      } else if (r.method === 'whatsapp') {
        await sendWhatsAppReminderStub(r.user.email, r.event);
      }

      await supabase
        .from('calendar_reminders')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq('id', r.id);
      sent++;
    } catch (err) {
      console.error('[reminderService] failed to send reminder', r.id, err);
      errors++;
    }
  }

  return { sent, errors };
}

async function sendEmailReminder(
  email: string,
  name: string | null,
  event: { title: string; start_at: string; meet_link: string | null; location: string | null },
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn('[reminderService] RESEND_API_KEY not set — skipping email reminder');
    return;
  }

  const start = new Date(event.start_at).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const bodyText = [
    `Hi ${name ?? 'there'},`,
    '',
    `Reminder: "${event.title}" starts at ${start}.`,
    event.meet_link   ? `Join: ${event.meet_link}` : '',
    event.location    ? `Location: ${event.location}` : '',
    '',
    '— Sabtech Workspace',
  ].filter((l) => l !== undefined).join('\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Sabtech Workspace <noreply@sabtechonline.com>',
      to:      [email],
      subject: `Reminder: ${event.title}`,
      text:    bodyText,
    }),
  });
}

async function sendInAppReminder(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  eventId: string,
  event: { title: string; start_at: string },
): Promise<void> {
  const start = new Date(event.start_at).toLocaleString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  // Insert into a generic notifications table if it exists; otherwise log.
  const { error } = await supabase.from('notifications' as never).insert({
    user_id:    userId,
    company_id: companyId,
    type:       'calendar_reminder',
    title:      `Upcoming: ${event.title}`,
    body:       `Your event starts at ${start}.`,
    entity_id:  eventId,
    entity_type: 'calendar_event',
    is_read:    false,
    created_at: new Date().toISOString(),
  });
  // Silently ignore if notifications table doesn't exist yet
  if (error && !error.message.includes('does not exist')) {
    throw error;
  }
}

async function sendWhatsAppReminderStub(
  phone: string,
  event: { title: string; start_at: string },
): Promise<void> {
  // Stub: log the message. Wire Twilio / WABA here in Phase 3 production.
  console.info('[whatsapp-reminder stub]', { phone, event: event.title, start: event.start_at });
  // Future: POST to Twilio Messages API or WABA Cloud API
}
