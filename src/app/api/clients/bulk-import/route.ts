import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';

type ClientInput = {
  name:           string;
  company_name:   string | null;
  contact_person: string | null;
  email:          string | null;
  phone:          string | null;
  city:           string | null;
  country:        string | null;
  currency:       string;
  notes:          string | null;
};

type BulkImportBody = {
  company_id: string;
  clients:    ClientInput[];
};

async function nextClientCode(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, count: number): Promise<string[]> {
  const year   = new Date().getFullYear();
  const prefix = `CLT-${year}-`;
  const { data: latest } = await supabase
    .from('clients')
    .select('client_code')
    .eq('company_id', companyId)
    .like('client_code', `${prefix}%`)
    .order('client_code', { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (latest && latest.length > 0) {
    const parsed = parseInt(latest[0].client_code.replace(prefix, ''), 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }

  return Array.from({ length: count }, (_, i) => `${prefix}${String(nextNum + i).padStart(4, '0')}`);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as BulkImportBody | null;
  if (!body?.company_id || !Array.isArray(body?.clients)) {
    return NextResponse.json({ error: 'company_id and clients array are required.' }, { status: 400 });
  }

  if (body.clients.length === 0) {
    return NextResponse.json({ error: 'No clients to import.' }, { status: 400 });
  }

  if (body.clients.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 clients per import.' }, { status: 400 });
  }

  // Rate limit: 5 bulk imports per 10 min per user
  try {
    assertRateLimit(`clients:bulk-import:${getRequestIdentity(req, user.id)}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many import attempts. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const permissions = new PermissionService(supabase);

  try {
    await permissions.assertPermission(user.id, body.company_id, 'clients', 'create');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const codes = await nextClientCode(supabase, body.company_id, body.clients.length);

  const rows = body.clients.map((c, i) => ({
    company_id:     body.company_id,
    client_code:    codes[i],
    name:           c.name.trim(),
    company_name:   c.company_name?.trim()   || null,
    contact_person: c.contact_person?.trim() || null,
    email:          c.email?.trim()          || null,
    phone:          c.phone?.trim()          || null,
    city:           c.city?.trim()           || null,
    country:        c.country?.trim()        || null,
    currency:       c.currency?.trim()       || 'UGX',
    notes:          c.notes?.trim()          || null,
    status:         'active',
    is_archived:    false,
  }));

  const { data: inserted, error } = await supabase
    .from('clients')
    .insert(rows)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported: inserted?.length ?? rows.length });
}
