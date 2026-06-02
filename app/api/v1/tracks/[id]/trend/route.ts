import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';

type RouteParams = { params: { id: string } };

const endpoint = '/api/v1/tracks/[id]/trend';

export async function GET(req: NextRequest, { params }: RouteParams) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'tracks:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:tracks:trend`);

    const trackId = Number(params.id);
    if (!Number.isFinite(trackId)) {
      return NextResponse.json({ error: 'Invalid track id' }, { status: 400 });
    }

    const [prediction, label] = await Promise.all([
      db.trackTrendPrediction.findFirst({
        where: { trackId },
        orderBy: { predictedAt: 'desc' },
      }),
      db.trackTrendLabel.findFirst({
        where: { trackId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!prediction && !label) {
      await logRequest(ctx, endpoint, 'GET', 404, startedAt);
      return NextResponse.json(
        { error: 'No trend data found for this track' },
        { status: 404 },
      );
    }

    const obj = {
      trackId,
      prediction: prediction
        ? {
            label: prediction.label,
            probViral: prediction.probViral,
            probTrending: prediction.probTrending,
            probPopular: prediction.probPopular,
            probNone: prediction.probNone,
            modelName: prediction.modelName,
            modelVersion: prediction.modelVersion,
            predictedAt: prediction.predictedAt,
          }
        : null,
      label: label
        ? {
            label: label.label,
            createdAt: label.createdAt,
          }
        : null,
    };

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj }, { status: 200 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
