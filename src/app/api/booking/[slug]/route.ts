import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserBusyBlocks } from '@/lib/calendar/availabilityService';

type BookingLinkRow = {
  id: string;
  company_id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  event_type: string;
  location_type: string;
  location_value: string | null;
  timezone: string;
  booking_window_days: number;
  max_bookings_per_day: number | null;
  require_approval: boolean;
  is_active: boolean;
};

// GET /api/booking/[slug]?date=YYYY-MM-DD  — returns link info + available slots for date
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: link, error } = await supabase
    .from('booking_links')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !link) return NextResponse.json({ error: 'Booking link not found' }, { status: 404 });
  const bLink = link as BookingLinkRow;

  const dateParam = req.nextUrl.searchParams.get('date');
  if (!dateParam) {
    return NextResponse.json({ link: sanitizeLink(bLink) });
  }

  // Compute available slots for the requested date
  const dayStart = new Date(`${dateParam}T00:00:00Z`);
  const dayEnd   = new Date(`${dateParam}T23:59:59Z`);

  const busyBlocks = await getUserBusyBlocks(
    supabase, bLink.user_id, bLink.company_id,
    dayStart.toISOString(), dayEnd.toISOString(),
    bLink.user_id,
  );

  // Also include already-confirmed booking_slots for this link on this date
  const { data: bookedSlots } = await supabase
    .from('booking_slots')
    .select('start_at, end_at')
    .eq('booking_link_id', bLink.id)
    .in('status', ['confirmed', 'pending_approval'])
    .gte('start_at', dayStart.toISOString())
    .lte('end_at', dayEnd.toISOString());

  const allBusy = [
    ...busyBlocks.map((b) => ({ start: b.start, end: b.end })),
    ...(bookedSlots ?? []).map((b: { start_at: string; end_at: string }) => ({
      start: b.start_at, end: b.end_at,
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  // Build working hour slots (default 9:00–17:00 if no availability settings)
  const { data: avail } = await supabase
    .from('user_availability_settings')
    .select('working_hours, buffer_before_minutes, buffer_after_minutes')
    .eq('user_id', bLink.user_id)
    .eq('company_id', bLink.company_id)
    .maybeSingle();

  const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const wh = avail?.working_hours?.[dayNames[dayStart.getDay()]] as { enabled?: boolean; start?: string; end?: string } | undefined;

  if (!wh?.enabled) {
    return NextResponse.json({ link: sanitizeLink(bLink), slots: [] });
  }

  const workStart = parseHHMM(wh.start ?? '09:00', dayStart);
  const workEnd   = parseHHMM(wh.end   ?? '17:00', dayStart);
  const dur       = bLink.duration_minutes * 60 * 1000;
  const buf       = (bLink.buffer_minutes + (avail?.buffer_after_minutes ?? 0)) * 60 * 1000;

  const slots: Array<{ start: string; end: string }> = [];
  let cursor = workStart.getTime();

  // Merge busy intervals
  const merged: Array<{ s: number; e: number }> = [];
  for (const b of allBusy) {
    const s = new Date(b.start).getTime();
    const e = new Date(b.end).getTime();
    if (merged.length && s <= merged[merged.length - 1].e) {
      merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, e);
    } else merged.push({ s, e });
  }

  for (const iv of [...merged, { s: workEnd.getTime(), e: workEnd.getTime() }]) {
    while (cursor + dur <= iv.s && cursor + dur <= workEnd.getTime()) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end:   new Date(cursor + dur).toISOString(),
      });
      cursor += dur + buf;
    }
    cursor = Math.max(cursor, iv.e);
  }

  // Check max_bookings_per_day
  if (bLink.max_bookings_per_day) {
    const { count } = await supabase
      .from('booking_slots')
      .select('*', { count: 'exact', head: true })
      .eq('booking_link_id', bLink.id)
      .in('status', ['confirmed', 'pending_approval'])
      .gte('start_at', dayStart.toISOString())
      .lte('end_at', dayEnd.toISOString());
    if ((count ?? 0) >= bLink.max_bookings_per_day) {
      return NextResponse.json({ link: sanitizeLink(bLink), slots: [] });
    }
  }

  return NextResponse.json({ link: sanitizeLink(bLink), slots: slots.slice(0, 20) });
}

// POST /api/booking/[slug] — create a booking
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase  = await createClient();

  const { data: link } = await supabase
    .from('booking_links')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: 'Booking link not found' }, { status: 404 });
  const bLink = link as BookingLinkRow;

  const body = await req.json().catch(() => null) as {
    start_at: string;
    guest_name: string;
    guest_email: string;
    guest_notes?: string;
    custom_answers?: Record<string, string>;
  } | null;

  if (!body?.start_at || !body?.guest_name || !body?.guest_email) {
    return NextResponse.json({ error: 'start_at, guest_name, and guest_email are required' }, { status: 400 });
  }

  const endAt = new Date(new Date(body.start_at).getTime() + bLink.duration_minutes * 60 * 1000).toISOString();

  // Create calendar event for the host
  const now = new Date().toISOString();
  const { data: calEvent } = await supabase
    .from('calendar_events')
    .insert({
      company_id:  bLink.company_id,
      user_id:     bLink.user_id,
      title:       `${bLink.title} — ${body.guest_name}`,
      description: body.guest_notes ?? null,
      start_at:    body.start_at,
      end_at:      endAt,
      timezone:    bLink.timezone,
      location:    bLink.location_type === 'in_person' ? (bLink.location_value ?? null) : null,
      event_type:  bLink.event_type as 'consultation',
      status:      bLink.require_approval ? 'scheduled' : 'scheduled',
      visibility:  'private' as const,
      provider:    'internal' as const,
      source:      'internal' as const,
      created_by:  bLink.user_id,
      created_at:  now,
      updated_at:  now,
    })
    .select('id')
    .single();

  // Add guest as attendee
  if (calEvent) {
    await supabase.from('calendar_event_attendees').insert({
      event_id:      calEvent.id,
      company_id:    bLink.company_id,
      email:         body.guest_email,
      name:          body.guest_name,
      attendee_type: 'external',
      is_organizer:  false,
      rsvp_status:   'accepted',
    });
  }

  // Create booking slot
  const { data: slot, error: slotErr } = await supabase
    .from('booking_slots')
    .insert({
      booking_link_id:   bLink.id,
      company_id:        bLink.company_id,
      host_user_id:      bLink.user_id,
      calendar_event_id: calEvent?.id ?? null,
      start_at:          body.start_at,
      end_at:            endAt,
      guest_name:        body.guest_name,
      guest_email:       body.guest_email,
      guest_notes:       body.guest_notes ?? null,
      custom_answers:    body.custom_answers ?? {},
      status:            bLink.require_approval ? 'pending_approval' : 'confirmed',
    })
    .select('id, cancel_token, status')
    .single();

  if (slotErr || !slot) {
    return NextResponse.json({ error: slotErr?.message ?? 'Booking failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    booking: {
      id:           slot.id,
      cancel_token: slot.cancel_token,
      status:       slot.status,
      start_at:     body.start_at,
      end_at:       endAt,
      title:        bLink.title,
      host:         bLink.user_id,
    },
  }, { status: 201 });
}

function sanitizeLink(link: BookingLinkRow) {
  const { ...safe } = link;
  delete (safe as Record<string, unknown>).user_id;
  delete (safe as Record<string, unknown>).company_id;
  return safe;
}

function parseHHMM(hhmm: string, base: Date): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}
