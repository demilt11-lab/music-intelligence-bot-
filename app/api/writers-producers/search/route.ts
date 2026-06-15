// app/api/writers-producers/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { searchWritersProducers } from '@/lib/writersProducers/service';
import { searchExternalPlatforms } from '@/lib/writersProducers/externalSearch';

const ENDPOINT = '/api/writers-producers/search';
const VALID_TYPES = new Set(['writer', 'producer', 'both', 'all']);
const ALL_PLATFORMS = ['spotify', 'youtube', 'soundcloud', 'blog'] as const;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'songwriters:catalog:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:writers-producers:search`);

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Missing query parameter: q' }, { status: 400 });
    }

    const typeParam = url.searchParams.get('type') ?? 'all';
    const type = VALID_TYPES.has(typeParam)
      ? (typeParam as 'writer' | 'producer' | 'both' | 'all')
      : 'all';

    const limit = Math.min(Number(url.searchParams.get('limit') ?? '30'), 100);
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const externalParam = url.searchParams.get('external') ?? '1';
    const includeExternal = externalParam !== '0';

    const platformsParam = url.searchParams.get('platforms');
    const platforms = platformsParam
      ? (platformsParam.split(',').filter((p) =>
          ALL_PLATFORMS.includes(p as (typeof ALL_PLATFORMS)[number]),
        ) as typeof ALL_PLATFORMS[number][])
      : [...ALL_PLATFORMS];

    const [dbResults, externalResults] = await Promise.all([
      searchWritersProducers({ q, type, limit, offset }),
      includeExternal ? searchExternalPlatforms(q, platforms) : Promise.resolve([]),
    ]);

    const res = NextResponse.json(
      {
        obj: {
          database: dbResults,
          external: externalResults,
          query: q,
          type,
          platforms,
        },
      },
      { status: 200 },
    );

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
