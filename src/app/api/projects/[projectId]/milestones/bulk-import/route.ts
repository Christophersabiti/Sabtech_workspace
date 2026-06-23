import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'missed', 'cancelled']);

type MilestoneRow = {
  name: string;
  description?: string | null;
  target_date?: string | null;
  status?: string;
  progress?: number;
  remarks?: string | null;
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
  const { companyId, rows } = (body ?? {}) as { companyId?: string; rows?: MilestoneRow[] };

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

  // Verify membership
  const { data: membership } = await admin
    .from('company_users')
    .select('id')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Verify project belongs to company
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

  const inserts = rows.map((r, i) => ({
    company_id:     companyId,
    project_id:     projectId,
    name:           String(r.name ?? '').trim(),
    description:    r.description ? String(r.description).trim() : null,
    target_date:    r.target_date ? String(r.target_date) : null,
    status:         ALLOWED_STATUSES.has(String(r.status ?? '')) ? String(r.status) : 'pending',
    progress:       typeof r.progress === 'number' ? Math.min(100, Math.max(0, r.progress)) : 0,
    remarks:        r.remarks ? String(r.remarks).trim() : null,
    client_visible: r.client_visible !== false,
    sort_order:     i,
  }));

  const { data, error } = await admin
    .from('milestones')
    .insert(inserts)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: data?.length ?? inserts.length });
}
