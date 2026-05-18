export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userEmail = session.user.email ?? '';

  // Find pending invitation for this email
  const { data: invitation } = await adminSupabase
    .from('invitations')
    .select('*')
    .eq('email', userEmail.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: 'No valid invitation found for this email' }, { status: 404 });
  }

  // Create or update app_users record
  const { data: existing } = await adminSupabase
    .from('app_users')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .single();

  if (!existing) {
    await adminSupabase.from('app_users').insert({
      auth_user_id: session.user.id,
      email: userEmail,
      full_name: session.user.user_metadata?.full_name ?? null,
      avatar_url: session.user.user_metadata?.avatar_url ?? null,
      role: invitation.role,
      status: 'active',
      invited_by: invitation.invited_by,
      invited_at: invitation.created_at,
      last_login_at: new Date().toISOString(),
    });
  } else {
    // Update role from invitation
    await adminSupabase
      .from('app_users')
      .update({ role: invitation.role, status: 'active', last_login_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  // Mark invitation accepted
  await adminSupabase
    .from('invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  return NextResponse.json({ success: true, role: invitation.role });
}
