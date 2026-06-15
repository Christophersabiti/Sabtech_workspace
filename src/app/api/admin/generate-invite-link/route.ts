export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { AdminSupabaseConfigError, createAdminSupabase } from '@/lib/platformAdmin';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { session } } = await authClient.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    email?: string;
    companyId?: string;
  } | null;
  const email = body?.email?.toLowerCase().trim();
  const companyId = body?.companyId;

  if (!email || !companyId) {
    return NextResponse.json({ error: 'email and companyId are required' }, { status: 400 });
  }

  const { data: appUser } = await authClient
    .from('app_users')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: 'Forbidden - user profile required' }, { status: 403 });
  }

  const { data: membership } = await authClient
    .from('company_users')
    .select('company_id')
    .eq('app_user_id', appUser.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .in('role_id', ['super_admin', 'admin'])
    .maybeSingle();

  if (!membership?.company_id) {
    return NextResponse.json({ error: 'Forbidden - company admin access required' }, { status: 403 });
  }

  let adminSupabase;
  try {
    adminSupabase = createAdminSupabase();
  } catch (error) {
    if (error instanceof AdminSupabaseConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }

  const { data: invitation } = await adminSupabase
    .from('invitations')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();

  if (!invitation) {
    return NextResponse.json({ error: 'No pending invitation exists for this company and email.' }, { status: 404 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback`;
  const generatedLink = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  });
  let linkData = generatedLink.data;
  const linkErr = generatedLink.error;

  if (linkErr) {
    if (linkErr.message.toLowerCase().includes('already')) {
      const { data: magicLinkData, error: magicLinkErr } = await adminSupabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo },
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
    action_link: linkData?.properties?.action_link,
  });
}
