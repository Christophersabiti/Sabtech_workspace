import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

const BUCKET = 'task-attachments';
const SIGNED_URL_EXPIRY = 3600;

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  const privatePatterns = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^fc00:/i,
    /^fe80:/i,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

async function fetchLinkMetadata(rawUrl: string): Promise<{
  link_title: string | null;
  link_domain: string;
  link_favicon_url: string | null;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { link_title: null, link_domain: rawUrl, link_favicon_url: null };
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    return { link_title: null, link_domain: parsed.hostname, link_favicon_url: null };
  }

  if (isPrivateHost(parsed.hostname)) {
    return { link_title: null, link_domain: parsed.hostname, link_favicon_url: null };
  }

  const domain     = parsed.hostname;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SabtechBot/1.0 (+link-preview)' },
      redirect: 'follow',
    });
    clearTimeout(timer);

    const html     = await res.text();
    const ogTitle  = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    return { link_title: ogTitle ?? titleTag ?? null, link_domain: domain, link_favicon_url: faviconUrl };
  } catch {
    return { link_title: null, link_domain: domain, link_favicon_url: faviconUrl };
  }
}

async function verifyMembership(admin: ReturnType<typeof createAdminSupabase>, authUserId: string, companyId: string) {
  const { data } = await admin
    .from('company_users')
    .select('id, app_user_id')
    .eq('auth_user_id', authUserId)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();
  return data;
}

// ─── GET /api/raid-attachments?raidId=&companyId= ────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raidId    = searchParams.get('raidId');
  const companyId = searchParams.get('companyId');

  if (!raidId || !companyId) {
    return NextResponse.json({ error: 'raidId and companyId are required.' }, { status: 400 });
  }

  const admin      = createAdminSupabase();
  const membership = await verifyMembership(admin, session.user.id, companyId);
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error } = await admin
    .from('raid_attachments')
    .select('id, type, display_name, file_name, file_size, mime_type, storage_path, url, link_title, link_domain, link_favicon_url, created_at, uploaded_by')
    .eq('raid_id', raidId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (rows ?? []).map(async (row) => {
      if (row.type === 'file' && row.storage_path) {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRY);
        return { ...row, signed_url: signed?.signedUrl ?? null };
      }
      return { ...row, signed_url: null };
    }),
  );

  return NextResponse.json({ attachments: enriched });
}

// ─── POST /api/raid-attachments ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { raidId, companyId, type, url, displayName, fileName, fileSize, mimeType, storagePath } = body as {
    raidId?: string;
    companyId?: string;
    type?: string;
    url?: string;
    displayName?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    storagePath?: string;
  };

  if (!raidId || !companyId || !type) {
    return NextResponse.json({ error: 'raidId, companyId, and type are required.' }, { status: 400 });
  }
  if (type !== 'file' && type !== 'link') {
    return NextResponse.json({ error: 'type must be file or link.' }, { status: 400 });
  }
  if (type === 'link' && !url?.trim()) {
    return NextResponse.json({ error: 'url is required for link attachments.' }, { status: 400 });
  }
  if (type === 'file' && (!fileName || !storagePath)) {
    return NextResponse.json({ error: 'fileName and storagePath are required for file attachments.' }, { status: 400 });
  }

  const admin      = createAdminSupabase();
  const membership = await verifyMembership(admin, session.user.id, companyId);
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let insertData: Record<string, unknown>;

  if (type === 'link') {
    const meta = await fetchLinkMetadata(url!.trim());
    insertData = {
      company_id:       companyId,
      raid_id:          raidId,
      uploaded_by:      membership.app_user_id,
      type:             'link',
      display_name:     displayName?.trim() || meta.link_title || url,
      url:              url!.trim(),
      link_title:       meta.link_title,
      link_domain:      meta.link_domain,
      link_favicon_url: meta.link_favicon_url,
    };
  } else {
    insertData = {
      company_id:   companyId,
      raid_id:      raidId,
      uploaded_by:  membership.app_user_id,
      type:         'file',
      display_name: displayName?.trim() || fileName,
      file_name:    fileName,
      file_size:    fileSize ?? null,
      mime_type:    mimeType ?? null,
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
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, SIGNED_URL_EXPIRY);
    return NextResponse.json({ attachment: { ...attachment, signed_url: signed?.signedUrl ?? null } }, { status: 201 });
  }

  return NextResponse.json({ attachment: { ...attachment, signed_url: null } }, { status: 201 });
}
