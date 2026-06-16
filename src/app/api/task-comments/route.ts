import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

type TaskCommentRow = {
  id: string;
  content: string;
  is_internal: boolean;
  client_visible: boolean;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};

async function withCommentAuthors(
  admin: ReturnType<typeof createAdminSupabase>,
  comments: TaskCommentRow[],
) {
  const userIds = Array.from(
    new Set(comments.map((comment) => comment.user_id).filter((id): id is string => Boolean(id))),
  );
  if (userIds.length === 0) {
    return comments.map((comment) => ({ ...comment, app_users: null }));
  }

  const { data: users } = await admin
    .from('app_users')
    .select('id, full_name, email')
    .in('id', userIds);

  const usersById = new Map(
    (users ?? []).map((user) => [
      user.id as string,
      {
        full_name: (user.full_name as string | null) ?? null,
        email: (user.email as string | null) ?? null,
      },
    ]),
  );

  return comments.map((comment) => ({
    ...comment,
    app_users: comment.user_id ? (usersById.get(comment.user_id) ?? null) : null,
  }));
}

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
    .select('id, content, is_internal, client_visible, created_at, updated_at, user_id')
    .eq('task_id', taskId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comments: await withCommentAuthors(admin, (comments ?? []) as TaskCommentRow[]) });
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
    .select('id, content, is_internal, client_visible, created_at, updated_at, user_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [commentWithAuthor] = await withCommentAuthors(admin, [comment as TaskCommentRow]);

  return NextResponse.json({ comment: commentWithAuthor }, { status: 201 });
}
