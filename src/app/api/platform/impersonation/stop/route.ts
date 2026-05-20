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
    assertRateLimit(`platform:impersonate:stop:${getRequestIdentity(req, context.authUserId)}`, {
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many impersonation updates. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const body = await req.json().catch(() => null) as {
    sessionId?: string;
    companyId?: string;
    reason?: string;
  } | null;

  const reason = normalizeReason(body?.reason);
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Enter a stop reason with at least 10 characters.' }, { status: 400 });
  }

  let query = adminSupabase
    .from('platform_impersonation_sessions')
    .select('id, company_id, created_membership')
    .eq('super_admin_auth_user_id', context.authUserId)
    .is('stopped_at', null)
    .order('started_at', { ascending: false })
    .limit(1);

  if (body?.sessionId) {
    query = query.eq('id', body.sessionId);
  } else if (body?.companyId) {
    query = query.eq('company_id', body.companyId);
  }

  const { data: session } = await query.maybeSingle();
  if (!session) {
    return NextResponse.json({ error: 'No active impersonation session found.' }, { status: 404 });
  }

  const stoppedAt = new Date().toISOString();
  const { error: updateError } = await adminSupabase
    .from('platform_impersonation_sessions')
    .update({ stop_reason: reason, stopped_at: stoppedAt })
    .eq('id', session.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (session.created_membership) {
    await adminSupabase
      .from('company_users')
      .delete()
      .eq('company_id', session.company_id)
      .eq('auth_user_id', context.authUserId)
      .eq('app_user_id', context.appUserId);
  }

  await adminSupabase.from('audit_log').insert({
    company_id: session.company_id,
    entity_type: 'company',
    entity_id: session.company_id,
    action: 'impersonation_stopped',
    performed_by: context.appUserId,
    new_values: {
      reason,
      session_id: session.id,
      super_admin_email: context.email,
      stopped_at: stoppedAt,
    },
  });

  return NextResponse.json({ success: true });
}
