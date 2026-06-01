import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';

type RouteParams = { params: { id: string } };

const ML_URL =
  process.env.ML_ARTIST_TRAJECTORY_URL ||
  'http://localhost:8000/v1/artist/trajectory/predict';

export async function GET(req: NextRequest, { params }: RouteParams) {
  const startedAt = Date.now();
  let ctx;
  const endpoint = '/api/v1/artists/[id]/trajectory';

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'artists:trajectory:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:artists:trajectory`);

    const artistId = BigInt(params.id);

    const [artist, snapshot, history] = await Promise.all([
      db.artists.findUnique({ where: { id: artistId } }),
      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: 'desc' },
      }),
      db.artistDailyStats.findMany({
        where: { artistId },
        orderBy: { date: 'asc' },
        take: 90,
      }),
    ]);

    if (!artist) {
      await logRequest(ctx, endpoint, 'GET', 404, startedAt);
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Pull latest ML prediction from the trajectory predict endpoint
    let mlPrediction: {
      status: string;
      breakProbability: number;
      modelName?: string;
      modelVersion?: string;
    } | null = null;

    if (snapshot) {
      const tracks = await db.track.findMany({
        where: { trackArtists: { some: { artistId } } },
        orderBy: { releaseDate: 'desc' },
        take: 10,
      });
      const trackIds = tracks.map((t) => t.id);
      let maxTrackProbViral = 0;
      if (trackIds.length) {
        const preds = await db.trackTrendPrediction.findMany({
          where: { trackId: { in: trackIds } },
        });
        for (const p of preds) {
          if (p.probViral > maxTrackProbViral) maxTrackProbViral = p.probViral;
        }
      }

      const mlRes = await fetch(ML_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              artist_id: Number(artistId),
              streams7dDelta: snapshot.streams7dDelta,
              streams28dDelta: snapshot.streams28dDelta,
              streams90dDelta: snapshot.streams90dDelta,
              playlistsDelta28d: snapshot.playlistsDelta28d ?? 0,
              followersDelta28d: snapshot.followersDelta28d ?? 0,
              tiktokVelocityScore: snapshot.tiktokVelocityScore ?? 0,
              airplayVelocityScore: snapshot.airplayVelocityScore ?? 0,
              maxTrackProbViral,
              spotifyBreakProb: snapshot.spotifyBreakProb ?? 0,
            },
          ],
        }),
      }).catch(() => null);

      if (mlRes?.ok) {
        const mlJson = await mlRes.json();
        const item = mlJson?.items?.[0];
        if (item) {
          mlPrediction = {
            status: item.status,
            breakProbability: item.breakProbability,
            modelName: item.modelName,
            modelVersion: item.modelVersion,
          };
        }
      }
    }

    const obj = {
      artist: {
        id: artist.id.toString(),
        name: artist.name,
        code2: artist.code2 ?? null,
      },
      snapshot: snapshot
        ? {
            date: snapshot.date,
            status: snapshot.status,
            statusScore: snapshot.statusScore,
            breakProbability: snapshot.breakProbability,
            streams7dDelta: snapshot.streams7dDelta,
            streams28dDelta: snapshot.streams28dDelta,
            streams90dDelta: snapshot.streams90dDelta,
            playlistsDelta28d: snapshot.playlistsDelta28d,
            followersDelta28d: snapshot.followersDelta28d,
            tiktokVelocityScore: snapshot.tiktokVelocityScore,
            airplayVelocityScore: snapshot.airplayVelocityScore,
            spotifyBreakProb: snapshot.spotifyBreakProb,
            primaryGenre: snapshot.primaryGenre,
            primaryCode2: snapshot.primaryCode2,
          }
        : null,
      mlPrediction,
      history: history.map((h) => ({
        date: h.date,
        totalStreams: h.totalStreams.toString(),
        streams7d: h.streams7d,
        streams28d: h.streams28d,
        streams90d: h.streams90d,
        playlistCount: h.playlistCount,
        followerCount: h.followerCount,
        playlistReach: h.playlistReach?.toString() ?? null,
      })),
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
