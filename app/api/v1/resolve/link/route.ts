// app/api/v1/resolve/link/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { resolveLinkToTrack } from '@/lib/resolve/link';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'resolve:read');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:resolve:link`);

    const url = new URL(req.url);
    const link = url.searchParams.get('url');
    if (!link) {
      return NextResponse.json(
        { error: 'url query param is required' },
        { status: 400 },
      );
    }

    const result = await resolveLinkToTrack(link);

    if (!result) {
      return NextResponse.json(
        { error: 'Could not resolve link to track' },
        { status: 404 },
      );
    }

    const res = NextResponse.json({ obj: result }, { status: 200 });
    await logRequest(
      ctx,
      '/api/v1/resolve/link',
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
        '/api/v1/resolve/link',
        'GET',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
