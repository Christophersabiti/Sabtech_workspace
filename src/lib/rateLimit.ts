type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * In-process token bucket. Works for development and single-instance deployments.
 *
 * ⚠️  KNOWN LIMITATION: In Vercel serverless / edge environments each function
 * invocation may be a fresh cold-start, so the bucket Map resets and rate
 * limiting cannot be enforced across instances.
 *
 * TODO: Replace with a distributed store (Upstash Redis / Supabase pg rate-limit
 * function) before going multi-tenant in production.
 */
const buckets = new Map<string, Bucket>();

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many requests');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function assertRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  if (current.count >= options.limit) {
    throw new RateLimitError(Math.ceil((current.resetAt - now) / 1000));
  }

  current.count += 1;
}

export function getRequestIdentity(req: Request, userId?: string | null) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  return userId ?? forwardedFor ?? realIp ?? 'anonymous';
}
