import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_SIGNED_URL_EXPIRY,
  MAX_ATTACHMENT_BYTES,
  fetchLinkMetadata,
  isExpectedAttachmentStoragePath,
  normalizeAttachmentStoragePath,
  normalizeHttpUrl,
  raidEntryBelongsToCompany,
  verifyCompanyMembership,
} from '@/lib/pmisAttachments';

export const dynamic = 'force-dynamic';

type AttachmentPayload = {
  raidId?: unknown;
  companyId?: unknown;
  type?: unknown;
  url?: unknown;
  displayName?: unknown;
  fileName?: unknown;
  fileSize?: unknown;
  mimeType?: unknown;
  storagePath?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validateFileSize(value: unknown) {
  if (value == null) return { ok: true as const, fileSize: null };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false as const, error: 'fileSize must be a valid number.' };
  }
  if (value > MAX_ATTACHMENT_BYTES) {
    return { ok: false as const, error: 'File exceeds 100 MB limit.' };
  }
  return { ok: true as const, fileSize: value };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raidId = searchParams.get('raidId');
  const companyId = searchParams.get('companyId');

  if (!raidId || !companyId) {
    return NextResponse.json({ error: 'raidId and companyId are required.' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const membership = await verifyCompanyMembership(admin, session.user.id, companyId);
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const raidExists = await raidEntryBelongsToCompany(admin, raidId, companyId);
  if (!raidExists) return NextResponse.json({ error: 'RAID entry not found.' }, { status: 404 });

  const { data: rows, error } = await admin
    .from('raid_attachments')
    .select('id, type, display_name, file_name, file_size, mime_type, storage_path, url, link_title, link_domain, link_favicon_url, created_at, uploaded_by')
    .eq('raid_id', raidId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (rows ?? []).map(async (row) => {
      if (
        row.type === 'file'
        && row.storage_path
        && isExpectedAttachmentStoragePath(row.storage_path, companyId, 'raid', raidId)
      ) {
        const { data: signed } = await admin.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrl(row.storage_path, ATTACHMENT_SIGNED_URL_EXPIRY);
        return { ...row, signed_url: signed?.signedUrl ?? null };
      }
      return { ...row, signed_url: null };
    }),
  );

  return NextResponse.json({ attachments: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as AttachmentPayload;
  const raidId = cleanString(body.raidId);
  const companyId = cleanString(body.companyId);
  const type = cleanString(body.type);
  const displayName = cleanString(body.displayName);
  const fileName = cleanString(body.fileName);
  const mimeType = cleanString(body.mimeType);
  const fileSizeResult = validateFileSize(body.fileSize);

  if (!raidId || !companyId || !type) {
    return NextResponse.json({ error: 'raidId, companyId, and type are required.' }, { status: 400 });
  }
  if (type !== 'file' && type !== 'link') {
    return NextResponse.json({ error: 'type must be file or link.' }, { status: 400 });
  }
  if (!fileSizeResult.ok) {
    return NextResponse.json({ error: fileSizeResult.error }, { status: 400 });
  }

  const normalizedUrl = type === 'link' ? normalizeHttpUrl(body.url) : null;
  if (type === 'link' && !normalizedUrl) {
    return NextResponse.json({ error: 'A valid http or https url is required for link attachments.' }, { status: 400 });
  }

  const storagePath = type === 'file' ? normalizeAttachmentStoragePath(body.storagePath) : null;
  if (type === 'file') {
    if (!fileName || !storagePath) {
      return NextResponse.json({ error: 'fileName and storagePath are required for file attachments.' }, { status: 400 });
    }
    if (!isExpectedAttachmentStoragePath(storagePath, companyId, 'raid', raidId)) {
      return NextResponse.json({ error: 'storagePath does not match the RAID attachment location.' }, { status: 400 });
    }
  }

  const admin = createAdminSupabase();
  const membership = await verifyCompanyMembership(admin, session.user.id, companyId);
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const raidExists = await raidEntryBelongsToCompany(admin, raidId, companyId);
  if (!raidExists) return NextResponse.json({ error: 'RAID entry not found.' }, { status: 404 });

  let insertData: Record<string, unknown>;

  if (type === 'link') {
    const meta = await fetchLinkMetadata(normalizedUrl!);
    insertData = {
      company_id: companyId,
      raid_id: raidId,
      uploaded_by: membership.app_user_id,
      type: 'link',
      display_name: displayName || meta.link_title || normalizedUrl,
      url: normalizedUrl,
      link_title: meta.link_title,
      link_domain: meta.link_domain,
      link_favicon_url: meta.link_favicon_url,
    };
  } else {
    insertData = {
      company_id: companyId,
      raid_id: raidId,
      uploaded_by: membership.app_user_id,
      type: 'file',
      display_name: displayName || fileName,
      file_name: fileName,
      file_size: fileSizeResult.fileSize,
      mime_type: mimeType,
      storage_path: storagePath,
    };
  }

  const { data: attachment, error } = await admin
    .from('raid_attachments')
    .insert(insertData)
    .select('id, type, display_name, file_name, file_size, mime_type, storage_path, url, link_title, link_domain, link_favicon_url, created_at, uploaded_by')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (attachment.type === 'file' && attachment.storage_path) {
    const { data: signed } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storage_path, ATTACHMENT_SIGNED_URL_EXPIRY);
    return NextResponse.json({ attachment: { ...attachment, signed_url: signed?.signedUrl ?? null } }, { status: 201 });
  }

  return NextResponse.json({ attachment: { ...attachment, signed_url: null } }, { status: 201 });
}
