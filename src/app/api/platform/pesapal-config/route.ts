import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformSuperAdmin } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const { adminSupabase } = platform;
  const { data, error } = await adminSupabase
    .from('pesapal_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data || { consumer_key: '', consumer_secret: '', ipn_id: '', sandbox_mode: true } });
}

export async function POST(req: NextRequest) {
  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const { adminSupabase, context } = platform;
  const body = await req.json().catch(() => null) as {
    consumerKey?: string;
    consumerSecret?: string;
    ipnId?: string;
    sandboxMode?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('pesapal_settings')
    .upsert({
      id: 1,
      consumer_key: body.consumerKey ?? '',
      consumer_secret: body.consumerSecret ?? '',
      ipn_id: body.ipnId ?? '',
      sandbox_mode: body.sandboxMode ?? true,
      updated_at: new Date().toISOString(),
      updated_by: context.authUserId,
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Settings saved successfully', settings: data });
}
