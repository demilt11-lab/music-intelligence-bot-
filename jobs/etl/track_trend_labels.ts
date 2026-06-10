// jobs/etl/track_trend_labels.ts
//
// Assigns a trend label (VIRAL / TRENDING / POPULAR / NONE) per track for a
// snapshot date, combining:
//   - Spotify stream growth (TrackPlatformStatsDaily, 7d vs prior 7d)
//   - UGC view growth (UgcTrackMetrics, latest 7d window vs the window 7d earlier)
//   - genre-level playlist base volume (GenrePlaylistMetrics)
//   - the viral score from TalentScoutScore
//
// Labels are stored on TrackTrendLabel and used downstream as ML training
// targets, so growth windows only ever look backward from the snapshot date.
import { db } from "@/lib/db";

function pctDelta(curr: number, prev: number): number {
  if (!prev || prev === 0) return 0;
  return (curr - prev) / prev;
}

export function classifyLabel(args: {
  streamsGrowth7d: number;
  ugcViewsGrowth7d: number;
  playlistStreams7d: number;
  viralScore: number;
}): string {
  const { streamsGrowth7d, ugcViewsGrowth7d, playlistStreams7d, viralScore } = args;

  // VIRAL: very high short-term growth, high UGC/viralScore
  if (
    streamsGrowth7d > 1.0 &&
    ugcViewsGrowth7d > 1.0 &&
    (viralScore > 0.7 || playlistStreams7d > 50_000)
  ) {
    return "VIRAL";
  }

  // TRENDING: moderate growth with some UGC or playlists
  if (
    streamsGrowth7d > 0.3 &&
    (ugcViewsGrowth7d > 0.2 || playlistStreams7d > 10_000 || viralScore > 0.4)
  ) {
    return "TRENDING";
  }

  // POPULAR: large base volume, even if growth is modest
  if (playlistStreams7d > 200_000 || viralScore > 0.8) {
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
        firstSeenAt: isNewlyActive && label !== "NONE" ? snapshotDate : snapshotDate,
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

  // 1) Spotify streams per track: trailing 7d vs prior 7d
  const sumWindow = (gte: Date, lt: Date) =>
    db.trackPlatformStatsDaily.groupBy({
      by: ["trackId"],
      where: { platform: "spotify", date: { gte, lt } },
      _sum: { streams: true },
    });

  const [currStreams, prevStreams] = await Promise.all([
    sumWindow(d7, snapshotDate),
    sumWindow(d14, d7),
  ]);

  const prevStreamsByTrack = new Map<number, number>(
    prevStreams.map((r) => [r.trackId, Number(r._sum.streams ?? 0n)]),
  );

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
      ...currStreams.map((r) => r.trackId),
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

  // 5) Viral scores at the snapshot date
  const talentRows = await db.talentScoutScore.findMany({
    where: { date: snapshotDate },
    select: { trackId: true, code2: true, viralScore: true },
  });
  const viralByTrack = new Map<string, number>();
  for (const t of talentRows) {
    viralByTrack.set(`${t.trackId}::${t.code2}`, t.viralScore);
  }

  // 6) Label every track with any signal this window
  const currStreamsByTrack = new Map<number, number>(
    currStreams.map((r) => [r.trackId, Number(r._sum.streams ?? 0n)]),
  );

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

    const viralScore =
      viralByTrack.get(`${trackId}::${code2 ?? "GLOBAL"}`) ??
      viralByTrack.get(`${trackId}::GLOBAL`) ??
      0;

    const label = classifyLabel({
      streamsGrowth7d: pctDelta(streams7d, prev7d),
      ugcViewsGrowth7d: pctDelta(ugcViews7d, ugcPrev7d),
      playlistStreams7d,
      viralScore,
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
  buildTrackTrendLabels(dateArg)
    .then(({ labeled }) => {
      console.log(`TrackTrendLabels built for ${dateArg} (${labeled} labels)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
