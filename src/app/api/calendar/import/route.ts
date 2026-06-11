import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { importFromGoogle } from '@/lib/calendar/googleImport';

// POST /api/calendar/import — trigger a two-way sync import from provider
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    company_id?: string;
    provider?: string;
    connection_id?: string;
  } | null;

  if (!body?.company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  let connectionId = body.connection_id;

  if (!connectionId) {
    const provider = body.provider ?? 'google';
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('id')
      .eq('company_id', body.company_id)
      .eq('user_id', user.id)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (!conn) return NextResponse.json({ error: 'No active connection found' }, { status: 404 });
    connectionId = conn.id as string;
  }

  const result = await importFromGoogle(supabase, connectionId);
  return NextResponse.json({ ok: true, ...result });
}
