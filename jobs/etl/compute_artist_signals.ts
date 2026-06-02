// jobs/etl/compute_artist_signals.ts
// Feature engineering ETL: compute artist-level signals from aggregated track signals.
import { db } from "@/lib/db";

// ─── Math helpers ─────────────────────────────────────────────────────────────

function safeNum(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "bigint") return Number(v);
  return isNaN(v as number) ? 0 : (v as number);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// ─── Stream estimate from chart rank ─────────────────────────────────────────
// rank 1 = 1,000,000 streams/day, rank 50 = 20,000, linear interpolation

function streamEstimateFromRank(rank: number): number {
  const minRank = 1;
  const maxRank = 50;
  const maxStreams = 1_000_000;
  const minStreams = 20_000;
  const clamped = clamp(rank, minRank, maxRank);
  // linear: rank1→1M, rank50→20k
  return maxStreams - ((clamped - minRank) / (maxRank - minRank)) * (maxStreams - minStreams);
}

// ─── Load track viral scores written by compute_track_signals ────────────────

interface TrackSignals {
  trackId: number;
  viralScore: number;
  tiktokViewsGrowth7d: number;
}

async function loadTrackSignals(today: Date): Promise<Map<number, TrackSignals>> {
  // Load viralScores from talent_scout_scores for today
  const scores = await db.talentScoutScore.findMany({
    where: { date: today, code2: "GLOBAL" },
    select: { trackId: true, viralScore: true },
  });

  // Load tiktok growth from ugc_track_metrics (latest per track)
  const tiktokRows = await db.$queryRaw<
    { track_id: number; views7d_growth: number }[]
  >`
    SELECT DISTINCT ON ("trackId")
      "trackId" AS track_id,
      "views7dGrowth" AS views7d_growth
    FROM ugc_track_metrics
    WHERE date <= ${today}
    ORDER BY "trackId", date DESC
  `;

  const tiktokMap = new Map<number, number>();
  for (const r of tiktokRows) {
    tiktokMap.set(r.track_id, r.views7d_growth ?? 0);
  }

  const result = new Map<number, TrackSignals>();
  for (const s of scores) {
    result.set(s.trackId, {
      trackId: s.trackId,
      viralScore: s.viralScore,
      tiktokViewsGrowth7d: tiktokMap.get(s.trackId) ?? 0,
    });
  }
  return result;
}

// ─── Chart-based stream estimates ────────────────────────────────────────────

interface ChartStreamEstimate {
  streams7d: number;
  streams7dPrior: number; // prior 7 days (7–14 days ago)
  weeksOnChart: number;   // max weeks_on_chart across all markets for this track
}

async function loadChartStreamEstimates(today: Date): Promise<Map<number, ChartStreamEstimate>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  const rows = await db.$queryRaw<
    {
      track_id: number;
      rank: number;
      weeks_on_chart: number | null;
      snapshot_date: Date;
    }[]
  >`
    SELECT
      cr."trackId" AS track_id,
      cr.rank,
      cr."weeksOnChart" AS weeks_on_chart,
      cs."snapshotDate" AS snapshot_date
    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
    WHERE cs."snapshotDate" >= ${fourteenDaysAgo}
      AND cs."snapshotDate" <= ${today}
      AND cs.platform = 'spotify'
  `;

  const accum = new Map<
    number,
    { streams7d: number; streams7dPrior: number; maxWeeksOnChart: number }
  >();

  for (const r of rows) {
    const est = streamEstimateFromRank(r.rank);
    const snapshotTime = new Date(r.snapshot_date).getTime();
  const sevenDaysAgoTime = sevenDaysAgo.getTime();

    const existing = accum.get(r.track_id) ?? {
      streams7d: 0,
      streams7dPrior: 0,
      maxWeeksOnChart: 0,
    };

    if (snapshotTime >= sevenDaysAgoTime) {
      existing.streams7d += est;
    } else {
      existing.streams7dPrior += est;
    }
    existing.maxWeeksOnChart = Math.max(
      existing.maxWeeksOnChart,
      r.weeks_on_chart ?? 0,
    );
    accum.set(r.track_id, existing);
  }

  const result = new Map<number, ChartStreamEstimate>();
  for (const [trackId, v] of accum) {
    result.set(trackId, {
      streams7d: v.streams7d,
      streams7dPrior: v.streams7dPrior,
      weeksOnChart: v.maxWeeksOnChart,
    });
  }
  return result;
}

// ─── Radio spin growth ────────────────────────────────────────────────────────

async function loadRadioSpinGrowth(today: Date): Promise<Map<number, number>> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(today.getDate() - 14);

  const rows = await db.$queryRaw<
    { track_id: number; spins_7d: bigint; spins_prev: bigint }[]
  >`
    SELECT
      "trackId" AS track_id,
      SUM(CASE WHEN date >= ${sevenDaysAgo} AND date <= ${today} THEN COALESCE("radioPlays", 0) ELSE 0 END) AS spins_7d,
      SUM(CASE WHEN date >= ${fourteenDaysAgo} AND date < ${sevenDaysAgo} THEN COALESCE("radioPlays", 0) ELSE 0 END) AS spins_prev
    FROM track_platform_stats_daily
    WHERE platform = 'radio'
      AND date >= ${fourteenDaysAgo}
      AND date <= ${today}
    GROUP BY "trackId"
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

// ─── Classify artist status ───────────────────────────────────────────────────

function classifyArtistStatus(
  streams7dDelta: number,
  tiktokVelocityScore: number,
  maxTrackProbViral: number,
  maxWeeksOnChart: number,
): string {
  if (
    streams7dDelta > 0.5 &&
    tiktokVelocityScore > 0.3 &&
    maxTrackProbViral > 0.5
  ) {
    return "ABOUT_TO_BREAK";
  }
  if (maxWeeksOnChart >= 4) return "ESTABLISHED";
  if (streams7dDelta > 0.15 || tiktokVelocityScore > 0.2) return "GROWING";
  if (streams7dDelta < -0.2) return "DECLINING";
  return "STABLE";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function computeArtistSignals(dateStr?: string): Promise<void> {
  const today = dateStr ? new Date(dateStr) : new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  console.log(`[compute_artist_signals] Running for ${todayIso}`);

  // Load all artists and their track associations
  const artistTracks = await db.trackArtist.findMany({
    select: { artistId: true, trackId: true },
  });

  // Build artistId → Set<trackId>
  const artistToTracks = new Map<number, Set<number>>();
  for (const at of artistTracks) {
    const set = artistToTracks.get(at.artistId) ?? new Set<number>();
    set.add(at.trackId);
    artistToTracks.set(at.artistId, set);
  }

  console.log(`  Loaded ${artistToTracks.size} artists`);

  // Load track-level signals in parallel
  const [trackSignalsMap, chartStreamMap, radioGrowthMap] = await Promise.all([
    loadTrackSignals(today),
    loadChartStreamEstimates(today),
    loadRadioSpinGrowth(today),
  ]);

  console.log(
    `  trackSignals=${trackSignalsMap.size}, chartStreams=${chartStreamMap.size}, radio=${radioGrowthMap.size}`,
  );

  let processed = 0;
  let errors = 0;

  for (const [artistId, trackIds] of artistToTracks) {
    try {
      // Aggregate signals across artist's tracks
      let maxTrackProbViral = 0;
      let totalStreams7d = 0;
      let totalStreams7dPrior = 0;
      let maxWeeksOnChart = 0;
      let tiktokGrowthSum = 0;
      let tiktokGrowthCount = 0;
      let airplayGrowthSum = 0;
      let airplayGrowthCount = 0;

      for (const trackId of trackIds) {
        const sig = trackSignalsMap.get(trackId);
        if (sig) {
          maxTrackProbViral = Math.max(maxTrackProbViral, sig.viralScore);
          if (sig.tiktokViewsGrowth7d !== 0) {
            tiktokGrowthSum += sig.tiktokViewsGrowth7d;
            tiktokGrowthCount++;
          }
        }

        const chartEst = chartStreamMap.get(trackId);
        if (chartEst) {
          totalStreams7d += chartEst.streams7d;
          totalStreams7dPrior += chartEst.streams7dPrior;
          maxWeeksOnChart = Math.max(maxWeeksOnChart, chartEst.weeksOnChart);
        }

        const radioGrowth = radioGrowthMap.get(trackId);
        if (radioGrowth !== undefined) {
          airplayGrowthSum += radioGrowth;
          airplayGrowthCount++;
        }
      }

      // Compute derived metrics
      const streams7dDelta =
        totalStreams7dPrior > 0
          ? (totalStreams7d - totalStreams7dPrior) / totalStreams7dPrior
          : totalStreams7d > 0
          ? 1
          : 0;

      const tiktokVelocityScore =
        tiktokGrowthCount > 0 ? tiktokGrowthSum / tiktokGrowthCount : 0;

      const airplayVelocityScore =
        airplayGrowthCount > 0 ? airplayGrowthSum / airplayGrowthCount : 0;

      const status = classifyArtistStatus(
        streams7dDelta,
        tiktokVelocityScore,
        maxTrackProbViral,
        maxWeeksOnChart,
      );

      // statusScore: composite 0–1
      const statusScore = clamp(
        0.4 * maxTrackProbViral +
          0.3 * clamp(streams7dDelta, -1, 1) * 0.5 + 0.15 +
          0.2 * clamp(tiktokVelocityScore, 0, 2) / 2 +
          0.1 * clamp(airplayVelocityScore, 0, 2) / 2,
        0,
        1,
      );

      // Upsert to ArtistTrajectorySnapshot
      // No unique constraint defined in schema — use findFirst + create/update pattern
      const existing = await db.artistTrajectorySnapshot.findFirst({
        where: {
          artistId,
          date: today,
        },
        select: { id: true },
      });

      const payload = {
        streams7d: BigInt(Math.round(totalStreams7d)),
        streams28d: BigInt(Math.round(totalStreams7d * 4)), // estimate
        streams90d: BigInt(Math.round(totalStreams7d * 12.86)), // estimate
        streams7dDelta,
        streams28dDelta: streams7dDelta * 0.8, // smoothed approximation
        streams90dDelta: streams7dDelta * 0.5, // smoothed approximation
        tiktokVelocityScore,
        airplayVelocityScore,
        maxTrackProbViral,
        status,
        statusScore,
        breakProbability: maxTrackProbViral,
      };

      if (existing) {
        await db.artistTrajectorySnapshot.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await db.artistTrajectorySnapshot.create({
          data: {
            artistId,
            date: today,
            ...payload,
          },
        });
      }

      processed++;
    } catch (err) {
      console.error(`  Error processing artistId=${artistId}:`, err);
      errors++;
    }
  }

  console.log(`[compute_artist_signals] Done. processed=${processed}, errors=${errors}`);
}

if (require.main === module) {
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  computeArtistSignals(dateArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
