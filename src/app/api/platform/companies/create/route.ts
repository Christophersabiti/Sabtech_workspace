import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformSuperAdmin } from '@/lib/platformAdmin';
import { assertRateLimit, getRequestIdentity, RateLimitError } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const PLANS = ['starter', 'growth', 'pro', 'enterprise'];
const STATUSES = ['active', 'suspended', 'archived'];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    assertRateLimit(`platform-company-create:${getRequestIdentity(req)}`, { limit: 20, windowMs: 60_000 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many company creation attempts. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const body = await req.json().catch(() => null) as {
    companyName?: string;
    slug?: string;
    companyEmail?: string;
    plan?: string;
    status?: string;
    domain?: string;
    primaryContactName?: string;
    adminFullName?: string;
    adminEmail?: string;
    adminRole?: string;
  } | null;

  const companyName = body?.companyName?.trim() ?? '';
  const slug = slugify(body?.slug || companyName);
  const companyEmail = body?.companyEmail?.trim().toLowerCase() ?? '';
  const plan = body?.plan && PLANS.includes(body.plan) ? body.plan : 'starter';
  const status = body?.status && STATUSES.includes(body.status) ? body.status : 'active';
  const domain = body?.domain?.trim().toLowerCase() || null;
  const primaryContactName = body?.primaryContactName?.trim() || body?.adminFullName?.trim() || null;
  const adminFullName = body?.adminFullName?.trim() ?? '';
  const adminEmail = body?.adminEmail?.trim().toLowerCase() ?? '';
  const adminRole = body?.adminRole === 'finance' ? 'finance' : 'admin';

  if (!companyName || !slug || !companyEmail || !adminFullName || !adminEmail) {
    return NextResponse.json(
      { error: 'Company name, slug, company email, admin name, and admin email are required.' },
      { status: 400 },
    );
  }

  if (!isEmail(companyEmail) || !isEmail(adminEmail)) {
    return NextResponse.json({ error: 'Enter valid company and admin email addresses.' }, { status: 400 });
  }

  const { adminSupabase, context } = platform;
  const { data: existingSlug } = await adminSupabase
    .from('companies')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingSlug) {
    return NextResponse.json({ error: 'A company with this slug already exists.' }, { status: 409 });
  }

  const { data: company, error: companyError } = await adminSupabase
    .from('companies')
    .insert({
      name: companyName,
      slug,
      email: companyEmail,
      plan,
      status,
      domain,
      primary_contact_name: primaryContactName,
      primary_contact_email: adminEmail,
      last_activity_at: new Date().toISOString(),
    })
    .select('id, name, slug, status, email, plan, domain, created_at')
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: companyError?.message ?? 'Could not create company.' }, { status: 500 });
  }

  await adminSupabase
    .from('company_settings')
    .insert({
      company_id: company.id,
      company_name: companyName,
      email: companyEmail,
      website: domain,
      currency: 'UGX',
    });

  const { data: categories } = await adminSupabase
    .from('expense_categories')
    .insert([
      'Purchases',
      'Subscriptions',
      'Utilities',
      'Salaries',
      'Transport',
      'Maintenance',
      'Internet',
      'Marketing',
      'Tax',
      'Miscellaneous',
    ].map((name) => ({ company_id: company.id, name, is_system: true })))
    .select('id');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invitation, error: inviteError } = await adminSupabase
    .from('invitations')
    .insert({
      company_id: company.id,
      email: adminEmail,
      full_name: adminFullName,
      role: adminRole,
      status: 'pending',
      invited_by: context.appUserId,
      expires_at: expiresAt,
    })
    .select('id, email, role, status, expires_at')
    .single();

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin}/auth/callback`;
  const { error: authInviteError } = await adminSupabase.auth.admin.inviteUserByEmail(
    adminEmail,
    {
      redirectTo,
      data: { full_name: adminFullName, company_id: company.id, role: adminRole },
    },
  );

  if (authInviteError && !authInviteError.message.toLowerCase().includes('already')) {
    console.error('Supabase company admin invite error:', authInviteError.message);
  }

  await adminSupabase.from('audit_log').insert({
    company_id: company.id,
    entity_type: 'company',
    entity_id: company.id,
    action: 'platform_company_created',
    performed_by: context.email,
    new_values: {
      companyName,
      slug,
      plan,
      status,
      adminEmail,
      seededExpenseCategories: categories?.length ?? 0,
    },
  });

  return NextResponse.json({
    success: true,
    company,
    invitation,
    inviteWarning: authInviteError?.message ?? null,
  });
}
