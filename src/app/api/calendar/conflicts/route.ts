import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkConflicts } from '@/lib/calendar/conflictDetection';

// GET /api/calendar/conflicts?company_id=&start_at=&end_at=&exclude_event_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const company_id       = p.get('company_id');
  const start_at         = p.get('start_at');
  const end_at           = p.get('end_at');
  const exclude_event_id = p.get('exclude_event_id') ?? undefined;

  if (!company_id || !start_at || !end_at) {
    return NextResponse.json({ error: 'company_id, start_at, and end_at are required' }, { status: 400 });
  }

  const result = await checkConflicts(
    supabase, user.id, company_id, start_at, end_at, exclude_event_id,
  );
  return NextResponse.json(result);
}
