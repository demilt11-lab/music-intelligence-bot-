// app/api/v1/songwriters/[id]/catalog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { getCatalogWithStatsAndCharts } from '@/lib/songwriters/service';

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'songwriters:catalog:read');

    await enforceRateLimit(
      ctx,
      `tenant:${ctx.tenantId}:songwriters:catalog`,
    );

    const songwriterId = Number(params.id);
    if (!Number.isFinite(songwriterId)) {
      return NextResponse.json(
        { error: 'Invalid songwriter id' },
        { status: 400 },
      );
    }

    const url = new URL(req.url);
    const limit = Math.min(
      Number(url.searchParams.get('limit') ?? '50'),
      100,
    );
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const catalog = await getCatalogWithStatsAndCharts({
      songwriterId,
      limit,
      offset,
    });

    const res = NextResponse.json({ obj: catalog }, { status: 200 });
    await logRequest(
      ctx,
      '/api/v1/songwriters/[id]/catalog',
      'GET',
      200,
      startedAt,
    );
    return res;
  } catch (err: any) {
    const status = err.status || 500;
    const message =
      status === 500 ? 'Internal server error' : err.message ?? 'Error';

    if (ctx) {
      await logRequest(
        ctx,
        '/api/v1/songwriters/[id]/catalog',
        'GET',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
