// app/api/v1/tracks/[id]/debug/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { tracksService } from '@/lib/tracks/service';
import { radioService } from '@/lib/radio';
import { db } from '@/lib/db';

type RouteParams = { params: { id: string } };

export async function GET(req: NextRequest, { params }: RouteParams) {
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
    const charts = await db.trackChart.findMany({
      where: { trackId },
    });
    const airplayTotals = await radioService.getTrackAirplayTotals(
      trackId,
    );
    const broadcastMarkets =
      await radioService.getTrackBroadcastMarkets(trackId);

    const playlists = await db.playlistTrack.findMany({
      where: { trackId },
      include: { playlist: true },
    });

    const songwriters = await db.songwriterTrack.findMany({
      where: { trackId },
      include: { songwriter: true },
    });

    const res = NextResponse.json(
      {
        obj: {
          track,
          charts,
          radio: { airplayTotals, broadcastMarkets },
          playlists,
          songwriters,
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
