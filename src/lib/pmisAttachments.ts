import type { SupabaseClient } from '@supabase/supabase-js';

export const ATTACHMENT_BUCKET = 'task-attachments';
export const ATTACHMENT_SIGNED_URL_EXPIRY = 3600;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_LINK_URL_LENGTH = 2048;

export type AttachmentMembership = {
  id: string;
  app_user_id: string | null;
};

export function normalizeAttachmentStoragePath(path: unknown): string | null {
  if (typeof path !== 'string') return null;

  const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');

  if (!normalized || parts.length < 4) return null;
  if (parts.some(part => part === '' || part === '.' || part === '..')) return null;

  return normalized;
}

export function isExpectedAttachmentStoragePath(
  storagePath: string,
  companyId: string,
  folder: 'tasks' | 'raid',
  entityId: string,
) {
  const expectedPrefix = `${companyId}/${folder}/${entityId}/`;
  return storagePath.startsWith(expectedPrefix) && storagePath.length > expectedPrefix.length;
}

export function normalizeHttpUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_LINK_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost'
    || host === '0.0.0.0'
    || host === '::'
    || host === '::1'
    || (!host.includes('.') && !host.includes(':'))
  ) {
    return true;
  }

  const privatePatterns = [
    /^10\./,
    /^127\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^fc00:/i,
    /^fd[0-9a-f]{2}:/i,
    /^fe80:/i,
  ];

  return privatePatterns.some(pattern => pattern.test(host));
}

export async function fetchLinkMetadata(normalizedUrl: string): Promise<{
  link_title: string | null;
  link_domain: string;
  link_favicon_url: string | null;
}> {
  const parsed = new URL(normalizedUrl);
  const domain = parsed.hostname;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  if (isPrivateHost(domain)) {
    return { link_title: null, link_domain: domain, link_favicon_url: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'SabtechBot/1.0 (+link-preview)',
      },
      redirect: 'error',
    });

    if (!res.ok) {
      return { link_title: null, link_domain: domain, link_favicon_url: faviconUrl };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('html')) {
      return { link_title: null, link_domain: domain, link_favicon_url: faviconUrl };
    }

    const html = (await res.text()).slice(0, 100_000);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    return {
      link_title: ogTitle ?? titleTag ?? null,
      link_domain: domain,
      link_favicon_url: faviconUrl,
    };
  } catch {
    return { link_title: null, link_domain: domain, link_favicon_url: faviconUrl };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyCompanyMembership(
  admin: SupabaseClient,
  authUserId: string,
  companyId: string,
): Promise<AttachmentMembership | null> {
  const { data } = await admin
    .from('company_users')
    .select('id, app_user_id')
    .eq('auth_user_id', authUserId)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle();

  return (data as AttachmentMembership | null) ?? null;
}

export async function taskBelongsToCompany(
  admin: SupabaseClient,
  taskId: string,
  companyId: string,
) {
  const { data } = await admin
    .from('project_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('company_id', companyId)
    .maybeSingle();

  return Boolean(data);
}

export async function raidEntryBelongsToCompany(
  admin: SupabaseClient,
  raidId: string,
  companyId: string,
) {
  const { data } = await admin
    .from('raid_log')
    .select('id')
    .eq('id', raidId)
    .eq('company_id', companyId)
    .maybeSingle();

  return Boolean(data);
}
