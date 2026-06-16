import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const companyId = searchParams.get('companyId');

  if (!taskId || !companyId) {
    return NextResponse.json({ error: 'taskId and companyId are required.' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { data: membership } = await admin
    .from('company_users')
    .select('id, app_user_id')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: comments, error } = await admin
    .from('task_comments')
    .select('id, content, is_internal, client_visible, created_at, updated_at, user_id, app_users(full_name, email)')
    .eq('task_id', taskId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comments: comments ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { taskId, companyId, content, isInternal = true, clientVisible = false } = body as {
    taskId?: string;
    companyId?: string;
    content?: string;
    isInternal?: boolean;
    clientVisible?: boolean;
  };

  if (!taskId || !companyId || !content?.trim()) {
    return NextResponse.json({ error: 'taskId, companyId, and content are required.' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  const { data: membership } = await admin
    .from('company_users')
    .select('id, app_user_id')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: comment, error } = await admin
    .from('task_comments')
    .insert({
      company_id: companyId,
      task_id: taskId,
      user_id: membership.app_user_id,
      content: content.trim(),
      is_internal: isInternal,
      client_visible: clientVisible,
    })
    .select('id, content, is_internal, client_visible, created_at, updated_at, user_id, app_users(full_name, email)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comment }, { status: 201 });
}
