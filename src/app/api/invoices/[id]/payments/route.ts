import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logInvoiceAction, logPaymentAction } from '@/lib/auditLog';

type PaymentBody = {
  company_id:              string;
  payment_date:            string;
  amount_paid:             number;
  actual_received?:        number;
  wht_withheld?:           number;
  payment_method:          string;
  reference_number?:       string;
  note?:                   string;
  wht_certificate_number?: string;
};

async function nextPaymentNumber(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string): Promise<string> {
  const year   = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const { data: latest } = await supabase
    .from('payments')
    .select('payment_number')
    .eq('company_id', companyId)
    .like('payment_number', `${prefix}%`)
    .order('payment_number', { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (latest && latest.length > 0) {
    const parsed = parseInt(latest[0].payment_number.replace(prefix, ''), 10);
    if (!isNaN(parsed)) nextNum = parsed + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as PaymentBody | null;
  if (!body?.company_id || !body?.amount_paid || !body?.payment_date || !body?.payment_method) {
    return NextResponse.json({ error: 'company_id, amount_paid, payment_date, and payment_method are required.' }, { status: 400 });
  }

  if (body.amount_paid <= 0) {
    return NextResponse.json({ error: 'amount_paid must be greater than 0.' }, { status: 400 });
  }

  // Rate limit: 20 payments per 5 min per user
  try {
    assertRateLimit(`invoice:payment:${getRequestIdentity(req, user.id)}`, {
      limit: 20,
      windowMs: 5 * 60 * 1000,
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
    await permissions.assertPermission(user.id, body.company_id, 'payments', 'record_payment');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Verify invoice exists and belongs to the company
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, status, balance_due, company_id, apply_wht')
    .eq('id', invoiceId)
    .eq('company_id', body.company_id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  if (['paid', 'cancelled', 'void'].includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot record payment on a ${invoice.status} invoice.` }, { status: 409 });
  }

  // balance_due for WHT invoices = net_payable - prior payments (tracked by trigger)
  if (body.amount_paid > invoice.balance_due + 0.01) {
    return NextResponse.json({ error: `Payment amount exceeds balance due (${invoice.balance_due}).` }, { status: 422 });
  }

  const whtWithheld = body.wht_withheld ?? 0;
  const actualReceived = body.actual_received ?? body.amount_paid;

  const paymentNumber = await nextPaymentNumber(supabase, body.company_id);

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      company_id:              body.company_id,
      payment_number:          paymentNumber,
      invoice_id:              invoiceId,
      payment_date:            body.payment_date,
      amount_paid:             body.amount_paid,
      actual_received:         actualReceived,
      wht_withheld:            whtWithheld,
      payment_method:          body.payment_method,
      reference_number:        body.reference_number?.trim() || null,
      note:                    body.note?.trim() || null,
      wht_certificate_number:  body.wht_certificate_number?.trim() || null,
      is_confirmed:            true,
      status:                  'confirmed',
    })
    .select('id')
    .single();

  // If WHT certificate number is provided, update the invoice's URA certificate field
  if (!payErr && payment && body.wht_certificate_number?.trim()) {
    await supabase
      .from('invoices')
      .update({ ura_wht_certificate_number: body.wht_certificate_number.trim() })
      .eq('id', invoiceId)
      .eq('company_id', body.company_id);
  }

  if (payErr || !payment) {
    return NextResponse.json({ error: payErr?.message ?? 'Failed to record payment.' }, { status: 500 });
  }

  // Audit logs (fire-and-forget)
  await Promise.all([
    logPaymentAction(supabase, {
      company_id:   body.company_id,
      payment_id:   payment.id,
      action:       'created',
      performed_by: user.id,
      new_status:   'confirmed',
      amount:       body.amount_paid,
    }),
    logInvoiceAction(supabase, {
      company_id:   body.company_id,
      invoice_id:   invoiceId,
      action:       'payment_applied',
      performed_by: user.id,
      metadata:     { payment_id: payment.id, amount: body.amount_paid },
    }),
  ]).catch(() => undefined);

  return NextResponse.json({ ok: true, payment_id: payment.id, payment_number: paymentNumber });
}
