import { SupabaseClient, createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type PlatformAdminContext = {
  authUserId: string;
  appUserId: string;
  email: string;
};

export function createAdminSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function requirePlatformSuperAdmin(): Promise<
  | { ok: true; context: PlatformAdminContext; adminSupabase: SupabaseClient }
  | { ok: false; status: 401 | 403; error: string }
> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data: { session } } = await authClient.auth.getSession();
  if (!session) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const adminSupabase = createAdminSupabase();
  const { data: appUser } = await adminSupabase
    .from('app_users')
    .select('id, email, role, status')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (!appUser || appUser.role !== 'super_admin' || appUser.status !== 'active') {
    return { ok: false, status: 403, error: 'Platform Super Admin access required.' };
  }

  return {
    ok: true,
    adminSupabase,
    context: {
      authUserId: session.user.id,
      appUserId: appUser.id as string,
      email: (appUser.email as string | null) ?? session.user.email ?? '',
    },
  };
}

export function normalizeReason(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}
