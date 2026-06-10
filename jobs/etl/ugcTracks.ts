// jobs/etl/ugcTracks.ts
//
// Recomputes UgcTrackMetrics (7-day TikTok UGC momentum per track) from
// TrackPlatformStatsDaily rows written by jobs/ingest/tiktok.ts. The ingest
// job also writes UgcTrackMetrics directly for the tracks it touches; this
// ETL exists to rebuild/backfill the aggregate for a given date from the
// raw daily stats (e.g. after a partial ingest failure).
//
// Country granularity: TrackPlatformStatsDaily is not segmented by country,
// so rows produced here use code2 = 'GLOBAL'.
import { db } from '@/lib/db';

const GLOBAL = 'GLOBAL';

type WindowAgg = { videos: number; views: bigint };

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** BigInt-safe percent growth ((curr - prev) / prev * 100). */
export function pctGrowth(curr: bigint, prev: bigint): number {
  if (prev <= 0n) return 0;
  // Scale by 10000 before division to keep two decimal places of precision.
  return Number(((curr - prev) * 10_000n) / prev) / 100;
}

async function aggregateWindow(gte: Date, lt: Date): Promise<Map<number, WindowAgg>> {
  const rows = await db.trackPlatformStatsDaily.groupBy({
    by: ['trackId'],
    where: {
      platform: 'tiktok',
      date: { gte, lt },
    },
    _sum: { videoViews: true, shares: true },
    _count: { _all: true },
  });

  const out = new Map<number, WindowAgg>();
  for (const r of rows) {
    out.set(r.trackId, {
      // One row per (track, day); row count approximates active UGC days.
      // Real "videos created" lives in UgcTrackMetrics written at ingest
      // time — this recompute uses the daily stat count as the fallback.
      videos: r._count._all,
      views: r._sum.videoViews ?? 0n,
    });
  }
  return out;
}

export async function runUgcTrackEtl(referenceDate?: string) {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error(`Invalid reference date: ${referenceDate}`);
  }
  const date = utcDateOnly(today);
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setUTCDate(date.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(sevenDaysAgo);
  fourteenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const [currentWindow, previousWindow] = await Promise.all([
    aggregateWindow(sevenDaysAgo, date),
    aggregateWindow(fourteenDaysAgo, sevenDaysAgo),
  ]);

  let written = 0;

  for (const [trackId, agg] of currentWindow.entries()) {
    const prev = previousWindow.get(trackId);

    const videos7d = agg.videos;
    const views7d = agg.views;
    const videosPrev = prev?.videos ?? 0;
    const viewsPrev = prev?.views ?? 0n;

    const videos7dGrowth =
      videosPrev > 0 ? ((videos7d - videosPrev) / videosPrev) * 100 : 0;
    const views7dGrowth = pctGrowth(views7d, viewsPrev);

    await db.ugcTrackMetrics.upsert({
      where: {
        trackId_code2_date: { trackId, code2: GLOBAL, date },
      },
      update: {
        videos7d,
        videos7dGrowth,
        views7d,
        views7dGrowth,
        rankDelta7d: 0,
      },
      create: {
        trackId,
        code2: GLOBAL,
        date,
        videos7d,
        videos7dGrowth,
        views7d,
        views7dGrowth,
        rankDelta7d: 0,
      },
    });
    written++;
  }

  console.log(
    `[ugc-etl] date=${date.toISOString().slice(0, 10)} tracks=${currentWindow.size} written=${written}`,
  );
  return { tracks: currentWindow.size, written };
}

if (require.main === module) {
  runUgcTrackEtl(process.argv[2])
    .then(({ written }) => {
      console.log(`UgcTrackMetrics ETL complete (${written} rows)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
