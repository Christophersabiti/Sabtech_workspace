import { NextRequest, NextResponse } from 'next/server';
import { normalizeReason, requirePlatformSuperAdmin } from '@/lib/platformAdmin';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const { context, adminSupabase } = platform;

  try {
    assertRateLimit(`platform:impersonate:start:${getRequestIdentity(req, context.authUserId)}`, {
      limit: 12,
      windowMs: 10 * 60 * 1000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many impersonation attempts. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const body = await req.json().catch(() => null) as {
    companyId?: string;
    reason?: string;
  } | null;

  const companyId = body?.companyId;
  const reason = normalizeReason(body?.reason);

  if (!companyId) {
    return NextResponse.json({ error: 'Company is required.' }, { status: 400 });
  }
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Enter a clear reason with at least 10 characters.' }, { status: 400 });
  }

  const { data: company } = await adminSupabase
    .from('companies')
    .select('id, name, slug, status')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  const { data: existingMembership } = await adminSupabase
    .from('company_users')
    .select('id')
    .eq('company_id', company.id)
    .eq('auth_user_id', context.authUserId)
    .maybeSingle();

  let createdMembership = false;
  if (!existingMembership) {
    const { error: membershipError } = await adminSupabase
      .from('company_users')
      .insert({
        company_id: company.id,
        app_user_id: context.appUserId,
        auth_user_id: context.authUserId,
        role_id: 'admin',
        status: 'active',
        joined_at: new Date().toISOString(),
      });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
    createdMembership = true;
  }

  const { data: session, error: sessionError } = await adminSupabase
    .from('platform_impersonation_sessions')
    .insert({
      super_admin_app_user_id: context.appUserId,
      super_admin_auth_user_id: context.authUserId,
      company_id: company.id,
      reason,
      created_membership: createdMembership,
    })
    .select('id, company_id, reason, started_at')
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? 'Could not start impersonation.' }, { status: 500 });
  }

  await adminSupabase.from('audit_log').insert({
    company_id: company.id,
    entity_type: 'company',
    entity_id: company.id,
    action: 'impersonation_started',
    performed_by: context.appUserId,
    new_values: {
      reason,
      session_id: session.id,
      super_admin_email: context.email,
      created_membership: createdMembership,
    },
  });

  return NextResponse.json({ company, session });
}
