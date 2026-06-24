import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logPaymentAction, logInvoiceAction } from '@/lib/auditLog';

type ReverseBody = {
  company_id: string;
  reason:     string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: paymentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as ReverseBody | null;
  if (!body?.company_id || !body?.reason?.trim()) {
    return NextResponse.json({ error: 'company_id and reason are required.' }, { status: 400 });
  }

  if (body.reason.trim().length < 10) {
    return NextResponse.json({ error: 'Reversal reason must be at least 10 characters.' }, { status: 400 });
  }

  // Rate limit: 10 reversals per 10 min per user
  try {
    assertRateLimit(`payment:reverse:${getRequestIdentity(req, user.id)}`, {
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const permissions = new PermissionService(supabase);

  try {
    await permissions.assertPermission(user.id, body.company_id, 'payments', 'manage');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch payment and verify ownership
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('id, status, amount_paid, invoice_id, company_id')
    .eq('id', paymentId)
    .eq('company_id', body.company_id)
    .single();

  if (fetchErr || !payment) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  }

  if (payment.status === 'reversed') {
    return NextResponse.json({ error: 'Payment has already been reversed.' }, { status: 409 });
  }

  if (payment.status === 'failed') {
    return NextResponse.json({ error: 'Cannot reverse a failed payment.' }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from('payments')
    .update({
      is_confirmed:     false,
      status:           'reversed',
      reversal_reason:  body.reason.trim(),
      reversed_at:      new Date().toISOString(),
      reversed_by:      user.id,
    })
    .eq('id', paymentId)
    .eq('company_id', body.company_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit logs (fire-and-forget)
  await Promise.all([
    logPaymentAction(supabase, {
      company_id:   body.company_id,
      payment_id:   paymentId,
      action:       'reversed',
      performed_by: user.id,
      old_status:   payment.status,
      new_status:   'reversed',
      reason:       body.reason.trim(),
      amount:       payment.amount_paid,
    }),
    logInvoiceAction(supabase, {
      company_id:   body.company_id,
      invoice_id:   payment.invoice_id,
      action:       'payment_reversed',
      performed_by: user.id,
      reason:       body.reason.trim(),
      metadata:     { payment_id: paymentId, amount: payment.amount_paid },
    }),
  ]).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
