// jobs/etl/ugcTracks.ts

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

export async function runUgcTrackEtl(referenceDate?: string) {
  // 1) Determine date (use yesterday by default)
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setUTCDate(date.getUTCDate() - 7);
  const prevSevenDaysAgo = new Date(sevenDaysAgo);
  prevSevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  // 2) Pull TikTok per-day stats; assume you have tiktok_track_chart_breakout_daily
  const currentWindow = await db.tiktok_track_chart_breakout_daily.groupBy({
    by: ['linked_track_id', 'code2'],
    where: {
      source_date: {
        gte: sevenDaysAgo,
        lt: date,
      },
    },
    _sum: {
      videos: true,
      views: true,
    },
  });

  const previousWindow = await db.tiktok_track_chart_breakout_daily.groupBy({
    by: ['linked_track_id', 'code2'],
    where: {
      source_date: {
        gte: prevSevenDaysAgo,
        lt: sevenDaysAgo,
      },
    },
    _sum: {
      videos: true,
      views: true,
    },
  });

  const prevKey = new Map<string, { videos: number; views: bigint }>();
  previousWindow.forEach((row) => {
    const key = `${row.linked_track_id}:${row.code2}`;
    prevKey.set(key, {
      videos: Number(row._sum.videos ?? 0),
      views: BigInt(row._sum.views ?? 0n),
    });
  });

  // 3) Latest rank for rankDelta
  const latestRanks = await db.tiktok_track_chart_breakout.findMany({
    where: {
      source_date: date,
    },
  });

  const rankByKey = new Map<string, number>();
  latestRanks.forEach((row) => {
    const key = `${row.linked_track_id}:${row.code2}`;
    rankByKey.set(key, row.rank ?? 0);
  });

  // 4) Insert/update UgcTrackMetrics
  for (const row of currentWindow) {
    const key = `${row.linked_track_id}:${row.code2}`;
    const prev = prevKey.get(key);

    const videos7d = Number(row._sum.videos ?? 0);
    const views7d = BigInt(row._sum.views ?? 0n);

    const videosPrev = prev?.videos ?? 0;
    const viewsPrev = prev?.views ?? 0n;

    const videosGrowth =
      videosPrev > 0 ? ((videos7d - videosPrev) / videosPrev) * 100 : 0;
    const viewsGrowth =
      viewsPrev > 0
        ? ((Number(views7d - viewsPrev) / Number(viewsPrev)) * 100)
        : 0;

    const rank = rankByKey.get(key) ?? 0;

    await db.ugcTrackMetrics.upsert({
      where: {
        trackId_code2_date: {
          trackId: row.linked_track_id ?? 0,
          code2: row.code2,
          date,
        },
      },
      update: {
        videos7d,
        videos7dGrowth: videosGrowth,
        views7d,
        views7dGrowth: viewsGrowth,
        rankDelta7d: rank, // you can compute delta vs earlier rank if stored
      },
      create: {
        trackId: row.linked_track_id ?? 0,
        code2: row.code2,
        date,
        videos7d,
        videos7dGrowth: videosGrowth,
        views7d,
        views7dGrowth: viewsGrowth,
        rankDelta7d: rank,
      },
    });
  }
}
