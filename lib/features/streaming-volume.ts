// lib/features/streaming-volume.ts
//
// Per-track streaming-volume evidence for a date window, drawn from the
// platforms that actually deliver daily series today:
//
//   spotify  — TrackPlatformStatsDaily.streams are daily deltas → SUM over
//              the window. (Populated only when a stream-count source like
//              Luminate is configured; Spotify's own API has no counts.)
//   youtube  — TrackPlatformStatsDaily.videoViews is a CUMULATIVE lifetime
//              counter snapshotted daily → views gained = max − min over the
//              window. A single snapshot in the window proves nothing about
//              the window, so it contributes 0 rather than a guess.
//
// Spotify wins when both exist for a track. Downstream label/genre ETLs use
// this so ML training targets can warm up from live sources instead of
// waiting on a stream-count subscription.
import { db } from '@/lib/db';

/**
 * Returns trackId → streaming volume (streams or views gained) inside
 * [gte, lt). Tracks with no positive evidence are absent from the map.
 */
export async function loadStreamingVolumeByTrack(
  gte: Date,
  lt: Date,
): Promise<Map<number, number>> {
  const [spotify, youtube] = await Promise.all([
    db.trackPlatformStatsDaily.groupBy({
      by: ['trackId'],
      where: { platform: 'spotify', date: { gte, lt } },
      _sum: { streams: true },
    }),
    db.trackPlatformStatsDaily.groupBy({
      by: ['trackId'],
      where: { platform: 'youtube', date: { gte, lt }, videoViews: { not: null } },
      _max: { videoViews: true },
      _min: { videoViews: true },
      _count: { _all: true },
    }),
  ]);

  const out = new Map<number, number>();

  for (const r of youtube) {
    const max = r._max.videoViews;
    const min = r._min.videoViews;
    if (max == null || min == null || r._count._all < 2) continue;
    const gained = Number(max - min);
    if (gained > 0) out.set(r.trackId, gained);
  }

  for (const r of spotify) {
    const streams = Number(r._sum.streams ?? 0n);
    if (streams > 0) out.set(r.trackId, streams);
  }

  return out;
}
