// Feature extraction from raw signals
import { TrajectorySignal } from './types';

/**
 * 7-day slope normalized by mean stream count.
 */
export function extractStreamVelocity(dailyStreams: number[]): number {
  if (dailyStreams.length < 2) return 0;
  const slice = dailyStreams.slice(-7);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  if (mean === 0) return 0;

  // Simple linear regression slope over days [0..n-1]
  const n = slice.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += slice[i];
    sumXY += i * slice[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  return slope / mean;
}

/**
 * Exponential growth rate: log(t7/t1) / 7
 */
export function extractTiktokGrowth(dailyCounts: number[]): number {
  if (dailyCounts.length < 7) return 0;
  const t1 = dailyCounts[0];
  const t7 = dailyCounts[6];
  if (t1 <= 0 || t7 <= 0) return 0;
  return Math.log(t7 / t1) / 7;
}

/**
 * Rank improvement rate (positive = improving/rising).
 * Lower rank number = better chart position, so improvement means decreasing rank.
 */
export function extractChartMomentum(
  chartRanks: Array<{ rank: number; date: Date }>,
): number {
  if (chartRanks.length < 2) return 0;
  const sorted = [...chartRanks].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0].rank;
  const last = sorted[sorted.length - 1].rank;
  const days =
    (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) /
    (1000 * 60 * 60 * 24);
  if (days === 0) return 0;
  // Positive = rank number decreasing = moving up the charts
  return (first - last) / days / 100;
}

/**
 * Net playlist signal: (adds - removes) / totalPlaylists, clamped to [-1, 1]
 */
export function extractPlaylistSignal(
  addEvents: number,
  removeEvents: number,
  totalPlaylists: number,
): number {
  if (totalPlaylists <= 0) return 0;
  return Math.max(-1, Math.min(1, (addEvents - removeEvents) / totalPlaylists));
}

/**
 * Z-score of latest weekly spins relative to baseline.
 */
export function extractRadioSpike(weeklySpins: number[], baseline: number): number {
  if (weeklySpins.length === 0) return 0;
  const latest = weeklySpins[weeklySpins.length - 1];
  const mean = weeklySpins.reduce((a, b) => a + b, 0) / weeklySpins.length;
  const variance =
    weeklySpins.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / weeklySpins.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (latest - baseline) / std;
}

/**
 * Aggregate all signals by type and return normalized feature dict.
 */
export function computeFeatureVector(
  signals: TrajectorySignal[],
): Record<string, number> {
  const byType: Record<string, number[]> = {};

  for (const signal of signals) {
    if (!byType[signal.signalType]) {
      byType[signal.signalType] = [];
    }
    byType[signal.signalType].push(signal.value);
  }

  const features: Record<string, number> = {};

  // stream_velocity: average of values
  if (byType['stream_velocity']?.length) {
    const vals = byType['stream_velocity'];
    features['stream_velocity'] = vals.reduce((a, b) => a + b, 0) / vals.length;
  } else {
    features['stream_velocity'] = 0;
  }

  // tiktok_growth: max of values (peak growth rate)
  if (byType['tiktok_growth']?.length) {
    features['tiktok_growth'] = Math.max(...byType['tiktok_growth']);
  } else {
    features['tiktok_growth'] = 0;
  }

  // chart_momentum: average of values
  if (byType['chart_entry']?.length) {
    const vals = byType['chart_entry'];
    features['chart_momentum'] = vals.reduce((a, b) => a + b, 0) / vals.length;
  } else {
    features['chart_momentum'] = 0;
  }

  // playlist: average of values
  if (byType['playlist_add']?.length) {
    const vals = byType['playlist_add'];
    features['playlist'] = vals.reduce((a, b) => a + b, 0) / vals.length;
  } else {
    features['playlist'] = 0;
  }

  // radio: average of values
  if (byType['radio_spike']?.length) {
    const vals = byType['radio_spike'];
    features['radio'] = vals.reduce((a, b) => a + b, 0) / vals.length;
  } else {
    features['radio'] = 0;
  }

  // Normalize each feature to [0, 1] using a soft sigmoid-like clamp
  for (const key of Object.keys(features)) {
    features[key] = Math.max(0, Math.min(1, (features[key] + 1) / 2));
  }

  return features;
}
