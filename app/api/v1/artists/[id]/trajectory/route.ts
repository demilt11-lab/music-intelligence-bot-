import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';
import { predictArtistBatch } from '@/lib/ml/models/artist-trajectory';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  const params = await props.params;
  const startedAt = Date.now();
  let ctx;
  const endpoint = '/api/v1/artists/[id]/trajectory';

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'artists:trajectory:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:artists:trajectory`);

    const artistId = Number(params.id);

    const [artist, snapshot, history] = await Promise.all([
      db.artist.findUnique({ where: { id: artistId } }),
      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: 'desc' },
      }),
      db.artistDailyStats.findMany({
        where: { artistId: BigInt(artistId) },
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
        where: { trackArtists: { some: { artistId: artistId } } },
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

      // Served by the in-process TS model (lib/ml/models/artist-trajectory) —
      // trained and deployed as part of this app, not a separate Python
      // service. predictArtistBatch always returns a result, falling back to
      // the same rule-based heuristic the ETL uses when no model has been
      // trained yet; only expose it here as `mlPrediction` when it's a real
      // model output (source==='ml'), consistent with never presenting a
      // heuristic as if it were a model prediction.
      const [prediction] = await predictArtistBatch([
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
      ]);

      if (prediction?.source === 'ml') {
        mlPrediction = {
          status: prediction.status,
          breakProbability: prediction.breakProbability,
          modelName: prediction.modelName,
          modelVersion: String(prediction.modelVersion),
        };
      }
    }

    const obj = {
      artist: {
        id: artist.id.toString(),
        name: artist.name,
        country: artist.country ?? null,
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
      history: history.map((h: any) => ({
        date: h.date,
        totalStreams: h.totalStreams.toString(),
        totalListeners: h.totalListeners?.toString() ?? null,
        totalFollowers: h.totalFollowers?.toString() ?? null,
        playlistCount: h.playlistCount ?? null,
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
