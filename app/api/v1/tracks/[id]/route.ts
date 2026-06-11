import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'tracks:read');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:tracks`);

    const trackId = Number(params.id);
    if (!Number.isFinite(trackId)) {
      return NextResponse.json({ error: 'Invalid track id' }, { status: 400 });
    }

    const track = await db.track.findUnique({
      where: { id: trackId },
      include: { trackArtists: { include: { artist: true } }, externalIds: true },
    });

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const res = NextResponse.json({ obj: track }, { status: 200 });
    await logRequest(ctx, '/api/v1/tracks/[id]', 'GET', 200, startedAt);
    return res;
  } catch (err: any) {
    const status = err.status || 500;
    const message = status === 500 ? 'Internal server error' : err.message ?? 'Error';
    if (ctx) await logRequest(ctx, '/api/v1/tracks/[id]', 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
