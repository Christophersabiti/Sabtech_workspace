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
  const { email, role, permission_overrides } = body as {
    email: string;
    role: string;
    permission_overrides?: Record<string, boolean>;
  };

  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Validate role is one of the defined system roles — prevents arbitrary role injection
  const VALID_ROLES = ['super_admin', 'admin', 'finance', 'project_manager', 'staff', 'client'];
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  // Only super_admin can assign super_admin or admin roles
  if (['super_admin', 'admin'].includes(role) && appUser.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admins can assign admin-level roles' }, { status: 403 });
  }

  // Service role client for admin operations
  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Insert invitation record
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invitation, error: invErr } = await adminSupabase
    .from('invitations')
    .insert({
      email: email.toLowerCase().trim(),
      role,
      invited_by: appUser.id,
      permission_overrides: permission_overrides ?? null,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select()
    .single();

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  // Send invite email via Supabase Auth admin API
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback`;
  const { error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(
    email.toLowerCase().trim(),
    { redirectTo }
  );

  // If user already exists (inviteErr with code), that's okay — they can still log in
  if (inviteErr && !inviteErr.message.includes('already')) {
    // Non-critical: invitation record created; email just may not have sent
    console.error('Supabase invite error:', inviteErr.message);
  }

  return NextResponse.json({ success: true, invitation });
}
