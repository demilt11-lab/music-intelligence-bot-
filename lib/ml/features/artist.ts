/**
 * Extract artist-trajectory feature vectors from ArtistTrajectorySnapshot.
 *
 * Features mirror the Python model's FEATURE_COLS exactly so that any
 * historical snapshots (written by the rule-based ETL) can be used as
 * training data immediately.
 */
import { db } from '@/lib/db';

export const ARTIST_FEATURE_NAMES = [
  'streams7dDelta',
  'streams28dDelta',
  'streams90dDelta',
  'playlistsDelta28d',
  'followersDelta28d',
  'tiktokVelocityScore',
  'airplayVelocityScore',
  'maxTrackProbViral',
  'spotifyBreakProb',
] as const;

export type ArtistFeatureRow = {
  artistId: number;
  features: number[];
  label: string;  // DECLINING | STABLE | GROWING | ABOUT_TO_BREAK
};

/** Pull all historical snapshots (one per artist-date pair) as training rows. */
export async function extractArtistTrainingData(): Promise<ArtistFeatureRow[]> {
  const rows = await db.artistTrajectorySnapshot.findMany({
    where: {
      // Only include snapshots where the status was set (rule-based or prior ML)
      status: { not: undefined },
    },
    orderBy: { date: 'desc' },
    select: {
      artistId: true,
      status: true,
      streams7dDelta: true,
      streams28dDelta: true,
      streams90dDelta: true,
      playlistsDelta28d: true,
      followersDelta28d: true,
      tiktokVelocityScore: true,
      airplayVelocityScore: true,
      maxTrackProbViral: true,
      spotifyBreakProb: true,
    },
  });

  return rows.map((r) => ({
    artistId: Number(r.artistId),
    features: [
      r.streams7dDelta ?? 0,
      r.streams28dDelta ?? 0,
      r.streams90dDelta ?? 0,
      r.playlistsDelta28d ?? 0,
      r.followersDelta28d ?? 0,
      r.tiktokVelocityScore ?? 0,
      r.airplayVelocityScore ?? 0,
      r.maxTrackProbViral ?? 0,
      r.spotifyBreakProb ?? 0,
    ],
    label: r.status,
  }));
}

/**
 * Extract feature vector for a single artist's latest snapshot.
 * Returns null if no snapshot exists.
 */
export async function extractArtistFeatures(artistId: number): Promise<number[] | null> {
  const snap = await db.artistTrajectorySnapshot.findFirst({
    where: { artistId },
    orderBy: { date: 'desc' },
    select: {
      streams7dDelta: true,
      streams28dDelta: true,
      streams90dDelta: true,
      playlistsDelta28d: true,
      followersDelta28d: true,
      tiktokVelocityScore: true,
      airplayVelocityScore: true,
      maxTrackProbViral: true,
      spotifyBreakProb: true,
    },
  });
  if (!snap) return null;
  return [
    snap.streams7dDelta ?? 0,
    snap.streams28dDelta ?? 0,
    snap.streams90dDelta ?? 0,
    snap.playlistsDelta28d ?? 0,
    snap.followersDelta28d ?? 0,
    snap.tiktokVelocityScore ?? 0,
    snap.airplayVelocityScore ?? 0,
    snap.maxTrackProbViral ?? 0,
    snap.spotifyBreakProb ?? 0,
  ];
}

/**
 * Build feature vectors for a batch of artists using pre-fetched snapshot data.
 * Used by the predict route to avoid N+1 queries.
 */
export function buildArtistFeatureVector(snap: {
  streams7dDelta: number;
  streams28dDelta: number;
  streams90dDelta: number;
  playlistsDelta28d: number | null;
  followersDelta28d: number | null;
  tiktokVelocityScore: number | null;
  airplayVelocityScore: number | null;
  maxTrackProbViral: number | null;
  spotifyBreakProb: number | null;
}): number[] {
  return [
    snap.streams7dDelta,
    snap.streams28dDelta,
    snap.streams90dDelta,
    snap.playlistsDelta28d ?? 0,
    snap.followersDelta28d ?? 0,
    snap.tiktokVelocityScore ?? 0,
    snap.airplayVelocityScore ?? 0,
    snap.maxTrackProbViral ?? 0,
    snap.spotifyBreakProb ?? 0,
  ];
}
