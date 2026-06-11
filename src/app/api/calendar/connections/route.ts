import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/calendar/connections?company_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const company_id = req.nextUrl.searchParams.get('company_id');
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('calendar_connections')
    .select(
      'id, provider, provider_account_email, provider_calendar_id, sync_enabled, sync_direction, import_mode, last_sync_at, is_active, created_at',
    )
    .eq('company_id', company_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data });
}
