import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/calendar/booking-links?company_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('booking_links')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}

// POST /api/calendar/booking-links
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.company_id || !body?.title || !body?.slug) {
    return NextResponse.json({ error: 'company_id, title, and slug are required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('booking_links')
    .insert({
      company_id:          body.company_id,
      user_id:             user.id,
      title:               body.title,
      description:         body.description ?? null,
      slug:                body.slug,
      duration_minutes:    body.duration_minutes ?? 30,
      buffer_minutes:      body.buffer_minutes ?? 15,
      event_type:          body.event_type ?? 'consultation',
      location_type:       body.location_type ?? 'video',
      location_value:      body.location_value ?? null,
      timezone:            body.timezone ?? 'Africa/Kampala',
      booking_window_days: body.booking_window_days ?? 30,
      max_bookings_per_day: body.max_bookings_per_day ?? null,
      require_approval:    body.require_approval ?? false,
      is_active:           true,
      created_at:          now,
      updated_at:          now,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That slug is already taken. Choose a different one.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
