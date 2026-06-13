import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { logRequest } from '@/lib/platform/logging';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { listWatchlist, addWatchlistItem } from '@/lib/watchlist/service';

const endpoint = '/api/v1/watchlist';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:read');
    await enforceRateLimit(ctx, 'watchlist:read', 200);

    const items = await listWatchlist(ctx.tenantId);

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj: items, meta: { count: items.length } });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'watchlist:write');
    await enforceRateLimit(ctx, 'watchlist:write', 50);

    const body = await req.json() as { entityType?: string; entityId?: unknown };
    const { entityType, entityId } = body;

    if ((entityType !== 'track' && entityType !== 'artist') || !Number.isInteger(entityId)) {
      return NextResponse.json({ error: 'entityType must be track|artist, entityId must be an integer' }, { status: 400 });
    }

    const item = await addWatchlistItem(ctx.tenantId, entityType, entityId as number);

    await logRequest(ctx, endpoint, 'POST', 201, startedAt);
    return NextResponse.json({ obj: item }, { status: 201 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : err.message;
    if (ctx) await logRequest(ctx, endpoint, 'POST', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
