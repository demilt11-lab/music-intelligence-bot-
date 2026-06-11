// app/api/v1/tracks/[id]/trajectory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { buildViralFeatures } from '@/lib/features/viral';
import { aggregateTrajectory } from '@/lib/features/trajectory';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'tracks:trajectory:read');

    await enforceRateLimit(
      ctx,
      `tenant:${ctx.tenantId}:tracks:trajectory`,
    );

    const trackId = Number(params.id);
    if (!Number.isFinite(trackId)) {
      return NextResponse.json(
        { error: 'Invalid track id' },
        { status: 400 },
      );
    }

    const features = await buildViralFeatures(trackId);
    const trajectory = aggregateTrajectory(features);

    const res = NextResponse.json(
      { obj: trajectory },
      { status: 200 },
    );

    await logRequest(
      ctx,
      '/api/v1/tracks/[id]/trajectory',
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
        '/api/v1/tracks/[id]/trajectory',
        'GET',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
