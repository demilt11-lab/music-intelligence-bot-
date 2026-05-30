// lib/platform/rate-limit.ts
import type { RequestContext } from './context';

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
): Promise<void> {
  // Implement using Redis/Upstash/etc. later.
  // For now, this is a no-op hook.
  return;
}
