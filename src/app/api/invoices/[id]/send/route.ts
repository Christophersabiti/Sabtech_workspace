import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logInvoiceAction } from '@/lib/auditLog';

type SendBody = {
  company_id: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as SendBody | null;
  if (!body?.company_id) {
    return NextResponse.json({ error: 'company_id is required.' }, { status: 400 });
  }

  // Rate limit: 20 send actions per 5 min per user
  try {
    assertRateLimit(`invoice:send:${getRequestIdentity(req, user.id)}`, {
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
    await permissions.assertPermission(user.id, body.company_id, 'invoices', 'update');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch current invoice
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, status, company_id, sent_at')
    .eq('id', id)
    .eq('company_id', body.company_id)
    .single();

  if (fetchErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  if (!['draft', 'sent'].includes(invoice.status)) {
    return NextResponse.json({ error: `Cannot send a ${invoice.status} invoice.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const isReminder = invoice.status === 'sent';

  const updatePayload = isReminder
    ? { last_reminded_at: now, reminder_count: supabase.rpc('increment_reminder_count' as never) as unknown as number, updated_at: now }
    : { status: 'sent', sent_at: now, updated_at: now };

  // For simplicity, use a basic update; reminder_count increment is handled separately
  if (isReminder) {
    const { data: current } = await supabase
      .from('invoices')
      .select('reminder_count')
      .eq('id', id)
      .single();

    const { error: updateErr } = await supabase
      .from('invoices')
      .update({
        last_reminded_at: now,
        reminder_count:   ((current as { reminder_count?: number | null })?.reminder_count ?? 0) + 1,
        updated_at:       now,
      })
      .eq('id', id)
      .eq('company_id', body.company_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: now, updated_at: now })
      .eq('id', id)
      .eq('company_id', body.company_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  // TODO: Wire email delivery via Supabase Edge Function / Resend when RESEND_API_KEY is configured.

  // Audit log (fire-and-forget)
  await logInvoiceAction(supabase, {
    company_id:   body.company_id,
    invoice_id:   id,
    action:       isReminder ? 'status_changed' : 'sent',
    performed_by: user.id,
    old_status:   invoice.status,
    new_status:   isReminder ? 'sent' : 'sent',
    metadata:     { is_reminder: isReminder },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, is_reminder: isReminder });
}
