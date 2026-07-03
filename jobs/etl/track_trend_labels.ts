// jobs/etl/track_trend_labels.ts
//
// Assigns a trend label (VIRAL / TRENDING / POPULAR / NONE) per track for a
// snapshot date, combining:
//   - Streaming volume growth AND absolute volume (7d vs prior 7d) from
//     lib/features/streaming-volume: Spotify daily streams when a stream
//     source is configured, else YouTube views-gained — so labels warm up
//     from the sources that actually ingest today.
//   - UGC view growth (UgcTrackMetrics, latest 7d window vs the window 7d earlier)
//   - genre-level playlist base volume (GenrePlaylistMetrics)
//
// IMPORTANT: Labels must NOT use viralScore as an input — viralScore is computed
// by compute_track_signals.ts and used as a training feature by the ML model.
// Using it here would create a circular dependency: the model would learn to
// reproduce viralScore rather than predict breakouts from raw signals.
//
// Labels are stored on TrackTrendLabel and used downstream as ML training
// targets, so growth windows only ever look backward from the snapshot date.
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';
import { loadStreamingVolumeByTrack } from '@/lib/features/streaming-volume';

function pctDelta(curr: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return (curr - prev) / prev;
}

export function classifyLabel(args: {
  streamsGrowth7d: number;
  ugcViewsGrowth7d: number;
  playlistStreams7d: number;
  absoluteStreams7d: number;
}): string {
  const { streamsGrowth7d, ugcViewsGrowth7d, playlistStreams7d, absoluteStreams7d } = args;

  // VIRAL: very high short-term growth on BOTH streaming and UGC, plus some
  // critical mass (UGC doubling again or heavy playlist pull).
  // Thresholds are deliberately raw/observable — no derived scores allowed here.
  if (
    streamsGrowth7d > 1.0 &&
    ugcViewsGrowth7d > 1.0 &&
    (ugcViewsGrowth7d > 2.0 || playlistStreams7d > 50_000)
  ) {
    return "VIRAL";
  }

  // TRENDING: moderate stream growth with at least one confirming signal
  // (UGC momentum, playlist traction, or meaningful absolute volume).
  if (
    streamsGrowth7d > 0.3 &&
    (ugcViewsGrowth7d > 0.2 || playlistStreams7d > 10_000 || absoluteStreams7d > 100_000)
  ) {
    return "TRENDING";
  }

  // POPULAR: established catalog tracks with large absolute volume, even if
  // week-over-week growth is modest.
  if (playlistStreams7d > 200_000 || absoluteStreams7d > 5_000_000) {
    return "POPULAR";
  }

  return "NONE";
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBefore(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() - days);
  return out;
}

/**
 * Upsert that tolerates NULL genre/code2 (Prisma compound-unique `where`
 * cannot express NULL members, and Postgres treats NULLs as distinct).
 */
async function upsertTrendLabel(args: {
  trackId: number;
  genre: string | null;
  code2: string | null;
  label: string;
  snapshotDate: Date;
  isNewlyActive: boolean;
}) {
  const { trackId, genre, code2, label, snapshotDate, isNewlyActive } = args;

  const existing = await db.trackTrendLabel.findFirst({
    where: { trackId, genre, code2 },
    select: { id: true, firstSeenAt: true },
  });

  if (existing) {
    await db.trackTrendLabel.update({
      where: { id: existing.id },
      data: {
        label,
        firstSeenAt:
          existing.firstSeenAt ?? (label !== "NONE" ? snapshotDate : null),
        lastSeenAt: snapshotDate,
      },
    });
  } else {
    await db.trackTrendLabel.create({
      data: {
        trackId,
        genre,
        code2,
        label,
        firstSeenAt: isNewlyActive && label !== "NONE" ? snapshotDate : null,
        lastSeenAt: snapshotDate,
      },
    });
  }
}

export async function buildTrackTrendLabels(dateStr: string) {
  const snapshotDate = utcDateOnly(new Date(dateStr));
  if (Number.isNaN(snapshotDate.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  const d7 = daysBefore(snapshotDate, 7);
  const d14 = daysBefore(snapshotDate, 14);

  // 1) Streaming volume per track: trailing 7d vs prior 7d
  //    (Spotify streams preferred, YouTube views-gained fallback)
  const [currStreamsByTrack, prevStreamsByTrack] = await Promise.all([
    loadStreamingVolumeByTrack(d7, snapshotDate),
    loadStreamingVolumeByTrack(d14, d7),
  ]);

  // 2) UGC views per track+country: each UgcTrackMetrics row is already a
  //    rolling 7d window, so take the latest row at/before the snapshot and
  //    compare with the row 7 days earlier (no double counting).
  const ugcCurr = await db.ugcTrackMetrics.findMany({
    where: { date: { gt: d7, lte: snapshotDate } },
    orderBy: { date: "desc" },
  });
  const ugcPrev = await db.ugcTrackMetrics.findMany({
    where: { date: { gt: d14, lte: d7 } },
    orderBy: { date: "desc" },
  });

  type UgcAgg = { views7d: number; code2: string };
  const latestUgcByTrack = new Map<number, UgcAgg>();
  for (const row of ugcCurr) {
    if (!latestUgcByTrack.has(row.trackId)) {
      latestUgcByTrack.set(row.trackId, {
        views7d: Number(row.views7d),
        code2: row.code2,
      });
    }
  }
  const prevUgcByTrack = new Map<number, number>();
  for (const row of ugcPrev) {
    if (!prevUgcByTrack.has(row.trackId)) {
      prevUgcByTrack.set(row.trackId, Number(row.views7d));
    }
  }

  // 3) Genre per track (TrackTag category=genre, then existing trend label)
  const trackIds = Array.from(
    new Set([
      ...currStreamsByTrack.keys(),
      ...latestUgcByTrack.keys(),
    ]),
  );

  const genreByTrack = new Map<number, string>();
  if (trackIds.length) {
    const tagged = await db.trackTag.findMany({
      where: { trackId: { in: trackIds }, tag: { category: "genre" } },
      include: { tag: true },
    });
    for (const t of tagged) {
      if (!genreByTrack.has(t.trackId)) genreByTrack.set(t.trackId, t.tag.name);
    }
  }

  // 4) Genre-level playlist base volume at the snapshot date
  const playlistRows = await db.genrePlaylistMetrics.findMany({
    where: { date: snapshotDate },
    select: { genre: true, country: true, streams7d: true },
  });
  const playlistByGenre = new Map<string, number>();
  for (const p of playlistRows) {
    const key = `${p.genre}::${p.country}`;
    playlistByGenre.set(key, Number(p.streams7d));
  }

  // 5) Label every track with any signal this window
  let labeled = 0;
  for (const trackId of trackIds) {
    const streams7d = currStreamsByTrack.get(trackId) ?? 0;
    const prev7d = prevStreamsByTrack.get(trackId) ?? 0;

    const ugc = latestUgcByTrack.get(trackId);
    const ugcViews7d = ugc?.views7d ?? 0;
    const ugcPrev7d = prevUgcByTrack.get(trackId) ?? 0;
    const code2 = ugc?.code2 ?? null;
    const genre = genreByTrack.get(trackId) ?? null;

    const playlistStreams7d =
      playlistByGenre.get(`${genre ?? "Unknown"}::${code2 ?? "GLOBAL"}`) ??
      playlistByGenre.get(`${genre ?? "Unknown"}::GLOBAL`) ??
      0;

    const label = classifyLabel({
      streamsGrowth7d: pctDelta(streams7d, prev7d),
      ugcViewsGrowth7d: pctDelta(ugcViews7d, ugcPrev7d),
      playlistStreams7d,
      absoluteStreams7d: streams7d,
    });

    await upsertTrendLabel({
      trackId,
      genre,
      code2,
      label,
      snapshotDate,
      isNewlyActive: prev7d === 0,
    });
    labeled++;
  }

  console.log(
    `[track-trend-labels] date=${dateStr} tracks=${trackIds.length} labeled=${labeled}`,
  );
  return { tracks: trackIds.length, labeled };
}

if (require.main === module) {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error("Usage: tsx jobs/etl/track_trend_labels.ts YYYY-MM-DD");
    process.exit(1);
  }
  runTrackedJob('etl:track-trend-labels', () => buildTrackTrendLabels(dateArg))
    .then(({ labeled }) => {
      console.log(`TrackTrendLabels built for ${dateArg} (${labeled} labels)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
