// lib/platform/rate-limit.ts
import type { RequestContext } from './context';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

async function evaluateLimit(
  _key: string,
  _maxTokens: number,
  _windowMs: number,
): Promise<RateLimitResult> {
  // TODO: plug in Redis/Upstash or Cloudflare KV.
  // For now, always allow.
  return {
    allowed: true,
    remaining: 999999,
    resetMs: Date.now() + 60_000,
  };
}

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
  maxTokens = 1000,
  windowMs = 60_000,
): Promise<void> {
  const key = `${bucket}`;
  const result = await evaluateLimit(key, maxTokens, windowMs);

  if (!result.allowed) {
    const err: any = new Error('Rate limit exceeded');
    err.status = 429;
    throw err;
  }
}
