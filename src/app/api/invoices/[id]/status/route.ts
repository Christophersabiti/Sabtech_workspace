import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logInvoiceAction } from '@/lib/auditLog';

type StatusBody = {
  status: 'sent' | 'cancelled' | 'void';
  reason?: string;
  company_id: string;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as StatusBody | null;
  if (!body?.status || !body?.company_id) {
    return NextResponse.json({ error: 'status and company_id are required.' }, { status: 400 });
  }

  const { status, reason, company_id } = body;
  const validStatuses = ['sent', 'cancelled', 'void'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
  }

  // Rate limit: 30 status changes per 5 min per user
  try {
    assertRateLimit(`invoice:status:${getRequestIdentity(req, user.id)}`, {
      limit: 30,
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
    // void requires finance-level; cancel/sent requires general update
    const action = status === 'void' ? 'manage' : 'update';
    await permissions.assertPermission(user.id, company_id, 'invoices', action);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch current invoice to get old status and verify ownership
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('id, status, company_id')
    .eq('id', id)
    .eq('company_id', company_id)
    .single();

  if (fetchErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  const oldStatus = invoice.status;

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = { status, updated_at: new Date().toISOString() };

  if (status === 'void') {
    if (!reason?.trim()) {
      return NextResponse.json({ error: 'A reason is required when voiding an invoice.' }, { status: 400 });
    }
    updatePayload.void_reason  = reason.trim();
    updatePayload.voided_at    = new Date().toISOString();
    updatePayload.voided_by    = user.id;
  }

  const { error: updateErr } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', id)
    .eq('company_id', company_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit log (fire-and-forget — don't fail the request if this errors)
  await logInvoiceAction(supabase, {
    company_id,
    invoice_id:   id,
    action:       status === 'void' ? 'voided' : 'status_changed',
    performed_by: user.id,
    old_status:   oldStatus,
    new_status:   status,
    reason:       reason ?? null,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status });
}
