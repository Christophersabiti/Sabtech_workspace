import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildMicrosoftAuthUrl } from '@/lib/calendar/microsoftCalendar';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const company_id = req.nextUrl.searchParams.get('company_id');
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Microsoft Calendar integration is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.' },
      { status: 503 },
    );
  }

  const csrf  = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ company_id, csrf, user_id: user.id })).toString('base64url');
  const redirectUri = `${req.nextUrl.origin}/auth/calendar/microsoft/callback`;

  return NextResponse.redirect(buildMicrosoftAuthUrl(state, redirectUri));
}
