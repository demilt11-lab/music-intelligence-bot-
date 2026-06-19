// lib/platform/rate-limit.ts
import type { RequestContext } from './context';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

const redis =
  process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_URL,
        token: process.env.UPSTASH_REDIS_TOKEN,
      })
    : null;

if (!redis && process.env.NODE_ENV === 'production') {
  logger.warn('[rate-limit] UPSTASH_REDIS not configured — rate limiting is DISABLED for all v1 API endpoints');
}

async function incrementBucket(key: string, windowSeconds: number) {
  if (!redis) return { count: 0 };

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return { count };
}

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
  maxTokens = 1000,
  windowMs = 60_000,
): Promise<void> {
  if (!redis) {
    // If rate limiting is not configured, allow all.
    return;
  }

  const windowSeconds = Math.ceil(windowMs / 1000);
  const windowKey = Math.floor(Date.now() / windowMs);
  const key = `${bucket}:tenant:${ctx.tenantId}:w:${windowKey}`;

  const { count } = await incrementBucket(key, windowSeconds);

  if (count > maxTokens) {
    const err: any = new Error('Rate limit exceeded');
    err.status = 429;
    throw err;
  }
}
