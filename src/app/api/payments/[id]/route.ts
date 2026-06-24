import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logInvoiceAction, logPaymentAction } from '@/lib/auditLog';

const ADMIN_ROLES = new Set(['super_admin', 'admin']);
const PAYMENT_METHODS = new Set(['bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other']);

type UpdatePaymentBody = {
  company_id: string;
  payment_date: string;
  amount_paid: number;
  actual_received?: number;
  wht_withheld?: number;
  payment_method: string;
  reference_number?: string;
  note?: string;
  wht_certificate_number?: string | null;
};

function toAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: paymentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as UpdatePaymentBody | null;
  if (!body?.company_id || !body?.payment_date || !body?.payment_method) {
    return NextResponse.json(
      { error: 'company_id, payment_date, and payment_method are required.' },
      { status: 400 },
    );
  }

  const amountPaid = toAmount(body.amount_paid);
  const actualReceived = body.actual_received === undefined ? amountPaid : toAmount(body.actual_received);
  const whtWithheld = body.wht_withheld === undefined ? 0 : toAmount(body.wht_withheld);

  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return NextResponse.json({ error: 'amount_paid must be greater than 0.' }, { status: 400 });
  }

  if (!Number.isFinite(actualReceived) || actualReceived < 0) {
    return NextResponse.json({ error: 'actual_received must be zero or greater.' }, { status: 400 });
  }

  if (!Number.isFinite(whtWithheld) || whtWithheld < 0) {
    return NextResponse.json({ error: 'wht_withheld must be zero or greater.' }, { status: 400 });
  }

  if (!PAYMENT_METHODS.has(body.payment_method)) {
    return NextResponse.json({ error: 'Invalid payment method.' }, { status: 400 });
  }

  try {
    assertRateLimit(`payment:edit:${getRequestIdentity(req, user.id)}`, {
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
  let membership: Awaited<ReturnType<PermissionService['assertPermission']>>;

  try {
    membership = await permissions.assertPermission(user.id, body.company_id, 'payments', 'manage');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!ADMIN_ROLES.has(membership.role_id)) {
    return NextResponse.json(
      { error: 'Only admins can edit and reconfirm payments.' },
      { status: 403 },
    );
  }

  const { data: payment, error: paymentErr } = await supabase
    .from('payments')
    .select(`
      id,
      company_id,
      invoice_id,
      payment_number,
      status,
      amount_paid,
      actual_received,
      wht_withheld,
      payment_date,
      payment_method,
      reference_number,
      note,
      wht_certificate_number
    `)
    .eq('id', paymentId)
    .eq('company_id', body.company_id)
    .single();

  if (paymentErr || !payment) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  }

  if (payment.status !== 'reversed') {
    return NextResponse.json(
      { error: 'Reverse this payment before editing and confirming it again.' },
      { status: 409 },
    );
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .from('invoices')
    .select('id, status, balance_due, company_id')
    .eq('id', payment.invoice_id)
    .eq('company_id', body.company_id)
    .single();

  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: 'Connected invoice not found.' }, { status: 404 });
  }

  if (['cancelled', 'void'].includes(invoice.status)) {
    return NextResponse.json(
      { error: `Cannot confirm a payment against a ${invoice.status} invoice.` },
      { status: 409 },
    );
  }

  if (amountPaid > Number(invoice.balance_due ?? 0) + 0.01) {
    return NextResponse.json(
      { error: `Payment amount exceeds current balance due (${invoice.balance_due}).` },
      { status: 422 },
    );
  }

  const updatePayload = {
    payment_date: body.payment_date,
    amount_paid: amountPaid,
    actual_received: actualReceived,
    wht_withheld: whtWithheld,
    payment_method: body.payment_method,
    reference_number: body.reference_number?.trim() || null,
    note: body.note?.trim() || null,
    wht_certificate_number: body.wht_certificate_number?.trim() || null,
    is_confirmed: true,
    status: 'confirmed',
    reversal_reason: null,
    reversed_at: null,
    reversed_by: null,
  };

  const { error: updateErr } = await supabase
    .from('payments')
    .update(updatePayload)
    .eq('id', paymentId)
    .eq('company_id', body.company_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (body.wht_certificate_number?.trim()) {
    await supabase
      .from('invoices')
      .update({ ura_wht_certificate_number: body.wht_certificate_number.trim() })
      .eq('id', payment.invoice_id)
      .eq('company_id', body.company_id);
  }

  await Promise.all([
    logPaymentAction(supabase, {
      company_id: body.company_id,
      payment_id: paymentId,
      action: 'confirmed',
      performed_by: user.id,
      old_status: 'reversed',
      new_status: 'confirmed',
      reason: 'Payment edited and reconfirmed.',
      amount: amountPaid,
      metadata: {
        previous: {
          amount_paid: payment.amount_paid,
          actual_received: payment.actual_received,
          wht_withheld: payment.wht_withheld,
          payment_date: payment.payment_date,
          payment_method: payment.payment_method,
          reference_number: payment.reference_number,
          note: payment.note,
          wht_certificate_number: payment.wht_certificate_number,
        },
        updated: updatePayload,
      },
    }),
    logInvoiceAction(supabase, {
      company_id: body.company_id,
      invoice_id: payment.invoice_id,
      action: 'payment_applied',
      performed_by: user.id,
      metadata: {
        payment_id: paymentId,
        amount: amountPaid,
        edited_after_reversal: true,
      },
    }),
  ]).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    payment_id: paymentId,
    payment_number: payment.payment_number,
  });
}
