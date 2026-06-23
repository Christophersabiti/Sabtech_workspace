import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import {
  ATTACHMENT_BUCKET,
  isExpectedAttachmentStoragePath,
} from '@/lib/pmisAttachments';

export const dynamic = 'force-dynamic';

function getRoleName(roles: unknown) {
  if (Array.isArray(roles)) {
    return typeof roles[0]?.name === 'string' ? roles[0].name : '';
  }
  if (roles && typeof roles === 'object' && 'name' in roles) {
    const name = (roles as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: attachmentId } = await params;
  const admin = createAdminSupabase();

  const { data: attachment } = await admin
    .from('raid_attachments')
    .select('id, uploaded_by, company_id, raid_id, type, storage_path')
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

  const roleName = getRoleName(membership.roles);
  const isAdmin = roleName === 'admin' || roleName === 'owner';
  const isOwner = attachment.uploaded_by === membership.app_user_id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'You can only delete your own attachments.' }, { status: 403 });
  }

  if (
    attachment.type === 'file'
    && attachment.storage_path
    && isExpectedAttachmentStoragePath(
      attachment.storage_path,
      attachment.company_id,
      'raid',
      attachment.raid_id,
    )
  ) {
    await admin.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
  }

  const { error } = await admin.from('raid_attachments').delete().eq('id', attachmentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
