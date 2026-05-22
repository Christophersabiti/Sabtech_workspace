import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logQuotationAction } from '@/lib/auditLog';

type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted';

type StatusBody = {
  status:     QuotationStatus;
  company_id: string;
};

const VALID_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft:     ['sent'],
  sent:      ['approved', 'rejected', 'expired'],
  approved:  ['rejected', 'converted'],
  rejected:  ['draft'],
  expired:   ['draft'],
  converted: [],
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

  const validStatuses: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'];
  if (!validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status.` }, { status: 400 });
  }

  // Rate limit
  try {
    assertRateLimit(`quotation:status:${getRequestIdentity(req, user.id)}`, {
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
    // Approving a quotation requires the 'approve' action
    const action = body.status === 'approved' ? 'approve' : 'update';
    await permissions.assertPermission(user.id, body.company_id, 'quotations', action);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch current quotation to validate transition
  const { data: quotation, error: fetchErr } = await supabase
    .from('quotations')
    .select('id, status, company_id')
    .eq('id', id)
    .eq('company_id', body.company_id)
    .single();

  if (fetchErr || !quotation) {
    return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
  }

  const currentStatus = quotation.status as QuotationStatus;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `Cannot transition from '${currentStatus}' to '${body.status}'.` },
      { status: 422 },
    );
  }

  const { error: updateErr } = await supabase
    .from('quotations')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', body.company_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit log (fire-and-forget)
  await logQuotationAction(supabase, {
    company_id:   body.company_id,
    quotation_id: id,
    action:       'status_changed',
    performed_by: user.id,
    old_status:   currentStatus,
    new_status:   body.status,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, status: body.status });
}
