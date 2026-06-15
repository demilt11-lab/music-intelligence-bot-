// jobs/etl/compute_track_signals.ts
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Robust normalization: divide by the 95th-percentile value rather than the
 * global maximum. This prevents a single outlier track from compressing every
 * other track's score toward zero, which is the failure mode of max-normalize.
 * Values above the 95th percentile are clamped to 1.
 */
function computeP95(values: number[]): number {
  if (!values.length) return 1;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)] || 1;
}

function robustNorm(value: number, p95: number): number {
  if (p95 <= 0) return 0;
  return clamp(value / p95, 0, 1);
}

// ─────────────────────────────────────────────
// Signal 1: Acceleration / Curve Shape
// ─────────────────────────────────────────────

type CurveShape = "HOCKEY_STICK" | "STEADY_CLIMB" | "PLATEAU" | "DECLINING";

type AccelerationResult = {
  accelerationScore: number; // clamped [-2, 2]
  currentGrowth: number;
  priorGrowth: number;
  curveShape: CurveShape;
  curveMultiplier: number;
};

async function computeAccelerationScores(
  today: Date,
): Promise<Map<number, AccelerationResult>> {
  const day7 = new Date(today);
  day7.setDate(today.getDate() - 7);
  const day14 = new Date(today);
  day14.setDate(today.getDate() - 14);
  const day21 = new Date(today);
  day21.setDate(today.getDate() - 21);

  // Current week: today-7d → today
  const currentRows = await db.$queryRawUnsafe<
    { track_id: number; views7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY "trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Prior week: today-14d → today-7d
  const priorRows = await db.$queryRawUnsafe<
    { track_id: number; views7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY "trackId"
    `,
    day14.toISOString().slice(0, 10),
    day7.toISOString().slice(0, 10),
  );

  // Week before prior: today-21d → today-14d
  const baseRows = await db.$queryRawUnsafe<
    { track_id: number; views7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY "trackId"
    `,
    day21.toISOString().slice(0, 10),
    day14.toISOString().slice(0, 10),
  );

  const currentMap = new Map<number, number>();
  for (const r of currentRows) {
    currentMap.set(r.track_id, Number(r.views7d));
  }

  const priorMap = new Map<number, number>();
  for (const r of priorRows) {
    priorMap.set(r.track_id, Number(r.views7d));
  }

  const baseMap = new Map<number, number>();
  for (const r of baseRows) {
    baseMap.set(r.track_id, Number(r.views7d));
  }

  const allTrackIds = new Set([
    ...currentMap.keys(),
    ...priorMap.keys(),
    ...baseMap.keys(),
  ]);

  const results = new Map<number, AccelerationResult>();

  for (const trackId of allTrackIds) {
    const current = currentMap.get(trackId) ?? 0;
    const prior = priorMap.get(trackId) ?? 0;
    const base = baseMap.get(trackId) ?? 0;

    // Growth rates as percentage change
    const currentGrowth =
      prior > 0 ? (current - prior) / prior : current > 0 ? 1 : 0;
    const priorGrowth =
      base > 0 ? (prior - base) / base : prior > 0 ? 1 : 0;

    // Second derivative: how much is the growth rate itself changing?
    const accelerationScore = clamp(
      (currentGrowth - priorGrowth) / (Math.abs(priorGrowth) + 0.01),
      -2,
      2,
    );

    // Classify curve shape
    let curveShape: CurveShape;
    if (accelerationScore > 0.5 && currentGrowth > 0.3) {
      curveShape = "HOCKEY_STICK";
    } else if (
      accelerationScore >= -0.1 &&
      accelerationScore <= 0.5 &&
      currentGrowth > 0.1
    ) {
      curveShape = "STEADY_CLIMB";
    } else if (accelerationScore < -0.1 && currentGrowth > -0.1) {
      curveShape = "PLATEAU";
    } else {
      curveShape = "DECLINING";
    }

    const curveMultiplierMap: Record<CurveShape, number> = {
      HOCKEY_STICK: 1.3,
      STEADY_CLIMB: 1.0,
      PLATEAU: 0.85,
      DECLINING: 0.7,
    };

    results.set(trackId, {
      accelerationScore,
      currentGrowth,
      priorGrowth,
      curveShape,
      curveMultiplier: curveMultiplierMap[curveShape],
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Signal 2: Geographic Diffusion Score
// ─────────────────────────────────────────────

type DiffusionResult = {
  marketCount: number;
  diffusionScore: number; // 0–1
  originMarket: string | null;
  spreadVelocity: number; // new markets per week
};

async function computeGeographicDiffusion(
  today: Date,
): Promise<Map<number, DiffusionResult>> {
  const day7 = new Date(today);
  day7.setDate(today.getDate() - 7);
  const day14 = new Date(today);
  day14.setDate(today.getDate() - 14);

  // Count distinct countries in last 7 days
  const markets7dRows = await db.$queryRawUnsafe<
    { track_id: number; market_count: number }[]
  >(
    `
    SELECT
      cr."trackId" AS track_id,
      COUNT(DISTINCT cs."countryCode") AS market_count
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."snapshotDate" BETWEEN $1::date AND $2::date
      AND cs."countryCode" IS NOT NULL
    GROUP BY cr."trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Count distinct countries in prior 7-day window (days 14→7)
  const markets14dRows = await db.$queryRawUnsafe<
    { track_id: number; market_count: number }[]
  >(
    `
    SELECT
      cr."trackId" AS track_id,
      COUNT(DISTINCT cs."countryCode") AS market_count
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."snapshotDate" BETWEEN $1::date AND $2::date
      AND cs."countryCode" IS NOT NULL
    GROUP BY cr."trackId"
    `,
    day14.toISOString().slice(0, 10),
    day7.toISOString().slice(0, 10),
  );

  // Find origin market: earliest snapshot country where this track appeared
  const originRows = await db.$queryRawUnsafe<
    { track_id: number; origin_market: string }[]
  >(
    `
    SELECT DISTINCT ON (cr."trackId")
      cr."trackId" AS track_id,
      cs."countryCode" AS origin_market
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."countryCode" IS NOT NULL
    ORDER BY cr."trackId", cs."snapshotDate" ASC
    `,
  );

  const markets7dMap = new Map<number, number>();
  for (const r of markets7dRows) {
    markets7dMap.set(r.track_id, Number(r.market_count));
  }

  const markets14dMap = new Map<number, number>();
  for (const r of markets14dRows) {
    markets14dMap.set(r.track_id, Number(r.market_count));
  }

  const originMap = new Map<number, string>();
  for (const r of originRows) {
    originMap.set(r.track_id, r.origin_market);
  }

  const allTrackIds = new Set([
    ...markets7dMap.keys(),
    ...markets14dMap.keys(),
  ]);

  const results = new Map<number, DiffusionResult>();

  for (const trackId of allTrackIds) {
    const marketCount = markets7dMap.get(trackId) ?? 0;
    const priorMarketCount = markets14dMap.get(trackId) ?? 0;
    const newMarketsThisWeek = Math.max(0, marketCount - priorMarketCount);

    // Normalize to 9 markets max (log1p scale)
    const diffusionScore = clamp(
      Math.log1p(marketCount) / Math.log1p(9),
      0,
      1,
    );

    results.set(trackId, {
      marketCount,
      diffusionScore,
      originMarket: originMap.get(trackId) ?? null,
      spreadVelocity: newMarketsThisWeek,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Signal 3: Influencer Concentration & Organic Score
// ─────────────────────────────────────────────

type OrganicResult = {
  organicScore: number; // 0–1
  sustainabilityScore: number; // 0–1
  weeksOnChart: number;
  isOrganicViralCandidate: boolean;
};

async function computeOrganicSignals(
  today: Date,
  accelerationMap: Map<number, AccelerationResult>,
): Promise<Map<number, OrganicResult>> {
  const day7 = new Date(today);
  day7.setDate(today.getDate() - 7);

  // Get UGC video counts for last 7d
  const ugcRows = await db.$queryRawUnsafe<
    { track_id: number; videos7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      SUM(videos7d) AS videos7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY "trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Check which tracks are in top 10 of TikTok typed charts (algorithmic/influencer-driven signal)
  const topChartRows = await db.$queryRawUnsafe<
    { track_id: number; min_rank: number }[]
  >(
    `
    SELECT
      ttcr."trackId" AS track_id,
      MIN(ttcr.rank) AS min_rank
    FROM tiktok_typed_track_chart_rows ttcr
    JOIN tiktok_typed_track_chart_snapshots ttcs ON ttcs.id = ttcr."snapshotId"
    WHERE ttcs."snapshotDate" BETWEEN $1::date AND $2::date
      AND ttcr."trackId" IS NOT NULL
    GROUP BY ttcr."trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Get weeks on chart from chart_rows
  const weeksOnChartRows = await db.$queryRawUnsafe<
    { track_id: number; weeks_on_chart: number }[]
  >(
    `
    SELECT
      cr."trackId" AS track_id,
      MAX(cr."weeksOnChart") AS weeks_on_chart
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."snapshotDate" BETWEEN $1::date AND $2::date
    GROUP BY cr."trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  const ugcMap = new Map<number, number>();
  for (const r of ugcRows) {
    ugcMap.set(r.track_id, Number(r.videos7d));
  }

  const topChartRankMap = new Map<number, number>();
  for (const r of topChartRows) {
    topChartRankMap.set(r.track_id, Number(r.min_rank));
  }

  const weeksOnChartMap = new Map<number, number>();
  for (const r of weeksOnChartRows) {
    if (r.weeks_on_chart != null) {
      weeksOnChartMap.set(r.track_id, Number(r.weeks_on_chart));
    }
  }

  const allTrackIds = new Set([
    ...ugcMap.keys(),
    ...topChartRankMap.keys(),
    ...weeksOnChartMap.keys(),
  ]);

  const results = new Map<number, OrganicResult>();

  for (const trackId of allTrackIds) {
    const videos7d = ugcMap.get(trackId) ?? 0;
    const chartRank = topChartRankMap.get(trackId) ?? 999;
    const weeksOnChart = weeksOnChartMap.get(trackId) ?? 0;

    // Organic virality proxy:
    // High video count + NOT in top chart positions → many small organic creators
    // In top 10 of typed charts → likely algorithmic / influencer-driven
    const organicScore = videos7d > 100 && chartRank > 20 ? 0.8 : 0.4;
    const isOrganicViralCandidate = organicScore >= 0.8;

    // Sustainability: tracks on chart for 2+ weeks with steady growth score higher
    const accel = accelerationMap.get(trackId);
    const absAcceleration = accel ? Math.abs(accel.accelerationScore) : 0;
    const sustainabilityScore = clamp(
      weeksOnChart * 0.1 + (1 - absAcceleration * 0.3),
      0,
      1,
    );

    results.set(trackId, {
      organicScore,
      sustainabilityScore,
      weeksOnChart,
      isOrganicViralCandidate,
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Viral Score Computation (updated formula)
// ─────────────────────────────────────────────

type TrackSignals = {
  trackId: number;
  code2: string;

  // Raw platform signals (normalized 0–1)
  tiktokNorm: number;
  instagramNorm: number;
  chartVelocityNorm: number;
  diffusionNorm: number;
  playlistNorm: number;
  accelerationNorm: number;
  youtubeNorm: number;
  organicNorm: number;
  conversionRateNorm: number;

  // Computed scores
  viralScore: number;
  accelerationScore: number;
  curveShape: string;
  curveMultiplier: number;
  diffusionScore: number;
  marketCount: number;
  originMarket: string | null;
  spreadVelocity: number;
  organicScore: number;
  sustainabilityScore: number;
  weeksOnChart: number;
  synergyMultiplier: number;
};

async function fetchPlatformSignals(
  today: Date,
): Promise<Map<string, {
  trackId: number;
  code2: string;
  tiktokViews7d: number;
  instagramViews7d: number;
  chartVelocity: number;
  playlistAdds7d: number;
  youtubeViews7d: number;
  spotifyStreams7d: number;
}>> {
  const day7 = new Date(today);
  day7.setDate(today.getDate() - 7);

  // TikTok UGC views
  const tiktokRows = await db.$queryRawUnsafe<
    { track_id: number; code2: string; views7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      code2,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY "trackId", code2
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Instagram / Reels (using track_platform_stats_daily where platform='instagram')
  const instagramRows = await db.$queryRawUnsafe<
    { track_id: number; code2: string; video_views7d: number }[]
  >(
    `
    SELECT
      tpsd."trackId" AS track_id,
      COALESCE(tpsd.platform, 'GLOBAL') AS code2,
      SUM(tpsd."videoViews") AS video_views7d
    FROM track_platform_stats_daily tpsd
    WHERE tpsd.date BETWEEN $1::date AND $2::date
      AND tpsd.platform = 'instagram'
      AND tpsd."videoViews" IS NOT NULL
    GROUP BY tpsd."trackId", tpsd.platform
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Chart velocity: rank improvement in last 7d
  const chartRows = await db.$queryRawUnsafe<
    {
      track_id: number;
      code2: string;
      avg_rank: number;
      min_rank: number;
      weeks_on_chart: number;
    }[]
  >(
    `
    SELECT
      cr."trackId" AS track_id,
      COALESCE(cs."countryCode", 'GLOBAL') AS code2,
      AVG(cr.rank)          AS avg_rank,
      MIN(cr.rank)          AS min_rank,
      MAX(cr."weeksOnChart") AS weeks_on_chart
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."snapshotDate" BETWEEN $1::date AND $2::date
    GROUP BY cr."trackId", cs."countryCode"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Playlist adds in last 7d — weighted by log(followerCount+1) so a Spotify
  // Editorial Thousands-follower playlist outweighs a 50-follower indie list.
  const playlistRows = await db.$queryRawUnsafe<
    { track_id: number; adds7d: number }[]
  >(
    `
    SELECT
      pme."trackId" AS track_id,
      SUM(GREATEST(1.0, LN(COALESCE(p."followerCount"::numeric, 1) + 1))) AS adds7d
    FROM playlist_membership_events pme
    LEFT JOIN playlists p ON p.id = pme."playlistId"
    WHERE pme."eventDate" BETWEEN $1::date AND $2::date
      AND pme."eventType" = 'added'
    GROUP BY pme."trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // YouTube views (from track_platform_stats_daily where platform='youtube')
  const youtubeRows = await db.$queryRawUnsafe<
    { track_id: number; code2: string; video_views7d: number }[]
  >(
    `
    SELECT
      tpsd."trackId" AS track_id,
      COALESCE(tpsd.platform, 'GLOBAL') AS code2,
      SUM(tpsd."videoViews") AS video_views7d
    FROM track_platform_stats_daily tpsd
    WHERE tpsd.date BETWEEN $1::date AND $2::date
      AND tpsd.platform = 'youtube'
      AND tpsd."videoViews" IS NOT NULL
    GROUP BY tpsd."trackId", tpsd.platform
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Spotify streams 7d — used to compute the TikTok→Spotify conversion rate
  const spotifyStreamsRows = await db.$queryRawUnsafe<
    { track_id: number; streams7d: number }[]
  >(
    `
    SELECT
      "trackId" AS track_id,
      SUM(streams) AS streams7d
    FROM track_platform_stats_daily
    WHERE date BETWEEN $1::date AND $2::date
      AND platform = 'spotify'
      AND streams IS NOT NULL
    GROUP BY "trackId"
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Index all by trackId
  const tiktokMap = new Map<number, number>();
  for (const r of tiktokRows) {
    const existing = tiktokMap.get(r.track_id) ?? 0;
    tiktokMap.set(r.track_id, existing + Number(r.views7d));
  }

  const instagramMap = new Map<number, number>();
  for (const r of instagramRows) {
    const existing = instagramMap.get(r.track_id) ?? 0;
    instagramMap.set(r.track_id, existing + Number(r.video_views7d));
  }

  const youtubeMap = new Map<number, number>();
  for (const r of youtubeRows) {
    const existing = youtubeMap.get(r.track_id) ?? 0;
    youtubeMap.set(r.track_id, existing + Number(r.video_views7d));
  }

  const spotifyStreamsMap = new Map<number, number>();
  for (const r of spotifyStreamsRows) {
    spotifyStreamsMap.set(r.track_id, Number(r.streams7d));
  }

  const chartMap = new Map<
    number,
    { avgRank: number; minRank: number; code2: string }
  >();
  for (const r of chartRows) {
    const existing = chartMap.get(r.track_id);
    if (!existing || Number(r.min_rank) < existing.minRank) {
      chartMap.set(r.track_id, {
        avgRank: Number(r.avg_rank),
        minRank: Number(r.min_rank),
        code2: r.code2,
      });
    }
  }

  const playlistMap = new Map<number, number>();
  for (const r of playlistRows) {
    playlistMap.set(r.track_id, Number(r.adds7d));
  }

  // Build combined map keyed by "trackId:code2"
  const combined = new Map<string, {
    trackId: number;
    code2: string;
    tiktokViews7d: number;
    instagramViews7d: number;
    chartVelocity: number;
    playlistAdds7d: number;
    youtubeViews7d: number;
    spotifyStreams7d: number;
  }>();

  // Start from TikTok rows as they're the most granular per code2
  for (const r of tiktokRows) {
    const key = `${r.track_id}:${r.code2}`;
    const chart = chartMap.get(r.track_id);
    // chartVelocity: lower rank is better; invert so higher = better (100 - rank, clamped)
    const chartVelocity = chart
      ? Math.max(0, 100 - chart.minRank)
      : 0;
    combined.set(key, {
      trackId: r.track_id,
      code2: r.code2,
      tiktokViews7d: Number(r.views7d),
      instagramViews7d: instagramMap.get(r.track_id) ?? 0,
      chartVelocity,
      playlistAdds7d: playlistMap.get(r.track_id) ?? 0,
      youtubeViews7d: youtubeMap.get(r.track_id) ?? 0,
      spotifyStreams7d: spotifyStreamsMap.get(r.track_id) ?? 0,
    });
  }

  // Add any tracks that appeared in chart but not TikTok
  for (const [trackId, chart] of chartMap.entries()) {
    const key = `${trackId}:${chart.code2}`;
    if (!combined.has(key)) {
      combined.set(key, {
        trackId,
        code2: chart.code2,
        tiktokViews7d: tiktokMap.get(trackId) ?? 0,
        instagramViews7d: instagramMap.get(trackId) ?? 0,
        chartVelocity: Math.max(0, 100 - chart.minRank),
        playlistAdds7d: playlistMap.get(trackId) ?? 0,
        youtubeViews7d: youtubeMap.get(trackId) ?? 0,
        spotifyStreams7d: spotifyStreamsMap.get(trackId) ?? 0,
      });
    }
  }

  return combined;
}

// ─────────────────────────────────────────────
// Main ETL function
// ─────────────────────────────────────────────

export async function computeTrackSignals(dateStr: string): Promise<void> {
  const today = new Date(dateStr);

  console.log("[compute_track_signals] Computing acceleration scores...");
  const accelerationMap = await computeAccelerationScores(today);

  console.log("[compute_track_signals] Computing geographic diffusion...");
  const diffusionMap = await computeGeographicDiffusion(today);

  console.log("[compute_track_signals] Computing organic signals...");
  const organicMap = await computeOrganicSignals(today, accelerationMap);

  console.log("[compute_track_signals] Fetching platform signals...");
  const platformSignals = await fetchPlatformSignals(today);

  // If TikTok/UGC data is absent, seed the universe from recent chart rows
  // so the ETL produces scores even when TikTok ingestion hasn't run.
  if (platformSignals.size === 0) {
    console.log("[compute_track_signals] platformSignals empty — seeding from chart_rows fallback...");
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 30);
    const chartSeed = await db.$queryRawUnsafe<{ track_id: number; code2: string }[]>(
      `SELECT DISTINCT cr."trackId" AS track_id,
              COALESCE(cs."countryCode", 'GLOBAL') AS code2
       FROM chart_rows cr
       JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
       WHERE cs."snapshotDate" >= $1::date
       LIMIT 500`,
      cutoff.toISOString().slice(0, 10),
    );
    for (const row of chartSeed) {
      const key = `${row.track_id}:${row.code2}`;
      if (!platformSignals.has(key)) {
        platformSignals.set(key, {
          trackId: row.track_id,
          code2: row.code2,
          tiktokViews7d: 0,
          instagramViews7d: 0,
          chartVelocity: 50, // mid-range default so it scores positively
          playlistAdds7d: 0,
          youtubeViews7d: 0,
          spotifyStreams7d: 0,
        });
      }
    }
    console.log(`[compute_track_signals] Seeded ${platformSignals.size} tracks from chart_rows.`);
  }

  // Compute per-signal 95th-percentile for robust normalization.
  // Using p95 rather than max prevents a single viral outlier from squashing
  // the scores of every other track toward zero.
  const signalArrays = {
    tiktok: [] as number[],
    instagram: [] as number[],
    chart: [] as number[],
    playlist: [] as number[],
    youtube: [] as number[],
    spotify: [] as number[],
  };

  for (const s of platformSignals.values()) {
    signalArrays.tiktok.push(s.tiktokViews7d);
    signalArrays.instagram.push(s.instagramViews7d);
    signalArrays.chart.push(s.chartVelocity);
    signalArrays.playlist.push(s.playlistAdds7d);
    signalArrays.youtube.push(s.youtubeViews7d);
    signalArrays.spotify.push(s.spotifyStreams7d);
  }

  const p95Tiktok = computeP95(signalArrays.tiktok);
  const p95Instagram = computeP95(signalArrays.instagram);
  const p95Chart = computeP95(signalArrays.chart);
  const p95Playlist = computeP95(signalArrays.playlist);
  const p95Youtube = computeP95(signalArrays.youtube);
  const p95Spotify = computeP95(signalArrays.spotify);

  // Fetch latest ML viral probabilities (30d) for all tracks in scope.
  // These are written by scripts/import_track_trend_predictions.ts after each
  // ml_train.yml run. When no prediction exists the modifier is neutral (1.0).
  const trackIds = [...new Set([...platformSignals.values()].map((s) => s.trackId))];
  const mlPredRows = trackIds.length > 0
    ? await db.$queryRawUnsafe<{ track_id: number; prob_viral: number }[]>(
        `SELECT DISTINCT ON ("trackId") "trackId" AS track_id, "probViral" AS prob_viral
         FROM track_trend_predictions
         WHERE "trackId" = ANY($1::int[])
           AND "predictedAt" >= NOW() - INTERVAL '30 days'
         ORDER BY "trackId", "predictedAt" DESC`,
        trackIds,
      )
    : [];
  const mlProbMap = new Map<number, number>();
  for (const row of mlPredRows) {
    mlProbMap.set(row.track_id, row.prob_viral);
  }
  console.log(
    `[compute_track_signals] Loaded ML predictions for ${mlProbMap.size}/${trackIds.length} tracks`,
  );

  console.log(
    `[compute_track_signals] Normalizing and writing ${platformSignals.size} track signals...`,
  );

  const results: TrackSignals[] = [];

  for (const s of platformSignals.values()) {
    const accel = accelerationMap.get(s.trackId);
    const diffusion = diffusionMap.get(s.trackId);
    const organic = organicMap.get(s.trackId);

    const tiktokNorm = robustNorm(s.tiktokViews7d, p95Tiktok);
    const instagramNorm = robustNorm(s.instagramViews7d, p95Instagram);
    const chartVelocityNorm = robustNorm(s.chartVelocity, p95Chart);
    const playlistNorm = robustNorm(s.playlistAdds7d, p95Playlist);
    const youtubeNorm = robustNorm(s.youtubeViews7d, p95Youtube);

    // Conversion rate: Spotify streams driven per TikTok view (UGC→stream efficiency).
    // Capped at 0.1 (10 streams per TikTok view is extreme), then normalized to 0–1.
    const rawConversionRate = s.tiktokViews7d > 0
      ? s.spotifyStreams7d / s.tiktokViews7d
      : 0;
    const conversionRateNorm = clamp(rawConversionRate / 0.1, 0, 1);

    // Acceleration: map [-2,2] → [0,1] with 0 as neutral 0.5
    const rawAccel = accel?.accelerationScore ?? 0;
    const accelerationNorm = clamp((rawAccel + 2) / 4, 0, 1);

    const diffusionScore = diffusion?.diffusionScore ?? 0;
    const diffusionNorm = diffusionScore; // already 0–1

    const organicScore = organic?.organicScore ?? 0.4;
    const organicNorm = organicScore; // already 0–1

    // Count platforms with normalized signal > 0.4 (surging)
    const platformsSurging = [
      tiktokNorm,
      instagramNorm,
      chartVelocityNorm,
      diffusionNorm,
      playlistNorm,
      accelerationNorm,
      youtubeNorm,
      organicNorm,
      conversionRateNorm,
    ].filter((v) => v > 0.4).length;

    const synergyMultiplier =
      platformsSurging >= 2
        ? 1 + (platformsSurging - 1) * 0.35
        : 1;

    const curveMultiplier = accel?.curveMultiplier ?? 1.0;

    // Deterministic weighted formula (weights sum to 1.0).
    // conversionRateNorm measures how efficiently TikTok views translate to
    // Spotify streams — high conversion indicates genuine demand, not just noise.
    const rawViralScore =
      0.25 * tiktokNorm +
      0.16 * instagramNorm +
      0.16 * chartVelocityNorm +
      0.06 * diffusionNorm +
      0.14 * playlistNorm +
      0.08 * accelerationNorm +
      0.05 * youtubeNorm +
      0.05 * organicNorm +
      0.05 * conversionRateNorm;

    // ML modifier: blend in the model's 30d viral probability as a ±7.5%
    // nudge around the rule-based score. Neutral when no prediction exists.
    // Formula: modifier = 1 + 0.15 * (probViral - 0.5), clamped to [0.85, 1.15]
    const mlProb30d = mlProbMap.get(s.trackId) ?? 0.5;
    const mlModifier = clamp(1 + 0.15 * (mlProb30d - 0.5), 0.85, 1.15);

    const viralScore = clamp(
      rawViralScore * curveMultiplier * synergyMultiplier * mlModifier,
      0,
      1,
    );

    results.push({
      trackId: s.trackId,
      code2: s.code2,
      tiktokNorm,
      instagramNorm,
      chartVelocityNorm,
      diffusionNorm,
      playlistNorm,
      accelerationNorm,
      youtubeNorm,
      organicNorm,
      conversionRateNorm,
      viralScore,
      accelerationScore: accel?.accelerationScore ?? 0,
      curveShape: accel?.curveShape ?? "DECLINING",
      curveMultiplier,
      diffusionScore,
      marketCount: diffusion?.marketCount ?? 0,
      originMarket: diffusion?.originMarket ?? null,
      spreadVelocity: diffusion?.spreadVelocity ?? 0,
      organicScore,
      sustainabilityScore: organic?.sustainabilityScore ?? 0,
      weeksOnChart: organic?.weeksOnChart ?? 0,
      synergyMultiplier,
    });
  }

  // Write to TalentScoutScore (viralScore) and TrackTrendLabel (notes)
  for (const sig of results) {
    const snapshotDate = today;

    // Upsert TalentScoutScore with updated viralScore
    await db.talentScoutScore.upsert({
      where: {
        trackId_code2_date: {
          trackId: sig.trackId,
          code2: sig.code2,
          date: snapshotDate,
        },
      },
      update: {
        viralScore: sig.viralScore,
      },
      create: {
        trackId: sig.trackId,
        code2: sig.code2,
        date: snapshotDate,
        viralScore: sig.viralScore,
        rightsComplexityScore: 0,
      },
    });

    // Store extended signal metadata in TrackTrendLabel notes field
    // Only upsert if a label row exists for this track
    const existingLabel = await db.trackTrendLabel.findFirst({
      where: {
        trackId: sig.trackId,
      },
    });

    if (existingLabel) {
      await db.trackTrendLabel.update({
        where: { id: existingLabel.id },
        data: {
          updatedAt: snapshotDate,
        },
      });
    }
  }

  console.log(
    `[compute_track_signals] Done. Processed ${results.length} track-market signals.`,
  );
  console.log(
    `[compute_track_signals] Breakdown by curve shape:`,
    Object.fromEntries(
      ["HOCKEY_STICK", "STEADY_CLIMB", "PLATEAU", "DECLINING"].map(
        (shape) => [
          shape,
          results.filter((r) => r.curveShape === shape).length,
        ],
      ),
    ),
  );
}

// ─────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────

if (require.main === module) {
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  runTrackedJob('etl:compute-track-signals', () => computeTrackSignals(dateArg))
    .then(() => {
      console.log("TrackSignals computed for", dateArg);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
