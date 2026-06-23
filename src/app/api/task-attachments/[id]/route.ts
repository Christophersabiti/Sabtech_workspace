import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

const BUCKET = 'task-attachments';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: attachmentId } = await params;
  const admin = createAdminSupabase();

  const { data: attachment } = await admin
    .from('task_attachments')
    .select('id, uploaded_by, company_id, type, storage_path')
    .eq('id', attachmentId)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });

  const { data: membership } = await admin
    .from('company_users')
    .select('id, app_user_id, role_id, roles(name)')
    .eq('auth_user_id', session.user.id)
    .eq('company_id', attachment.company_id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const roleName = (membership.roles as { name?: string } | null)?.name ?? '';
  const isAdmin  = roleName === 'admin' || roleName === 'owner';
  const isOwner  = attachment.uploaded_by === membership.app_user_id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'You can only delete your own attachments.' }, { status: 403 });
  }

  // Remove from storage first (best-effort — don't block on failure)
  if (attachment.type === 'file' && attachment.storage_path) {
    await admin.storage.from(BUCKET).remove([attachment.storage_path]);
  }

  const { error } = await admin.from('task_attachments').delete().eq('id', attachmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
