import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { validateTikTokTypedTrackChartParams } from '@/lib/charts/tiktok-track-types/validate';
import { getTikTokTypedTrackChart } from '@/lib/charts/tiktok-track-types/service';
import { handleApiError } from '@/lib/shared/errors';

const endpoint = '/api/v1/charts/tiktok/tracks';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'charts:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:charts:tiktok`);

    const { searchParams } = req.nextUrl;
    const chartType = searchParams.get('chartType') ?? 'breakout';

    const chartParams = validateTikTokTypedTrackChartParams(searchParams, chartType);
    const result = await getTikTokTypedTrackChart(chartParams);

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    if (err.status === 401 || err.status === 403) {
      return NextResponse.json({ error: message }, { status });
    }
    return handleApiError(err);
  }
}
