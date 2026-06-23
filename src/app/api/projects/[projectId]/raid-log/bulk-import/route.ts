import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES       = new Set(['risk', 'assumption', 'issue', 'decision']);
const ALLOWED_SEVERITIES  = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_PROBS       = new Set(['low', 'medium', 'high']);
const ALLOWED_STATUSES    = new Set(['open', 'in_progress', 'mitigated', 'resolved', 'closed', 'accepted']);

type RaidRow = {
  type: string;
  title: string;
  description?: string | null;
  severity?: string;
  probability?: string;
  impact?: string | null;
  mitigation?: string | null;
  status?: string;
  due_date?: string | null;
  client_visible?: boolean;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json().catch(() => null);
  const { companyId, rows } = (body ?? {}) as { companyId?: string; rows?: RaidRow[] };

  if (!companyId || !projectId) {
    return NextResponse.json({ error: 'companyId and projectId are required.' }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows array is required and must not be empty.' }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 rows per import.' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { data: membership } = await admin
    .from('company_users')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const inserts = rows.map(r => ({
    company_id:     companyId,
    project_id:     projectId,
    type:           ALLOWED_TYPES.has(String(r.type ?? '').toLowerCase())
                      ? String(r.type).toLowerCase()
                      : 'risk',
    title:          String(r.title ?? '').trim(),
    description:    r.description ? String(r.description).trim() : null,
    severity:       ALLOWED_SEVERITIES.has(String(r.severity ?? '').toLowerCase())
                      ? String(r.severity).toLowerCase()
                      : 'medium',
    probability:    ALLOWED_PROBS.has(String(r.probability ?? '').toLowerCase())
                      ? String(r.probability).toLowerCase()
                      : 'medium',
    impact:         r.impact ? String(r.impact).trim() : null,
    mitigation:     r.mitigation ? String(r.mitigation).trim() : null,
    status:         ALLOWED_STATUSES.has(String(r.status ?? '').toLowerCase())
                      ? String(r.status).toLowerCase()
                      : 'open',
    due_date:       r.due_date ? String(r.due_date) : null,
    client_visible: r.client_visible === true,
  }));

  const { data, error } = await admin
    .from('raid_log')
    .insert(inserts)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: data?.length ?? inserts.length });
}
