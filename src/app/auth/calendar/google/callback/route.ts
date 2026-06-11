import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exchangeGoogleCode, getGoogleUserEmail } from '@/lib/calendar/googleCalendar';
import { encryptToken } from '@/lib/calendar/tokenEncryption';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.nextUrl.origin));

  const code = req.nextUrl.searchParams.get('code');
  const stateRaw = req.nextUrl.searchParams.get('state');
  const errorParam = req.nextUrl.searchParams.get('error');

  const settingsUrl = new URL('/settings/calendar', req.nextUrl.origin);

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

  const redirectUri = `${req.nextUrl.origin}/auth/calendar/google/callback`;

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri);

    const accessTokenEnc = encryptToken(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const email = await getGoogleUserEmail(tokens.access_token);

    const { error: upsertErr } = await supabase
      .from('calendar_connections')
      .upsert(
        {
          company_id:             state.company_id,
          user_id:                user.id,
          provider:               'google',
          provider_account_email: email,
          provider_calendar_id:   'primary',
          access_token_encrypted: accessTokenEnc,
          ...(refreshTokenEnc ? { refresh_token_encrypted: refreshTokenEnc } : {}),
          token_expires_at:       expiresAt,
          sync_enabled:           true,
          sync_direction:         'outbound',
          import_mode:            'new_only',
          is_active:              true,
          updated_at:             new Date().toISOString(),
        },
        { onConflict: 'company_id,user_id,provider' },
      );

    if (upsertErr) {
      settingsUrl.searchParams.set('error', 'db_error');
      return NextResponse.redirect(settingsUrl);
    }

    settingsUrl.searchParams.set('connected', 'google');
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error('[calendar/google/callback]', err);
    settingsUrl.searchParams.set('error', 'token_exchange_failed');
    return NextResponse.redirect(settingsUrl);
  }
}
