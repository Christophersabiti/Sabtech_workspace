export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  // Verify caller is authenticated admin
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()     { return cookieStore.getAll(); },
        setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { session } } = await authClient.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check role
  const { data: appUser } = await authClient
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single();

  if (!appUser || !['super_admin', 'admin'].includes(appUser.role)) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { email } = body as { email: string };

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  // Service role client for admin operations
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback`;
  
  // Generate the Magic Link / Invite Link without sending the email via Supabase default
  let { data: linkData, error: linkErr } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email: email.toLowerCase().trim(),
    options: {
      redirectTo
    }
  });

  // If the user already exists in auth.users (because an email invite was run or they signed up before),
  // generating an invite link throws "already registered". We fallback to generating a regular magic link 
  // which behaves the exact same way for getting them logged in to accept their backend invitation.
  if (linkErr) {
    if (linkErr.message.toLowerCase().includes('already')) {
      const { data: magicLinkData, error: magicLinkErr } = await adminSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email.toLowerCase().trim(),
        options: { redirectTo }
      });
      
      if (magicLinkErr) {
        return NextResponse.json({ error: magicLinkErr.message }, { status: 500 });
      }
      linkData = magicLinkData;
    } else {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ 
    success: true, 
    action_link: linkData?.properties?.action_link 
  });
}
