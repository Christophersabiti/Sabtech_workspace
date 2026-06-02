import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import {
  getPesapalConfig,
  getPesapalToken,
  getPesapalTransactionStatus,
} from '@/services/pesapal';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderTrackingId = searchParams.get('OrderTrackingId');
  const merchantReference = searchParams.get('OrderMerchantReference');
  const notificationType = searchParams.get('OrderNotificationType');

  console.log('Pesapal Webhook Received:', { orderTrackingId, merchantReference, notificationType });

  if (!orderTrackingId || !merchantReference) {
    return NextResponse.json({ error: 'Missing webhook params.' }, { status: 400 });
  }

  const adminSupabase = createAdminSupabase();

  try {
    // 1. Fetch active Pesapal configuration and token
    const config = await getPesapalConfig();
    const token = await getPesapalToken(config);

    // 2. Fetch the transaction status details from Pesapal
    const statusResult = await getPesapalTransactionStatus(token, config.sandboxMode, orderTrackingId);

    console.log('Pesapal Transaction Status Details:', statusResult);

    // 3. Map Pesapal status code to database status
    let dbStatus: 'pending' | 'completed' | 'failed' = 'pending';
    if (statusResult.statusCode === 1) {
      dbStatus = 'completed';
    } else if (statusResult.statusCode === 2) {
      dbStatus = 'failed';
    }

    // 4. Update the billing_transactions record
    const { data: transaction, error: txErr } = await adminSupabase
      .from('billing_transactions')
      .update({
        status: dbStatus,
        pesapal_tracking_id: orderTrackingId,
        payment_method: statusResult.paymentMethod,
        payment_account: statusResult.confirmationCode,
        error_message: statusResult.error,
        raw_response: statusResult as any,
        updated_at: new Date().toISOString(),
      })
      .eq('merchant_reference', merchantReference)
      .select()
      .maybeSingle();

    if (txErr) {
      console.error('Database transaction log update failed:', txErr);
      return NextResponse.json({ error: 'Failed to update transaction status in database.' }, { status: 500 });
    }

    if (!transaction) {
      console.warn('No matching transaction found in database for reference:', merchantReference);
      return NextResponse.json({ error: 'Transaction reference not found.' }, { status: 404 });
    }

    // 5. If transaction is completed, activate/upgrade the company's subscription
    if (dbStatus === 'completed') {
      const companyId = transaction.company_id;
      const planId = transaction.plan_id;

      // Resolve plan key and details
      const { data: plan } = await adminSupabase
        .from('subscription_plans')
        .select('key, billing_interval')
        .eq('id', planId)
        .single();

      if (plan) {
        // Calculate expiration date (Starter/Growth/Pro plans are monthly)
        const startsAt = new Date();
        let endsAt = new Date();
        if (plan.billing_interval === 'monthly') {
          endsAt.setDate(startsAt.getDate() + 30);
        } else if (plan.billing_interval === 'yearly') {
          endsAt.setFullYear(startsAt.getFullYear() + 1);
        } else {
          // one-off or indefinite
          endsAt.setFullYear(startsAt.getFullYear() + 100);
        }

        // Upsert subscription
        const { error: subErr } = await adminSupabase
          .from('company_subscriptions')
          .upsert({
            company_id: companyId,
            plan_id: planId,
            status: 'active',
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'company_id' });

        if (subErr) {
          console.error('Failed to upsert company subscription details:', subErr);
        }

        // Update company plan column in the companies table
        const { error: compErr } = await adminSupabase
          .from('companies')
          .update({
            plan: plan.key,
            updated_at: new Date().toISOString(),
          })
          .eq('id', companyId);

        if (compErr) {
          console.error('Failed to update company plan metadata:', compErr);
        }
      }
    }

    // Pesapal V3 expects a response format to acknowledge receipt of IPN notification
    return NextResponse.json({
      orderNotificationType: notificationType,
      orderTrackingId,
      orderMerchantReference: merchantReference,
      status: 200,
    });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook execution failed.' },
      { status: 500 }
    );
  }
}
