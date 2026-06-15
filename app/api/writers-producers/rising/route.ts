// app/api/writers-producers/rising/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { getRisingWritersProducers } from '@/lib/writersProducers/service';
import { Cache, TTL } from '@/lib/cache';

const ENDPOINT = '/api/writers-producers/rising';
const VALID_TYPES = new Set(['writer', 'producer', 'both', 'all']);

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'songwriters:catalog:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:writers-producers:rising`);

    const url = new URL(req.url);
    const typeParam = url.searchParams.get('type') ?? 'all';
    const type = VALID_TYPES.has(typeParam)
      ? (typeParam as 'writer' | 'producer' | 'both' | 'all')
      : 'all';
    const region = (url.searchParams.get('region') ?? 'GLOBAL').toUpperCase();
    const unsignedOnly = url.searchParams.get('unsigned') === '1';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100);
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const cacheKey = `writers-producers:rising:${ctx.tenantId}:${type}:${region}:${unsignedOnly}:${limit}:${offset}`;
    const cached = Cache.get<object>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'x-cache': 'hit' } });
    }

    const rising = await getRisingWritersProducers({
      type,
      region,
      unsignedOnly,
      limit,
      offset,
    });

    const payload = {
      obj: rising,
      meta: { type, region, unsignedOnly, limit, offset, count: rising.length },
    };

    Cache.set(cacheKey, payload, TTL.MEDIUM);

    const res = NextResponse.json(payload, { status: 200 });
    await logRequest(ctx, ENDPOINT, 'GET', 200, startedAt);
    return res;
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const status = e.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (e.message ?? 'Error');
    if (ctx) await logRequest(ctx, ENDPOINT, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
