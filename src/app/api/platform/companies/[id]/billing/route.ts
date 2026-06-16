import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformSuperAdmin } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const { id: companyId } = await params;
  const body = await request.json().catch(() => ({}));

  const {
    billing_status,
    subscription_status,
    plan_id,
    current_period_start,
    current_period_end,
    note,
  } = body as {
    billing_status?: string;
    subscription_status?: string;
    plan_id?: string;
    current_period_start?: string;
    current_period_end?: string;
    note?: string;
  };

  const VALID_BILLING = ['trial_active', 'trial_expired', 'active', 'past_due', 'cancelled', 'suspended'];
  const VALID_SUBSCRIPTION = ['trialing', 'active', 'past_due', 'cancelled', 'suspended'];

  if (billing_status && !VALID_BILLING.includes(billing_status)) {
    return NextResponse.json({ error: 'Invalid billing_status value.' }, { status: 400 });
  }
  if (subscription_status && !VALID_SUBSCRIPTION.includes(subscription_status)) {
    return NextResponse.json({ error: 'Invalid subscription_status value.' }, { status: 400 });
  }

  const { adminSupabase, context } = platform;

  const { data: existing } = await adminSupabase
    .from('company_subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .maybeSingle();

  const subscriptionUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (billing_status) subscriptionUpdate.billing_status = billing_status;
  if (subscription_status) subscriptionUpdate.subscription_status = subscription_status;
  if (plan_id) subscriptionUpdate.plan_id = plan_id;
  if (current_period_start) subscriptionUpdate.current_period_start = current_period_start;
  if (current_period_end) subscriptionUpdate.current_period_end = current_period_end;

  let subError: unknown;
  if (existing) {
    const { error } = await adminSupabase
      .from('company_subscriptions')
      .update(subscriptionUpdate)
      .eq('company_id', companyId);
    subError = error;
  } else {
    const { error } = await adminSupabase
      .from('company_subscriptions')
      .insert({ company_id: companyId, ...subscriptionUpdate });
    subError = error;
  }

  if (subError) {
    return NextResponse.json({ error: (subError as { message: string }).message }, { status: 500 });
  }

  // Update companies.plan label if plan_id was changed
  if (plan_id) {
    const { data: planRow } = await adminSupabase
      .from('subscription_plans')
      .select('key')
      .eq('id', plan_id)
      .maybeSingle();
    if (planRow?.key) {
      await adminSupabase
        .from('companies')
        .update({ plan: planRow.key })
        .eq('id', companyId);
    }
  }

  // Best-effort audit log (table may not exist in all environments)
  void Promise.resolve(
    adminSupabase.from('platform_audit_log').insert({
      actor_user_id: context.appUserId,
      action: 'manual_billing_update',
      target_type: 'company',
      target_id: companyId,
      details: {
        billing_status,
        subscription_status,
        plan_id,
        current_period_end,
        note: note ?? null,
        updated_by: context.email,
      },
    }),
  ).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
