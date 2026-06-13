import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';

const endpoint = '/api/v1/usage/summary';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'usage:read');

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);

    const [scoutCallCount, watchlistCount, alertCount] = await Promise.all([
      db.requestLog.count({
        where: {
          tenantId: ctx.tenantId,
          endpoint: { contains: 'talent-scout' },
          createdAt: { gte: since },
        },
      }),
      db.watchlistItem.count({ where: { tenantId: ctx.tenantId } }),
      db.alertRule.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
    ]);

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({
      obj: {
        tracksScoutedThisWeek: scoutCallCount,
        watchlistSize: watchlistCount,
        activeAlerts: alertCount,
        periodDays: 7,
      },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
