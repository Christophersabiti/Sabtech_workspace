import { SupabaseClient, createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function createUniqueCompany(
  adminSupabase: SupabaseClient,
  name: string,
  ownerUserId: string,
) {
  const baseSlug = slugify(name) || `workspace-${Date.now()}`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await adminSupabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('companies' as any)
      .insert({
        name,
        slug,
        owner_user_id: ownerUserId,
        status: 'active',
      })
      .select('id, name, slug, status')
      .single();

    if (!error && data) return data as { id: string; name: string; slug: string; status: string };
    if (error?.code !== '23505') throw error;
  }

  throw new Error('Could not create a unique workspace slug.');
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    assertRateLimit(`workspace:create:${getRequestIdentity(req, user.id)}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many workspace creation attempts. Please wait and try again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
        },
      );
    }
    throw error;
  }

  const body = await req.json().catch(() => null) as {
    companyName?: string;
    country?: string;
    currency?: string;
    phone?: string;
    website?: string;
  } | null;

  const companyName = body?.companyName?.trim();
  if (!companyName) {
    return NextResponse.json({ error: 'Company name is required.' }, { status: 400 });
  }

  const adminSupabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let { data: appUser } = await adminSupabase
    .from('app_users')
    .select('id, email, full_name, avatar_url, role, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!appUser) {
    const { data: createdUser, error: userError } = await adminSupabase
      .from('app_users')
      .insert({
        auth_user_id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        role: 'admin',
        status: 'active',
        last_login_at: new Date().toISOString(),
      })
      .select('id, email, full_name, avatar_url, role, status')
      .single();

    if (userError || !createdUser) {
      return NextResponse.json({ error: userError?.message ?? 'Could not create user profile.' }, { status: 500 });
    }

    appUser = createdUser;
  }

  try {
    const company = await createUniqueCompany(adminSupabase, companyName, appUser.id);

    const { error: membershipError } = await adminSupabase
      .from('company_users')
      .upsert({
        company_id: company.id,
        app_user_id: appUser.id,
        auth_user_id: user.id,
        role_id: 'admin',
        status: 'active',
        joined_at: new Date().toISOString(),
      }, { onConflict: 'company_id,auth_user_id' });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    await adminSupabase
      .from('company_settings')
      .upsert({
        company_id: company.id,
        company_name: company.name,
        country: body?.country || 'Uganda',
        currency: body?.currency || 'UGX',
        phone: body?.phone?.trim() || null,
        website: body?.website?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id' });

    await adminSupabase
      .from('audit_log')
      .insert({
        company_id: company.id,
        entity_type: 'company',
        entity_id: company.id,
        action: 'workspace_created',
        performed_by: appUser.id,
        new_values: {
          name: company.name,
          slug: company.slug,
          owner_user_id: appUser.id,
        },
      });

    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create workspace.' },
      { status: 500 },
    );
  }
}
