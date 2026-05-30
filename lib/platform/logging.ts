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

  // optional: wrap in try/catch so logging never breaks requests
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
    // swallow
  }
}
