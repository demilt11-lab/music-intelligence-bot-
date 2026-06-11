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
  const endpoint = '/api/v1/artists/[id]';

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'artists:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:artists`);

    const artistId = Number(params.id);
    if (!Number.isFinite(artistId)) {
      return NextResponse.json({ error: 'Invalid artist id' }, { status: 400 });
    }

    const [artist, snapshot, externalIds] = await Promise.all([
      db.artist.findUnique({ where: { id: artistId } }),
      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: 'desc' },
      }),
      db.externalId.findMany({ where: { entityType: 'artist', entityId: artistId } }),
    ]);

    if (!artist) {
      await logRequest(ctx, endpoint, 'GET', 404, startedAt);
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const obj = {
      id: artist.id.toString(),
      name: artist.name,
      country: artist.country ?? null,
      externalIds: externalIds.reduce<Record<string, string[]>>((acc, e) => {
        if (!acc[e.platform]) acc[e.platform] = [];
        acc[e.platform].push(e.externalId);
        return acc;
      }, {}),
      trajectory: snapshot
        ? {
            status: snapshot.status,
            breakProbability: snapshot.breakProbability,
            statusScore: snapshot.statusScore,
            streams28dDelta: snapshot.streams28dDelta,
            playlistsDelta28d: snapshot.playlistsDelta28d,
            followersDelta28d: snapshot.followersDelta28d,
            tiktokVelocityScore: snapshot.tiktokVelocityScore,
            airplayVelocityScore: snapshot.airplayVelocityScore,
            primaryGenre: snapshot.primaryGenre,
            primaryCode2: snapshot.primaryCode2,
            date: snapshot.date,
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
