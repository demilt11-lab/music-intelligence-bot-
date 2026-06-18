/**
 * POST /api/v1/artist/trajectory/predict
 *
 * Runs the artist trajectory ML model in-process (no external Python service).
 * Falls back to rule-based classification if no trained model exists yet.
 *
 * Auth: INTERNAL_ADMIN_SECRET bearer token.
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { requireInternalAuth } from '@/lib/platform/internal-auth';
import { predictArtistBatch } from '@/lib/ml/models/artist-trajectory';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const denied = requireInternalAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const artistIds: number[] = body.artistIds;
    if (!Array.isArray(artistIds) || !artistIds.length) {
      return NextResponse.json({ error: 'artistIds required' }, { status: 400 });
    }

    // Fetch latest trajectory snapshot features for these artists
    const snapshots = await db.artistTrajectorySnapshot.findMany({
      where: { artistId: { in: artistIds } },
      orderBy: { date: 'desc' },
      distinct: ['artistId'],
    });

    if (!snapshots.length) {
      return NextResponse.json({ obj: [] }, { status: 200 });
    }

    // For each snapshot, compute maxTrackProbViral from recent track predictions
    const items = await Promise.all(
      snapshots.map(async (s) => {
        const artistId = Number(s.artistId);
        const tracks = await db.track.findMany({
          where: { trackArtists: { some: { artistId } } },
          orderBy: { releaseDate: 'desc' },
          take: 10,
          select: { id: true },
        });
        let maxTrackProbViral = s.maxTrackProbViral ?? 0;
        if (tracks.length) {
          const preds = await db.trackTrendPrediction.findMany({
            where: { trackId: { in: tracks.map((t) => t.id) } },
            select: { probViral: true },
          });
          for (const p of preds) {
            if (p.probViral > maxTrackProbViral) maxTrackProbViral = p.probViral;
          }
        }
        return {
          artist_id: artistId,
          streams7dDelta: s.streams7dDelta,
          streams28dDelta: s.streams28dDelta,
          streams90dDelta: s.streams90dDelta,
          playlistsDelta28d: s.playlistsDelta28d ?? 0,
          followersDelta28d: s.followersDelta28d ?? 0,
          tiktokVelocityScore: s.tiktokVelocityScore ?? 0,
          airplayVelocityScore: s.airplayVelocityScore ?? 0,
          maxTrackProbViral,
          spotifyBreakProb: s.spotifyBreakProb ?? 0,
          snapshotId: s.id,
        };
      }),
    );

    // Run in-process inference (ML model or rule-based fallback)
    const predictions = await predictArtistBatch(items);

    // Write predictions back to ArtistTrajectorySnapshot
    await Promise.all(
      predictions.map(async (pred, i) => {
        const snap = items[i];
        await db.artistTrajectorySnapshot.update({
          where: { id: snap.snapshotId },
          data: {
            status: pred.status,
            statusScore: pred.breakProbability,
            breakProbability: pred.breakProbability,
            spotifyModelName: pred.modelName,
          },
        });
      }),
    );

    return NextResponse.json({
      obj: predictions.map((p) => ({
        artistId: String(p.artistId),
        status: p.status,
        breakProbability: p.breakProbability,
        modelName: p.modelName,
        modelVersion: String(p.modelVersion),
        source: p.source,
      })),
    });
  } catch (err: any) {
    const errorId = randomUUID();
    logger.error(`[trajectory/predict] errorId=${errorId}:`, err?.message ?? err);
    return NextResponse.json({ error: 'Internal error', errorId }, { status: 500 });
  }
}
