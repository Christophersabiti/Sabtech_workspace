import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code     = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()       { return cookieStore.getAll(); },
          setAll(list)   { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      }
    );

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && session) {
      // Ensure this user has an app_users record; create one if first login
      const { data: existing } = await supabase
        .from('app_users')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .single();

      if (!existing) {
        // Check if there's a pending invitation for this email
        const { data: invitation } = await supabase
          .from('invitations')
          .select('*')
          .eq('email', session.user.email ?? '')
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const role = invitation?.role ?? 'staff';

        await supabase.from('app_users').insert({
          auth_user_id: session.user.id,
          email: session.user.email ?? '',
          full_name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null,
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
          role,
          status: 'active',
          invited_at: invitation ? invitation.created_at : null,
          last_login_at: new Date().toISOString(),
        });

        // Mark invitation accepted
        if (invitation) {
          await supabase
            .from('invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('id', invitation.id);
        }
      } else {
        // Update last login
        await supabase
          .from('app_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('auth_user_id', session.user.id);
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
