// jobs/etl/compute_track_signals.ts
import { db } from "@/lib/db";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return clamp(value / max, 0, 1);
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
      track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY track_id
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
      track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY track_id
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
      track_id,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY track_id
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
      cr.track_id,
      COUNT(DISTINCT cs.country_code) AS market_count
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.snapshot_date BETWEEN $1::date AND $2::date
      AND cs.country_code IS NOT NULL
    GROUP BY cr.track_id
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
      cr.track_id,
      COUNT(DISTINCT cs.country_code) AS market_count
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.snapshot_date BETWEEN $1::date AND $2::date
      AND cs.country_code IS NOT NULL
    GROUP BY cr.track_id
    `,
    day14.toISOString().slice(0, 10),
    day7.toISOString().slice(0, 10),
  );

  // Find origin market: earliest snapshot country where this track appeared
  const originRows = await db.$queryRawUnsafe<
    { track_id: number; origin_market: string }[]
  >(
    `
    SELECT DISTINCT ON (cr.track_id)
      cr.track_id,
      cs.country_code AS origin_market
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.country_code IS NOT NULL
    ORDER BY cr.track_id, cs.snapshot_date ASC
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
      track_id,
      SUM(videos7d) AS videos7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY track_id
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
      ttcr.track_id,
      MIN(ttcr.rank) AS min_rank
    FROM tiktok_typed_track_chart_rows ttcr
    JOIN tiktok_typed_track_chart_snapshots ttcs ON ttcs.id = ttcr.snapshot_id
    WHERE ttcs.snapshot_date BETWEEN $1::date AND $2::date
      AND ttcr.track_id IS NOT NULL
    GROUP BY ttcr.track_id
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
      cr.track_id,
      MAX(cr.weeks_on_chart) AS weeks_on_chart
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.snapshot_date BETWEEN $1::date AND $2::date
    GROUP BY cr.track_id
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
}>> {
  const day7 = new Date(today);
  day7.setDate(today.getDate() - 7);

  // TikTok UGC views
  const tiktokRows = await db.$queryRawUnsafe<
    { track_id: number; code2: string; views7d: number }[]
  >(
    `
    SELECT
      track_id,
      code2,
      SUM(views7d) AS views7d
    FROM ugc_track_metrics
    WHERE date BETWEEN $1::date AND $2::date
    GROUP BY track_id, code2
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
      tpsd.track_id,
      COALESCE(tpsd.platform, 'GLOBAL') AS code2,
      SUM(tpsd.video_views) AS video_views7d
    FROM track_platform_stats_daily tpsd
    WHERE tpsd.date BETWEEN $1::date AND $2::date
      AND tpsd.platform = 'instagram'
      AND tpsd.video_views IS NOT NULL
    GROUP BY tpsd.track_id, tpsd.platform
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
      cr.track_id,
      COALESCE(cs.country_code, 'GLOBAL') AS code2,
      AVG(cr.rank)          AS avg_rank,
      MIN(cr.rank)          AS min_rank,
      MAX(cr.weeks_on_chart) AS weeks_on_chart
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.snapshot_date BETWEEN $1::date AND $2::date
    GROUP BY cr.track_id, cs.country_code
    `,
    day7.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  );

  // Playlist adds in last 7d
  const playlistRows = await db.$queryRawUnsafe<
    { track_id: number; adds7d: number }[]
  >(
    `
    SELECT
      track_id,
      COUNT(*) AS adds7d
    FROM playlist_membership_events
    WHERE event_date BETWEEN $1::date AND $2::date
      AND event_type = 'added'
    GROUP BY track_id
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
      tpsd.track_id,
      COALESCE(tpsd.platform, 'GLOBAL') AS code2,
      SUM(tpsd.video_views) AS video_views7d
    FROM track_platform_stats_daily tpsd
    WHERE tpsd.date BETWEEN $1::date AND $2::date
      AND tpsd.platform = 'youtube'
      AND tpsd.video_views IS NOT NULL
    GROUP BY tpsd.track_id, tpsd.platform
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

  // Compute per-signal global maxima for normalization
  let maxTiktok = 1;
  let maxInstagram = 1;
  let maxChart = 1;
  let maxPlaylist = 1;
  let maxYoutube = 1;
  let maxAccel = 1;

  for (const s of platformSignals.values()) {
    if (s.tiktokViews7d > maxTiktok) maxTiktok = s.tiktokViews7d;
    if (s.instagramViews7d > maxInstagram) maxInstagram = s.instagramViews7d;
    if (s.chartVelocity > maxChart) maxChart = s.chartVelocity;
    if (s.playlistAdds7d > maxPlaylist) maxPlaylist = s.playlistAdds7d;
    if (s.youtubeViews7d > maxYoutube) maxYoutube = s.youtubeViews7d;
  }

  for (const a of accelerationMap.values()) {
    const absAccel = Math.abs(a.accelerationScore);
    if (absAccel > maxAccel) maxAccel = absAccel;
  }

  console.log(
    `[compute_track_signals] Normalizing and writing ${platformSignals.size} track signals...`,
  );

  const results: TrackSignals[] = [];

  for (const [key, s] of platformSignals.entries()) {
    const accel = accelerationMap.get(s.trackId);
    const diffusion = diffusionMap.get(s.trackId);
    const organic = organicMap.get(s.trackId);

    const tiktokNorm = normalize(s.tiktokViews7d, maxTiktok);
    const instagramNorm = normalize(s.instagramViews7d, maxInstagram);
    const chartVelocityNorm = normalize(s.chartVelocity, maxChart);
    const playlistNorm = normalize(s.playlistAdds7d, maxPlaylist);
    const youtubeNorm = normalize(s.youtubeViews7d, maxYoutube);

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
    ].filter((v) => v > 0.4).length;

    const synergyMultiplier =
      platformsSurging >= 2
        ? 1 + (platformsSurging - 1) * 0.35
        : 1;

    const curveMultiplier = accel?.curveMultiplier ?? 1.0;

    // Updated viral score formula
    const rawViralScore =
      0.28 * tiktokNorm +
      0.18 * instagramNorm +
      0.16 * chartVelocityNorm +
      0.06 * diffusionNorm +
      0.14 * playlistNorm +
      0.08 * accelerationNorm +
      0.05 * youtubeNorm +
      0.05 * organicNorm;

    const viralScore = clamp(
      rawViralScore * curveMultiplier * synergyMultiplier,
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
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error(
      "Usage: ts-node jobs/etl/compute_track_signals.ts YYYY-MM-DD",
    );
    process.exit(1);
  }
  computeTrackSignals(dateArg)
    .then(() => {
      console.log("TrackSignals computed for", dateArg);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
