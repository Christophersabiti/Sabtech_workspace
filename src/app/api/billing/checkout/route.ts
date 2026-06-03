import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import {
  getPesapalConfig,
  getPesapalToken,
  registerPesapalIpn,
  submitPesapalOrder,
} from '@/services/pesapal';
import { EntitlementError, assertFeatureEntitlement } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    companyId?: string;
    planId?: string;
    couponCode?: string;
  } | null;

  const companyId = body?.companyId;
  const planId = body?.planId;

  if (!companyId || !planId) {
    return NextResponse.json({ error: 'Company ID and Plan ID are required.' }, { status: 400 });
  }

  // Verify the user is an admin of the target company
  const adminSupabase = createAdminSupabase();
  const { data: membership } = await adminSupabase
    .from('company_users')
    .select('role_id, status')
    .eq('company_id', companyId)
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (!membership || membership.status !== 'active') {
    return NextResponse.json({ error: 'You are not an active member of this company.' }, { status: 403 });
  }

  if (!['super_admin', 'admin'].includes(membership.role_id as string)) {
    return NextResponse.json({ error: 'Only a Company Admin can manage billing.' }, { status: 403 });
  }

  try {
    await assertFeatureEntitlement(adminSupabase, session.user.id, companyId, 'billing.manage');
  } catch (error) {
    if (error instanceof EntitlementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Load the target subscription plan
  const { data: plan, error: planErr } = await adminSupabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true)
    .maybeSingle();

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Selected subscription plan not found.' }, { status: 404 });
  }

  const checkoutAmount = Number(plan.monthly_price ?? plan.price ?? 0);

  try {
    // 1. Resolve Pesapal Configuration
    const config = await getPesapalConfig();
    const token = await getPesapalToken(config);

    // Get current host for webhook callback
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const origin = `${protocol}://${host}`;

    // 2. Dynamically Register IPN if missing
    let ipnId = config.ipnId;
    if (!ipnId) {
      const webhookUrl = `${origin}/api/billing/pesapal-webhook`;
      console.log('Registering new Pesapal IPN webhook at:', webhookUrl);
      ipnId = await registerPesapalIpn(token, config.sandboxMode, webhookUrl);

      // Save it back to settings so we don't register it on every checkout
      await adminSupabase
        .from('pesapal_settings')
        .upsert({ id: 1, ipn_id: ipnId, updated_at: new Date().toISOString() });
    }

    // 3. Create uniquely identifiable Merchant Reference
    const merchantReference = `sub_${companyId.slice(0, 8)}_${plan.key}_${Date.now()}`;

    // 4. Submit checkout request
    const checkoutResult = await submitPesapalOrder(token, config.sandboxMode, {
      merchantReference,
      amount: checkoutAmount,
      currency: plan.currency,
      description: `Upgrade to Sabtech ${plan.name} Plan`,
      callbackUrl: `${origin}/admin/settings/billing/callback`,
      ipnId,
      billingAddress: {
        email: session.user.email || '',
      },
    });

    // 5. Store pending transaction log
    const { error: txErr } = await adminSupabase
      .from('billing_transactions')
      .insert({
        company_id: companyId,
        plan_id: planId,
        pesapal_tracking_id: checkoutResult.orderTrackingId,
        merchant_reference: merchantReference,
        amount: checkoutAmount,
        currency: plan.currency,
        status: 'pending',
        raw_response: {
          provider: 'pesapal',
          checkout_created_at: new Date().toISOString(),
        },
      });

    if (txErr) {
      console.error('Error logging transaction details:', txErr);
      return NextResponse.json({ error: 'Database transaction logging failed.' }, { status: 500 });
    }

    return NextResponse.json({ redirectUrl: checkoutResult.redirectUrl });
  } catch (error: unknown) {
    console.error('Pesapal Checkout Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pesapal Checkout failed.' },
      { status: 500 }
    );
  }
}
