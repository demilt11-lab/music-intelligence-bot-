// app/api/v1/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { searchService } from '@/lib/search';
import { validateSearchParams } from '@/lib/search/validate';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'search:read');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:search`);

    const params = validateSearchParams(new URL(req.url).searchParams);

    const result = await searchService.search(params);

    const res = NextResponse.json({ obj: result.obj }, { status: 200 });
    await logRequest(ctx, '/api/v1/search', 'GET', 200, startedAt);
    return res;
  } catch (err: any) {
    const status = err.status || 500;
    const message =
      status === 500 ? 'Internal server error' : err.message ?? 'Error';

    if (ctx) {
      await logRequest(ctx, '/api/v1/search', 'GET', status, startedAt);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
