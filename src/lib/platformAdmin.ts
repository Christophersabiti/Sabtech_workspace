import { SupabaseClient, createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type PlatformAdminContext = {
  authUserId: string;
  appUserId: string;
  email: string;
};

export class AdminSupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminSupabaseConfigError';
  }
}

function getJwtRole(key: string): string | null {
  const [, payload] = key.split('.');
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

export function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new AdminSupabaseConfigError('Missing NEXT_PUBLIC_SUPABASE_URL in the server environment.');
  }

  if (!serviceRoleKey) {
    throw new AdminSupabaseConfigError(
      'Missing SUPABASE_SERVICE_ROLE_KEY in the server environment.',
    );
  }

  if (anonKey && serviceRoleKey === anonKey) {
    throw new AdminSupabaseConfigError(
      'SUPABASE_SERVICE_ROLE_KEY is set to the anon key. Use the Supabase service_role key and redeploy.',
    );
  }

  const role = getJwtRole(serviceRoleKey);
  if (role && role !== 'service_role') {
    throw new AdminSupabaseConfigError(
      'SUPABASE_SERVICE_ROLE_KEY is not a service_role key. Update the server environment and redeploy.',
    );
  }

  return createSupabaseClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
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
