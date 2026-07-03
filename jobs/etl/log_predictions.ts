// jobs/etl/log_predictions.ts
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';

/**
 * Log today's model predictions to prediction_outcomes for later evaluation.
 *
 * Sources:
 *   - track_trend_labels      → predictionType='trend_label',       modelName='compute_track_signals'
 *   - talent_scout_scores     → predictionType='viral_score',        modelName='compute_track_signals'
 *   - artist_trajectory_snapshots → predictionType='break_probability', modelName='compute_artist_signals'
 *
 * Idempotent: skips rows whose predictedAt date was already logged today.
 */
export async function logPredictions(dateStr: string): Promise<void> {
  const todayDate = new Date(dateStr);

  // Window for "today": midnight to end-of-day (UTC)
  const todayStart = new Date(dateStr);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(dateStr);
  todayEnd.setUTCHours(23, 59, 59, 999);

  // ─────────────────────────────────────────────
  // 1. Idempotency check — skip if already logged today
  // ─────────────────────────────────────────────
  const alreadyLogged = await db.predictionOutcome.count({
    where: {
      predictedAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  if (alreadyLogged > 0) {
    console.log(
      `[log_predictions] Already logged ${alreadyLogged} prediction(s) for ${dateStr}. Skipping.`,
    );
    return;
  }

  // ─────────────────────────────────────────────
  // 2. trend_label predictions from track_trend_labels
  // ─────────────────────────────────────────────
  const trendLabels = await db.trackTrendLabel.findMany({
    where: {
      updatedAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  console.log(
    `[log_predictions] Found ${trendLabels.length} trend label(s) updated on ${dateStr}.`,
  );

  const trendLabelData = trendLabels.map((row) => ({
    trackId: row.trackId,
    artistId: null as number | null,
    predictionType: "trend_label",
    predictedValue: row.label,
    predictedAt: todayDate,
    modelName: "compute_track_signals",
    modelVersion: null as string | null,
  }));

  // ─────────────────────────────────────────────
  // 3. viral_score predictions from talent_scout_scores
  // ─────────────────────────────────────────────
  const talentScores = await db.talentScoutScore.findMany({
    where: {
      date: todayDate,
    },
  });

  console.log(
    `[log_predictions] Found ${talentScores.length} talent scout score(s) for ${dateStr}.`,
  );

  const viralScoreData = talentScores.map((row) => ({
    trackId: row.trackId,
    artistId: null as number | null,
    predictionType: "viral_score",
    predictedValue: row.viralScore.toFixed(3),
    predictedAt: todayDate,
    modelName: "compute_track_signals",
    modelVersion: null as string | null,
  }));

  // ─────────────────────────────────────────────
  // 4. break_probability predictions from artist_trajectory_snapshots
  // ─────────────────────────────────────────────
  const trajectorySnapshots = await db.artistTrajectorySnapshot.findMany({
    where: {
      date: todayDate,
      breakProbability: {
        not: null,
      },
    },
  });

  console.log(
    `[log_predictions] Found ${trajectorySnapshots.length} trajectory snapshot(s) with breakProbability for ${dateStr}.`,
  );

  const breakProbData = trajectorySnapshots.map((row) => ({
    trackId: null as number | null,
    artistId: row.artistId,
    predictionType: "break_probability",
    predictedValue: (row.breakProbability as number).toFixed(3),
    predictedAt: todayDate,
    modelName: "compute_artist_signals",
    modelVersion: null as string | null,
  }));

  // ─────────────────────────────────────────────
  // 4b. ml_trend_label predictions from the *actual trained model's own
  //     output* (TrackTrendPrediction), not the rule-based heuristic it was
  //     trained on. Without this, evaluate_predictions only ever scores the
  //     heuristic against itself/outcomes — the trained ML model's own
  //     accuracy was never measured against anything.
  // ─────────────────────────────────────────────
  const mlPredictions = await db.trackTrendPrediction.findMany({
    where: { modelName: "track-viral" },
  });

  console.log(
    `[log_predictions] Found ${mlPredictions.length} ML track-viral prediction(s) to snapshot for ${dateStr}.`,
  );

  const mlTrendLabelData = mlPredictions.map((row) => ({
    trackId: row.trackId,
    artistId: null as number | null,
    predictionType: "ml_trend_label",
    predictedValue: row.label,
    predictedAt: todayDate,
    modelName: row.modelName,
    modelVersion: row.modelVersion as string | null,
  }));

  // ─────────────────────────────────────────────
  // 5. Bulk insert all prediction outcomes
  // ─────────────────────────────────────────────
  const allPredictions = [
    ...trendLabelData,
    ...viralScoreData,
    ...breakProbData,
    ...mlTrendLabelData,
  ];

  if (allPredictions.length === 0) {
    console.log(
      `[log_predictions] No predictions to log for ${dateStr}.`,
    );
    return;
  }

  const result = await db.predictionOutcome.createMany({
    data: allPredictions,
    skipDuplicates: true,
  });

  console.log(
    `[log_predictions] Inserted ${result.count} prediction outcome(s) for ${dateStr}.`,
  );
}

if (require.main === module) {
  const dateArg = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  runTrackedJob('etl:log-predictions', () => logPredictions(dateArg))
    .then(() => {
      console.log(`[log_predictions] Done for ${dateArg}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[log_predictions] Fatal error:", err);
      process.exit(1);
    });
}
