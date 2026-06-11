import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildGoogleAuthUrl } from '@/lib/calendar/googleCalendar';
import { randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const company_id = req.nextUrl.searchParams.get('company_id');
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google Calendar integration is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment.' },
      { status: 503 },
    );
  }

  // state encodes company_id + csrf token
  const csrf = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ company_id, csrf, user_id: user.id })).toString('base64url');

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/auth/calendar/google/callback`;

  const authUrl = buildGoogleAuthUrl(state, redirectUri);
  return NextResponse.redirect(authUrl);
}
