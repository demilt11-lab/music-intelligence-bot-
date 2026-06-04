// Scoring functions — rule-based + statistical, no ML model dependency
import { TrajectorySignal, TrajectoryScore } from './types';

/**
 * Exponentially weighted moving average.
 */
export function ewma(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = alpha * values[i] + (1 - alpha) * result;
  }
  return result;
}

/**
 * Standard z-score.
 */
export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Weighted sum of feature scores, clamped to [0, 1].
 * weights: stream_velocity=0.3, tiktok_growth=0.4, chart_momentum=0.2, playlist=0.05, radio=0.05
 */
export function computeMomentum(features: Record<string, number>): number {
  const weights: Record<string, number> = {
    stream_velocity: 0.3,
    tiktok_growth: 0.4,
    chart_momentum: 0.2,
    playlist: 0.05,
    radio: 0.05,
  };

  let momentum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    momentum += weight * (features[key] ?? 0);
  }

  return Math.max(0, Math.min(1, momentum));
}

/**
 * sigmoid helper
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Breakout probability: sigmoid(momentum * 3 - 1.5) boosted by recent signals.
 */
export function estimateBreakoutProb(
  momentum: number,
  signals: TrajectorySignal[],
): number {
  let prob = sigmoid(momentum * 3 - 1.5);

  // Boost for recent chart_entry signals (within last 14 days)
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentChartEntries = signals.filter(
    (s) => s.signalType === 'chart_entry' && s.recordedAt >= twoWeeksAgo,
  );
  if (recentChartEntries.length > 0) {
    prob = Math.min(1, prob + 0.1 * recentChartEntries.length);
  }

  // Boost for high tiktok_growth signals
  const highTiktok = signals.filter(
    (s) => s.signalType === 'tiktok_growth' && s.value > 0.5,
  );
  if (highTiktok.length > 0) {
    prob = Math.min(1, prob + 0.05 * highTiktok.length);
  }

  return Math.max(0, Math.min(1, prob));
}

/**
 * Exponential decay mapping from breakout probability to estimated days to viral.
 * breakoutProb > 0.8 → ~7d, 0.6 → ~21d, 0.4 → ~60d, else 180d
 */
export function estimateDaysToViral(breakoutProb: number): number {
  if (breakoutProb > 0.8) {
    // interpolate between 7 and 21
    return 7 + (1 - breakoutProb) / 0.2 * (21 - 7);
  } else if (breakoutProb > 0.6) {
    return 21 + (0.8 - breakoutProb) / 0.2 * (60 - 21);
  } else if (breakoutProb > 0.4) {
    return 60 + (0.6 - breakoutProb) / 0.2 * (180 - 60);
  }
  return 180;
}

/**
 * Estimate peak score in [0, 100] based on momentum and signals.
 */
export function estimatePeakScore(
  momentum: number,
  signals: TrajectorySignal[],
): number {
  const base = momentum * 80;

  // Signal count bonus (up to 10)
  const signalBonus = Math.min(10, signals.length * 0.5);

  // Recency bonus: signals in last 7 days
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCount = signals.filter((s) => s.recordedAt >= oneWeekAgo).length;
  const recencyBonus = Math.min(10, recentCount * 1.0);

  return Math.max(0, Math.min(100, base + signalBonus + recencyBonus));
}

/**
 * Full trajectory score computation.
 */
export function computeTrajectoryScore(
  features: Record<string, number>,
  signals: TrajectorySignal[],
): TrajectoryScore {
  const momentum = computeMomentum(features);
  const breakoutProb = estimateBreakoutProb(momentum, signals);
  const estimatedDaysToViral = estimateDaysToViral(breakoutProb);
  const peakScoreEstimate = estimatePeakScore(momentum, signals);

  // viralityScore: composite of momentum and breakout probability
  const viralityScore = Math.max(0, Math.min(1, momentum * 0.6 + breakoutProb * 0.4));

  // confidence: based on signal count (more signals = higher confidence), capped at 0.95
  const confidence = Math.min(0.95, 0.3 + Math.min(signals.length, 20) * 0.0325);

  return {
    momentum,
    breakoutProb,
    viralityScore,
    estimatedDaysToViral,
    peakScoreEstimate,
    confidence,
  };
}
