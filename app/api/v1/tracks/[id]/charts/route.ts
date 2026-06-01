// app/api/v1/tracks/[id]/charts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { getTrackChartAppearances } from '@/lib/tracks/charts/service';
import { validateTrackChartParams } from '@/lib/tracks/charts/validate';

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'tracks:charts:read');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:tracks:charts`);

    const trackId = Number(params.id);
    if (!Number.isFinite(trackId)) {
      return NextResponse.json(
        { error: 'Invalid track id' },
        { status: 400 },
      );
    }

    const url = new URL(req.url);
    const validatedParams = validateTrackChartParams(
      String(trackId),
      url.searchParams.get('chartType') ?? 'spotify',
      url.searchParams,
    );
    const charts = await getTrackChartAppearances(validatedParams);

    const res = NextResponse.json({ obj: charts }, { status: 200 });
    await logRequest(
      ctx,
      '/api/v1/tracks/[id]/charts',
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
        '/api/v1/tracks/[id]/charts',
        'GET',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
