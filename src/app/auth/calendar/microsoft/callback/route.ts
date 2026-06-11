import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeMicrosoftCode, getMicrosoftUserEmail } from '@/lib/calendar/microsoftCalendar';
import { encryptToken } from '@/lib/calendar/tokenEncryption';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.nextUrl.origin));

  const settingsUrl = new URL('/settings/calendar', req.nextUrl.origin);
  const code      = req.nextUrl.searchParams.get('code');
  const stateRaw  = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  if (errorParam) {
    settingsUrl.searchParams.set('error', errorParam === 'access_denied' ? 'access_denied' : 'oauth_error');
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !stateRaw) {
    settingsUrl.searchParams.set('error', 'missing_params');
    return NextResponse.redirect(settingsUrl);
  }

  let state: { company_id: string; user_id: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
  } catch {
    settingsUrl.searchParams.set('error', 'invalid_state');
    return NextResponse.redirect(settingsUrl);
  }

  if (state.user_id !== user.id) {
    settingsUrl.searchParams.set('error', 'user_mismatch');
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${req.nextUrl.origin}/auth/calendar/microsoft/callback`;

  try {
    const tokens = await exchangeMicrosoftCode(code, redirectUri);
    const email  = await getMicrosoftUserEmail(tokens.access_token);

    await supabase.from('calendar_connections').upsert(
      {
        company_id:             state.company_id,
        user_id:                user.id,
        provider:               'microsoft',
        provider_account_email: email,
        provider_calendar_id:   'primary',
        access_token_encrypted: encryptToken(tokens.access_token),
        ...(tokens.refresh_token ? { refresh_token_encrypted: encryptToken(tokens.refresh_token) } : {}),
        token_expires_at:       new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        sync_enabled:           true,
        sync_direction:         'outbound',
        import_mode:            'new_only',
        is_active:              true,
        updated_at:             new Date().toISOString(),
      },
      { onConflict: 'company_id,user_id,provider' },
    );

    settingsUrl.searchParams.set('connected', 'microsoft');
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error('[calendar/microsoft/callback]', err);
    settingsUrl.searchParams.set('error', 'token_exchange_failed');
    return NextResponse.redirect(settingsUrl);
  }
}
