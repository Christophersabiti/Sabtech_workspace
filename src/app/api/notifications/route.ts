import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export type NotificationItem = {
  id: string;
  type: 'task' | 'project' | 'invoice';
  title: string;
  subtitle: string | null;
  days_overdue: number;   // positive = overdue, 0 = due today, negative = due in N days
  due_date: string;
  href: string;
  entity_id: string;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });

  const admin = createAdminSupabase();

  // Verify membership
  const { data: membership } = await admin
    .from('company_users')
    .select('id, app_user_id')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Overdue & due-soon tasks ──────────────────────────────────────────────
  const [tasksRes, projectsRes, invoicesRes] = await Promise.all([
    admin
      .from('project_tasks')
      .select('id, title, end_date, status, project_id, projects(project_name)')
      .eq('company_id', companyId)
      .not('status', 'in', '("completed","cancelled")')
      .not('end_date', 'is', null)
      .lte('end_date', today)
      .order('end_date', { ascending: true })
      .limit(30),

    admin
      .from('projects')
      .select('id, project_name, project_code, end_date, status, client_id')
      .eq('company_id', companyId)
      .not('status', 'in', '("completed","cancelled")')
      .not('end_date', 'is', null)
      .lte('end_date', today)
      .order('end_date', { ascending: true })
      .limit(20),

    admin
      .from('invoices')
      .select('id, invoice_number, due_date, status, total_amount, client_id')
      .eq('company_id', companyId)
      .not('status', 'in', '("paid","void","draft","cancelled")')
      .not('due_date', 'is', null)
      .lte('due_date', today)
      .order('due_date', { ascending: true })
      .limit(20),
  ]);

  const todayMs = new Date(today).getTime();

  function daysOverdue(dateStr: string): number {
    const due = new Date(dateStr).getTime();
    return Math.floor((todayMs - due) / 86400000);
  }

  const items: NotificationItem[] = [];

  // Tasks
  for (const t of (tasksRes.data ?? [])) {
    const projectName = (t.projects as { project_name?: string } | null)?.project_name ?? null;
    items.push({
      id:           `task-${t.id}`,
      type:         'task',
      title:        t.title,
      subtitle:     projectName,
      days_overdue: daysOverdue(t.end_date!),
      due_date:     t.end_date!,
      href:         `/projects/${t.project_id}`,
      entity_id:    t.id,
    });
  }

  // Projects
  for (const p of (projectsRes.data ?? [])) {
    items.push({
      id:           `project-${p.id}`,
      type:         'project',
      title:        p.project_name,
      subtitle:     p.project_code ?? null,
      days_overdue: daysOverdue(p.end_date!),
      due_date:     p.end_date!,
      href:         `/projects/${p.id}`,
      entity_id:    p.id,
    });
  }

  // Invoices
  for (const inv of (invoicesRes.data ?? [])) {
    items.push({
      id:           `invoice-${inv.id}`,
      type:         'invoice',
      title:        `Invoice ${inv.invoice_number}`,
      subtitle:     null,
      days_overdue: daysOverdue(inv.due_date!),
      due_date:     inv.due_date!,
      href:         `/invoices/${inv.id}`,
      entity_id:    inv.id,
    });
  }

  // Sort: most overdue first
  items.sort((a, b) => b.days_overdue - a.days_overdue);

  return NextResponse.json({ total: items.length, items });
}
