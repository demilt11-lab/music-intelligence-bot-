// lib/platform/logging.ts
import { db } from '@/lib/db';
import type { RequestContext } from './context';

export async function logRequest(
  ctx: RequestContext,
  endpoint: string,
  method: string,
  statusCode: number,
  startedAt: number,
) {
  const latencyMs = Date.now() - startedAt;

  try {
    await db.requestLog.create({
      data: {
        tenantId: ctx.tenantId,
        endpoint,
        method,
        statusCode,
        latencyMs,
      },
    });
  } catch {
    // logging should never break API responses
  }
}
