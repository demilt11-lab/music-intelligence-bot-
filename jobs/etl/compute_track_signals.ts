// jobs/etl/compute_track_signals.ts
// Feature engineering ETL: compute viral scores, trend labels, and derived signals
// for all tracks from ingested raw data.
import "dotenv/config";
import { db } from "@/lib/db";

// ─── Math helpers ────────────────────────────────────────────────────────────

function safeNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return isNaN(v) ? 0 : v;
}

function log1p(x: number): number {
  return Math.log1p(Math.max(0, x));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function normalize(x: number, maxVal: number): number {
  if (maxVal <= 0) return 0;
  return log1p(x) / log1p(maxVal);
}

// ─── Signal 1: Chart velocity ─────────────────────────────────────────────────

interface ChartVelocityResult {
  trackId: number;
  chartVelocityScore: number;
}

async function computeChartVelocity(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  // Get chart rows for the past 7 days for all tracks that have chart data.
  // We compare rank to previousRank for each row to get per-snapshot improvement.
  const rows = await db.$queryRaw<
    { track_id: number; rank: number; previous_rank: number | null; snapshot_date: Date }[]
  >`
    SELECT
      cr.track_id,
      cr.rank,
      cr.previous_rank,
      cs.snapshot_date
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    WHERE cs.snapshot_date BETWEEN ${sevenDaysAgo} AND ${today}
      AND cs.platform = 'spotify'
  `;

  // Accumulate weighted score per track across all markets
  // Rank improvement: positive = moving up (lower rank number is better)
  const scoreAccum = new Map<number, { sum: number; count: number }>();

  for (const r of rows) {
    const prev = r.previous_rank ?? r.rank; // if no previous, no change
    const improvement = prev - r.rank; // positive = improved rank
    // Scale: improvement of 30 positions (40→10) → +0.75, drop 30 (10→40) → -0.3
    let score: number;
    if (improvement > 0) {
      score = (improvement / 40) * 0.75;
    } else {
      score = (improvement / 40) * 0.3; // negative improvement → negative score, less punishing
    }
    score = clamp(score, -1, 1);

    const existing = scoreAccum.get(r.track_id) ?? { sum: 0, count: 0 };
    existing.sum += score;
    existing.count += 1;
    scoreAccum.set(r.track_id, existing);
  }

  const result = new Map<number, number>();
  for (const [trackId, { sum, count }] of scoreAccum) {
    result.set(trackId, count > 0 ? sum / count : 0);
  }
  return result;
}

// ─── Signal 1: Popularity delta ──────────────────────────────────────────────

async function computePopularityDelta(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  // track_statistics_latest only has one row per track (latest). To compute delta
  // we check updatedAt — for tracks updated ~7d ago vs today we compare.
  // Since we only have "latest" snapshot, we approximate delta as:
  //   current popularity vs any older row in track_platform_stats_daily (saves as proxy)
  // For a more robust approach: compare current spotifyPopularity with
  // any historical record. We use the track's own popularity field + statisticsLatest.
  const rows = await db.trackStatisticsLatest.findMany({
    select: { trackId: true, spotifyPopularity: true, updatedAt: true },
  });

  // Also get platform stats streams delta to infer relative popularity growth
  // Since we can't time-travel on track_statistics_latest, we use the track.popularity
  // field as the "prior" value if statisticsLatest was updated recently.
  const trackPopMap = new Map<number, number>();
  const freshCutoff = new Date(today);
  freshCutoff.setDate(today.getDate() - 1); // updated within last day = "current"
  const staleCutoff = new Date(today);
  staleCutoff.setDate(today.getDate() - 7);

  // Build map: trackId → {current, prior}
  // We look for pairs where one record was updated >=7d ago (prior) and one is recent.
  // Since we only have one row per track, we use track.popularity as prior baseline.
  const tracks = await db.track.findMany({
    select: { id: true, popularity: true },
  });
  const trackBaselineMap = new Map(tracks.map((t) => [t.id, t.popularity ?? 0]));

  for (const r of rows) {
    const current = r.spotifyPopularity ?? 0;
    const baseline = trackBaselineMap.get(r.trackId) ?? 0;
    // Delta = current spotifyPopularity - track.popularity (baseline set at ingest)
    trackPopMap.set(r.trackId, current - baseline);
  }

  return trackPopMap;
}

// ─── Signal 2: Playlist velocity ─────────────────────────────────────────────

interface PlaylistVelocityResult {
  playlistAdds7d: number;
  editorialAdds7d: number;
  playlistRemoves7d: number;
}

async function computePlaylistVelocity(
  today: Date,
): Promise<Map<number, PlaylistVelocityResult>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const events = await db.$queryRaw<
    {
      track_id: number;
      event_type: string;
      is_official: boolean;
      is_algorithmic: boolean;
      cnt: bigint;
    }[]
  >`
    SELECT
      pme.track_id,
      pme.event_type,
      p.is_official,
      p.is_algorithmic,
      COUNT(*) AS cnt
    FROM playlist_membership_events pme
    JOIN playlists p ON p.id = pme.playlist_id
    WHERE pme.event_date >= ${sevenDaysAgo}
      AND pme.event_date <= ${today}
    GROUP BY pme.track_id, pme.event_type, p.is_official, p.is_algorithmic
  `;

  const result = new Map<number, PlaylistVelocityResult>();

  for (const row of events) {
    const existing = result.get(row.track_id) ?? {
      playlistAdds7d: 0,
      editorialAdds7d: 0,
      playlistRemoves7d: 0,
    };
    const cnt = safeNum(row.cnt);
    if (row.event_type === "added") {
      existing.playlistAdds7d += cnt;
      // editorial = isOfficial=true OR isAlgorithmic=false
      if (row.is_official || !row.is_algorithmic) {
        existing.editorialAdds7d += cnt;
      }
    } else if (row.event_type === "removed") {
      existing.playlistRemoves7d += cnt;
    }
    result.set(row.track_id, existing);
  }

  return result;
}

// ─── TikTok views growth ──────────────────────────────────────────────────────

async function computeTiktokViewsGrowth(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  // Use ugc_track_metrics views7dGrowth as a proxy for TikTok velocity
  // Get the latest record per track
  const rows = await db.$queryRaw<
    { track_id: number; views7d_growth: number; views7d: bigint }[]
  >`
    SELECT DISTINCT ON (track_id)
      track_id,
      views7d_growth,
      views7d
    FROM ugc_track_metrics
    WHERE date <= ${today}
    ORDER BY track_id, date DESC
  `;

  const result = new Map<number, number>();
  for (const r of rows) {
    result.set(r.track_id, r.views7d_growth ?? 0);
  }
  return result;
}

// ─── YouTube view velocity ────────────────────────────────────────────────────

async function computeYoutubeVelocity(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  const rows = await db.$queryRaw<
    { track_id: number; views_7d: bigint; views_prev: bigint }[]
  >`
    SELECT
      track_id,
      SUM(CASE WHEN date >= ${sevenDaysAgo} AND date <= ${today} THEN COALESCE(video_views, 0) ELSE 0 END) AS views_7d,
      SUM(CASE WHEN date >= ${fourteenDaysAgo} AND date < ${sevenDaysAgo} THEN COALESCE(video_views, 0) ELSE 0 END) AS views_prev
    FROM track_platform_stats_daily
    WHERE platform = 'youtube'
      AND date >= ${fourteenDaysAgo}
      AND date <= ${today}
    GROUP BY track_id
  `;

  const result = new Map<number, number>();
  for (const r of rows) {
    const curr = safeNum(r.views_7d);
    const prev = safeNum(r.views_prev);
    if (prev > 0) {
      result.set(r.track_id, (curr - prev) / prev);
    } else {
      result.set(r.track_id, curr > 0 ? 1 : 0);
    }
  }
  return result;
}

// ─── Radio spin growth ────────────────────────────────────────────────────────

async function computeRadioSpinGrowth(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  const rows = await db.$queryRaw<
    { track_id: number; spins_7d: bigint; spins_prev: bigint }[]
  >`
    SELECT
      track_id,
      SUM(CASE WHEN date >= ${sevenDaysAgo} AND date <= ${today} THEN COALESCE(radio_plays, 0) ELSE 0 END) AS spins_7d,
      SUM(CASE WHEN date >= ${fourteenDaysAgo} AND date < ${sevenDaysAgo} THEN COALESCE(radio_plays, 0) ELSE 0 END) AS spins_prev
    FROM track_platform_stats_daily
    WHERE platform = 'radio'
      AND date >= ${fourteenDaysAgo}
      AND date <= ${today}
    GROUP BY track_id
  `;

  const result = new Map<number, number>();
  for (const r of rows) {
    const curr = safeNum(r.spins_7d);
    const prev = safeNum(r.spins_prev);
    if (prev > 0) {
      result.set(r.track_id, (curr - prev) / prev);
    } else {
      result.set(r.track_id, curr > 0 ? 1 : 0);
    }
  }
  return result;
}

// ─── Compute max values for normalization ────────────────────────────────────

function computeMax<T>(map: Map<number, T>, getter: (v: T) => number): number {
  let max = 0;
  for (const v of map.values()) {
    const x = getter(v);
    if (x > max) max = x;
  }
  return max;
}

// ─── Classify trend label ────────────────────────────────────────────────────

function classifyTrendLabel(
  viralScore: number,
  tiktokViewsGrowth7d: number,
  chartVelocityScore: number,
  playlistAdds7d: number,
  popularityDelta7d: number,
): string {
  if (viralScore >= 0.7 && tiktokViewsGrowth7d > 0.5) return "VIRAL";
  if (viralScore >= 0.45 && (chartVelocityScore > 0 || playlistAdds7d > 2)) return "TRENDING";
  if (viralScore >= 0.25 && popularityDelta7d >= 0) return "POPULAR";
  return "NONE";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function computeTrackSignals(dateStr?: string): Promise<void> {
  const today = dateStr ? new Date(dateStr) : new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  console.log(`[compute_track_signals] Running for ${todayIso}`);

  // Gather all track IDs
  const allTracks = await db.track.findMany({ select: { id: true } });
  const allTrackIds = new Set(allTracks.map((t) => t.id));

  console.log(`  Loaded ${allTrackIds.size} tracks`);

  // Compute all signals in parallel
  const [
    chartVelocityMap,
    popularityDeltaMap,
    playlistVelocityMap,
    tiktokGrowthMap,
    youtubeVelocityMap,
    radioSpinGrowthMap,
  ] = await Promise.all([
    computeChartVelocity(today),
    computePopularityDelta(today),
    computePlaylistVelocity(today),
    computeTiktokViewsGrowth(today),
    computeYoutubeVelocity(today),
    computeRadioSpinGrowth(today),
  ]);

  console.log(
    `  chart=${chartVelocityMap.size}, pop=${popularityDeltaMap.size}, playlist=${playlistVelocityMap.size}, tiktok=${tiktokGrowthMap.size}, yt=${youtubeVelocityMap.size}, radio=${radioSpinGrowthMap.size}`,
  );

  // Compute max values for normalization (over the tracks observed in last 30d)
  const maxChartVelocity = Math.max(
    computeMax(chartVelocityMap, (v) => Math.abs(v)),
    0.001,
  );
  const maxPlaylistAdds = Math.max(
    computeMax(playlistVelocityMap, (v) => v.playlistAdds7d),
    1,
  );
  const maxTiktokGrowth = Math.max(
    computeMax(tiktokGrowthMap, (v) => Math.abs(v)),
    0.001,
  );
  const maxYoutubeVelocity = Math.max(
    computeMax(youtubeVelocityMap, (v) => Math.abs(v)),
    0.001,
  );
  const maxRadioGrowth = Math.max(
    computeMax(radioSpinGrowthMap, (v) => Math.abs(v)),
    0.001,
  );

  let processed = 0;
  let errors = 0;

  for (const trackId of allTrackIds) {
    try {
      const chartVelocityScore = chartVelocityMap.get(trackId) ?? 0;
      const popularityDelta7d = popularityDeltaMap.get(trackId) ?? 0;
      const playlistData = playlistVelocityMap.get(trackId) ?? {
        playlistAdds7d: 0,
        editorialAdds7d: 0,
        playlistRemoves7d: 0,
      };
      const tiktokViewsGrowth7d = tiktokGrowthMap.get(trackId) ?? 0;
      const youtubeViewVelocity7d = youtubeVelocityMap.get(trackId) ?? 0;
      const radioSpinGrowth7d = radioSpinGrowthMap.get(trackId) ?? 0;

      // Signal 3: composite viralScore
      const viralScore = clamp(
        0.35 * normalize(tiktokViewsGrowth7d, maxTiktokGrowth) +
          0.25 * normalize(chartVelocityScore, maxChartVelocity) +
          0.20 * normalize(playlistData.playlistAdds7d, maxPlaylistAdds) +
          0.12 * normalize(youtubeViewVelocity7d, maxYoutubeVelocity) +
          0.08 * normalize(radioSpinGrowth7d, maxRadioGrowth),
        0,
        1,
      );

      // Signal 4: trend label
      const label = classifyTrendLabel(
        viralScore,
        tiktokViewsGrowth7d,
        chartVelocityScore,
        playlistData.playlistAdds7d,
        popularityDelta7d,
      );

      // Write to talent_scout_scores
      await db.talentScoutScore.upsert({
        where: {
          trackId_code2_date: {
            trackId,
            code2: "GLOBAL",
            date: today,
          },
        },
        update: {
          viralScore,
          rightsComplexityScore: 0.5,
          updatedAt: new Date(),
        },
        create: {
          trackId,
          code2: "GLOBAL",
          date: today,
          viralScore,
          rightsComplexityScore: 0.5,
        },
      });

      // Write to track_trend_labels
      const existingLabel = await db.trackTrendLabel.findUnique({
        where: {
          trackId_genre_code2: {
            trackId,
            genre: null,
            code2: "GLOBAL",
          },
        },
        select: { label: true, firstSeenAt: true },
      });

      const isNewLabel = !existingLabel || existingLabel.label !== label;
      await db.trackTrendLabel.upsert({
        where: {
          trackId_genre_code2: {
            trackId,
            genre: null,
            code2: "GLOBAL",
          },
        },
        update: {
          label,
          firstSeenAt:
            isNewLabel && label !== "NONE" ? today : existingLabel?.firstSeenAt ?? today,
          lastSeenAt: today,
          updatedAt: new Date(),
        },
        create: {
          trackId,
          genre: null,
          code2: "GLOBAL",
          label,
          firstSeenAt: label !== "NONE" ? today : null,
          lastSeenAt: today,
        },
      });

      // Update ugc_track_metrics views7dGrowth if we have better data (tiktokGrowth)
      if (tiktokViewsGrowth7d !== 0) {
        await db.ugcTrackMetrics.updateMany({
          where: {
            trackId,
            date: today,
            code2: "GLOBAL",
          },
          data: {
            views7dGrowth: tiktokViewsGrowth7d,
            updatedAt: new Date(),
          },
        });
      }

      processed++;
    } catch (err) {
      console.error(`  Error processing trackId=${trackId}:`, err);
      errors++;
    }
  }

  console.log(`[compute_track_signals] Done. processed=${processed}, errors=${errors}`);
}

if (require.main === module) {
  const dateArg = process.argv[2];
  computeTrackSignals(dateArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
