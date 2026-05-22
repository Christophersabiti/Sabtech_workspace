import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PermissionService, PermissionError } from '@/lib/permissionService';
import { RateLimitError, assertRateLimit, getRequestIdentity } from '@/lib/rateLimit';
import { logQuotationAction } from '@/lib/auditLog';

type ConvertBody = {
  company_id:  string;
  project_id:  string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: quotationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as ConvertBody | null;
  if (!body?.company_id || !body?.project_id) {
    return NextResponse.json({ error: 'company_id and project_id are required.' }, { status: 400 });
  }

  // Rate limit
  try {
    assertRateLimit(`quotation:convert:${getRequestIdentity(req, user.id)}`, {
      limit: 10,
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
    // Converting requires project creation / task creation rights
    await permissions.assertPermission(user.id, body.company_id, 'tasks', 'create');
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch quotation with items
  const { data: quotation, error: fetchErr } = await supabase
    .from('quotations')
    .select('id, status, company_id, quotation_items(*)')
    .eq('id', quotationId)
    .eq('company_id', body.company_id)
    .single();

  if (fetchErr || !quotation) {
    return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 });
  }

  if (quotation.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved quotations can be converted to tasks.' }, { status: 422 });
  }

  // Verify project belongs to the same company
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, company_id')
    .eq('id', body.project_id)
    .eq('company_id', body.company_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  const items = (quotation.quotation_items as Array<{ id: string; item_name: string; description: string | null }>) ?? [];
  const tasks = items
    .filter(it => it.item_name?.trim())
    .map(it => ({
      company_id:        body.company_id,
      project_id:        body.project_id,
      quotation_id:      quotationId,
      quotation_item_id: it.id,
      title:             it.item_name.trim(),
      description:       it.description?.trim() || null,
      status:            'pending',
    }));

  if (tasks.length === 0) {
    return NextResponse.json({ error: 'No valid items to convert.' }, { status: 422 });
  }

  const { error: taskErr } = await supabase.from('project_tasks').insert(tasks);
  if (taskErr) {
    return NextResponse.json({ error: taskErr.message }, { status: 500 });
  }

  // Mark quotation as converted
  const { error: updateErr } = await supabase
    .from('quotations')
    .update({ status: 'converted', updated_at: new Date().toISOString() })
    .eq('id', quotationId)
    .eq('company_id', body.company_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit log (fire-and-forget)
  await logQuotationAction(supabase, {
    company_id:   body.company_id,
    quotation_id: quotationId,
    action:       'converted',
    performed_by: user.id,
    old_status:   'approved',
    new_status:   'converted',
    metadata:     { project_id: body.project_id, task_count: tasks.length },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, tasks_created: tasks.length });
}
