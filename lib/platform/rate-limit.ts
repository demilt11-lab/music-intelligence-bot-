// lib/platform/rate-limit.ts
import type { RequestContext } from './context';
import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_URL,
        token: process.env.UPSTASH_REDIS_TOKEN,
      })
    : null;

if (!redis && process.env.NODE_ENV === 'production') {
  // Loud on purpose: an unconfigured limiter used to fail open (allow all
  // traffic) with no signal anywhere that it happened. It now falls back to a
  // real, if weaker, per-instance limiter instead — but this should still be
  // fixed by provisioning UPSTASH_REDIS_URL/UPSTASH_REDIS_TOKEN.
  console.warn(
    '[rate-limit] UPSTASH_REDIS_URL/UPSTASH_REDIS_TOKEN not set in production — ' +
      'using a per-instance in-memory limiter (resets on cold start, not shared ' +
      'across serverless instances). Provision Upstash for a real distributed limit.',
  );
}

// Fallback bucket for when Redis isn't configured. Bounded so a flood of
// distinct keys can't grow this unboundedly on a long-lived instance.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_MEMORY_BUCKETS = 50_000;

function incrementMemoryBucket(key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    if (memoryBuckets.size >= MAX_MEMORY_BUCKETS) memoryBuckets.clear();
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

async function incrementBucket(key: string, windowMs: number): Promise<number> {
  if (!redis) return incrementMemoryBucket(key, windowMs);

  const windowSeconds = Math.ceil(windowMs / 1000);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count;
}

/**
 * Rate-limit by an arbitrary caller-supplied key — for callers that don't
 * have a resolved API-key tenant context (pre-auth login attempts) or that
 * are first-party session routes rather than tenant-scoped API callers.
 * Backed by Upstash when configured; degrades to a real (not allow-all)
 * in-memory limiter otherwise.
 */
export async function enforceKeyedRateLimit(
  key: string,
  bucket: string,
  maxTokens: number,
  windowMs = 60_000,
): Promise<void> {
  const windowKey = Math.floor(Date.now() / windowMs);
  const count = await incrementBucket(`${bucket}:${key}:w:${windowKey}`, windowMs);

  if (count > maxTokens) {
    const err: any = new Error('Rate limit exceeded');
    err.status = 429;
    throw err;
  }
}

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
  maxTokens = 1000,
  windowMs = 60_000,
): Promise<void> {
  await enforceKeyedRateLimit(`tenant:${ctx.tenantId}`, bucket, maxTokens, windowMs);
}
