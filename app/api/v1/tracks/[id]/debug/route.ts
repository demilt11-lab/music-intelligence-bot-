// app/api/v1/tracks/[id]/debug/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { tracksService } from '@/lib/tracks/service';
import { radioService } from '@/lib/radio';
import { db } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'tracks:debug:read');

    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:tracks:debug`);

    const trackId = Number(params.id);
    if (!Number.isFinite(trackId)) {
      return NextResponse.json(
        { error: 'Invalid track id' },
        { status: 400 },
      );
    }

    const track = await tracksService.getTrackById(trackId);
    const charts = await db.chartRow.findMany({
      where: { trackId },
      take: 20,
    });
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const airplayTotals = await radioService.getTrackAirplayTotals(
      { type: 'track', id: trackId, since, station: undefined, limit: 50 },
    );
    const broadcastMarkets = await radioService.getTrackBroadcastMarkets(
      { type: 'track', id: trackId, since },
    );

    const playlists = await db.playlistMembershipEvent.findMany({
      where: { trackId },
      take: 20,
    });

    const res = NextResponse.json(
      {
        obj: {
          track,
          charts,
          radio: { airplayTotals, broadcastMarkets },
          playlists,
        },
      },
      { status: 200 },
    );

    await logRequest(
      ctx,
      '/api/v1/tracks/[id]/debug',
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
        '/api/v1/tracks/[id]/debug',
        'GET',
        status,
        startedAt,
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}
