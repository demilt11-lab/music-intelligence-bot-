import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { validateTikTokVideoChartParams } from '@/lib/charts/tiktok-videos/validate';
import { getTikTokVideoChart } from '@/lib/charts/tiktok-videos/service';
import { handleApiError } from '@/lib/shared/errors';

const endpoint = '/api/v1/charts/tiktok/videos';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'charts:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:charts:tiktok`);

    const params = validateTikTokVideoChartParams(req.nextUrl.searchParams);
    const result = await getTikTokVideoChart(params);

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
