import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PermissionService } from '@/lib/permissionService';

type EntityAccessResult =
  | { ok: true; companyId: string }
  | { ok: false; status: 401 | 403 | 404; message: string };

export async function requireTenantEntityAccess(
  table: string,
  id: string,
  idColumn = 'id',
): Promise<EntityAccessResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, status: 401, message: 'Unauthorized - please log in to view this document' };
  }

  const { data, error } = await supabase
    // The table name is intentionally dynamic so document routes can reuse this guard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)
    .select('company_id')
    .eq(idColumn, id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 403, message: 'You do not have access to this document' };
  }

  if (!data?.company_id) {
    return { ok: false, status: 404, message: 'Document not found' };
  }

  try {
    await new PermissionService(supabase).assertCompanyAccess(session.user.id, data.company_id as string);
  } catch {
    return { ok: false, status: 403, message: 'You do not have access to this document' };
  }

  return { ok: true, companyId: data.company_id as string };
}
