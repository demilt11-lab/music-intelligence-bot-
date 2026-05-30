// lib/platform/rate-limit.ts
import type { RequestContext } from './context';

export async function enforceRateLimit(
  ctx: RequestContext,
  bucket: string,
): Promise<void> {
  // Example bucket: `tenant:${ctx.tenantId}:search`
  // Implement with Redis or a SaaS later.
  return;
}
