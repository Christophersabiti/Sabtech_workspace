import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: commentId } = await params;
  const admin = createAdminSupabase();

  const { data: comment } = await admin
    .from('task_comments')
    .select('id, user_id, company_id')
    .eq('id', commentId)
    .maybeSingle();

  if (!comment) return NextResponse.json({ error: 'Comment not found.' }, { status: 404 });

  const { data: membership } = await admin
    .from('company_users')
    .select('id, app_user_id, role_id, roles(name)')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', comment.company_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const roleName = (membership.roles as { name?: string } | null)?.name ?? '';
  const isAdmin = roleName === 'admin' || roleName === 'owner';
  const isOwner = comment.user_id === membership.app_user_id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 });
  }

  const { error } = await admin.from('task_comments').delete().eq('id', commentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
