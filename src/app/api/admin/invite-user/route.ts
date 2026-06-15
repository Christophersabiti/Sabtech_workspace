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
    role?: string;
    companyId?: string;
    permission_overrides?: Record<string, boolean>;
  } | null;

  const email = body?.email?.toLowerCase().trim();
  const role = body?.role;
  const companyId = body?.companyId;

  if (!email || !role || !companyId) {
    return NextResponse.json({ error: 'email, role, and companyId are required' }, { status: 400 });
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
    .select('company_id, role_id')
    .eq('app_user_id', appUser.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .in('role_id', ['super_admin', 'admin'])
    .maybeSingle();

  if (!membership?.company_id) {
    return NextResponse.json({ error: 'Forbidden - company admin access required' }, { status: 403 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  const validRoles = ['admin', 'finance', 'project_manager', 'staff', 'client'];
  if (membership.role_id === 'super_admin') validRoles.unshift('super_admin');
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 });
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

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invitation, error: invErr } = await adminSupabase
    .from('invitations')
    .insert({
      company_id: companyId,
      email,
      role,
      invited_by: appUser.id,
      permission_overrides: body?.permission_overrides ?? null,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select()
    .single();

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback`;
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(
    email,
    { redirectTo },
  );

  if (inviteErr && !inviteErr.message.includes('already')) {
    console.error('Supabase invite error:', inviteErr.message);
  }

  return NextResponse.json({ success: true, invitation });
}
