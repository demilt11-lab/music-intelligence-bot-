// lib/platform/rate-limit.ts
import type { RequestContext } from './context';

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
): Promise<void> {
  // Hook up Redis/Upstash/etc. later.
  // For now, this is a no-op to keep the API shape.
  return;
}
