/**
 * LambdaMART-inspired signal ranking for breakout prediction explanations.
 *
 * Ranks which signals are most responsible for a given artist's breakout score,
 * personalized to the artist's specific values (not just global feature importance).
 *
 * This is a lightweight approximation of LambdaMART using pre-learned weights
 * combined with artist-specific signal values, without requiring a full
 * learning-to-rank training pipeline.
 */

import type { TrajectorySignal } from "./types";

export interface RankedSignal {
  signal: string;
  rawValue: number;
  normalizedValue: number;        // 0-1 normalized
  weight: number;                 // global importance weight
  contribution: number;           // weight × normalizedValue (this artist)
  rank: number;                   // 1-based rank for this artist
  interpretation: string;
  percentileLabel: string;        // "Top 5%", "Above average", etc.
  trend: "rising" | "falling" | "stable" | "unknown";
  source: string;
  isStale: boolean;
}

export interface SignalRankingResult {
  artistId: number;
  topSignals: RankedSignal[];     // top 3 for UI
  allSignals: RankedSignal[];     // all ranked signals
  overallScore: number;           // weighted sum of contributions
  explanationText: string;        // human-readable 1-sentence summary
  dataQualityWarnings: string[];  // stale/missing signal warnings
}

// Global learned weights (from validated A&R model)
const SIGNAL_WEIGHTS: Record<string, number> = {
  save_rate:                  0.22,
  tiktok_growth:              0.28,
  stream_velocity:            0.20,
  follower_velocity:          0.09,
  chart_momentum:             0.10,
  playlist_signal:            0.05,
  radio_spike:                0.02,
  pre_save_normalized:        0.02,
  listener_follower_conversion: 0.02,
};

// Percentile thresholds (approximate industry benchmarks)
const PERCENTILE_THRESHOLDS: Record<string, { top5: number; top20: number; avg: number }> = {
  save_rate:         { top5: 0.35, top20: 0.25, avg: 0.15 },
  tiktok_growth:     { top5: 0.75, top20: 0.50, avg: 0.25 },
  stream_velocity:   { top5: 0.70, top20: 0.45, avg: 0.20 },
  follower_velocity: { top5: 0.40, top20: 0.20, avg: 0.08 },
  chart_momentum:    { top5: 0.65, top20: 0.40, avg: 0.15 },
  playlist_signal:   { top5: 0.60, top20: 0.35, avg: 0.10 },
  radio_spike:       { top5: 0.55, top20: 0.30, avg: 0.05 },
};

const SIGNAL_INTERPRETATIONS: Record<string, (v: number, pct: string) => string> = {
  save_rate:         (v, p) => `${p} save rate (${(v*100).toFixed(0)}%) — fans saving to library`,
  tiktok_growth:     (v, p) => `${p} TikTok traction — ${v > 0.7 ? "viral acceleration" : v > 0.4 ? "growing usage" : "early seeding"}`,
  stream_velocity:   (v, p) => `${p} streaming growth — ${v > 0.6 ? "strong organic pull" : "moderate momentum"}`,
  follower_velocity: (v, p) => `${p} follower growth — ${v > 0.3 ? "rapid social expansion" : "steady audience building"}`,
  chart_momentum:    (v, p) => `${p} chart trajectory — ${v > 0.6 ? "actively rising" : "entering chart range"}`,
  playlist_signal:   (v, p) => `${p} playlist activity — ${v > 0.5 ? "heavy editorial adds" : "algorithmic adds"}`,
  radio_spike:       (v, p) => `${p} radio airplay — traditional breakout signal`,
  pre_save_normalized: (v, p) => `${p} pre-save momentum — pre-release audience anticipation`,
};

function getPercentileLabel(signal: string, value: number): string {
  const t = PERCENTILE_THRESHOLDS[signal];
  if (!t) return "Measured";
  if (value >= t.top5) return "Top 5%";
  if (value >= t.top20) return "Top 20%";
  if (value >= t.avg) return "Above average";
  return "Below average";
}

function detectTrend(
  current: TrajectorySignal,
  history: TrajectorySignal[]
): "rising" | "falling" | "stable" | "unknown" {
  const sorted = [...history]
    .filter(s => s.signalType === current.signalType)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
  if (sorted.length < 3) return "unknown";
  const recent = sorted.slice(-3).map(s => s.value);
  const slope = (recent[2] - recent[0]) / 2;
  if (slope > 0.05) return "rising";
  if (slope < -0.05) return "falling";
  return "stable";
}

const SIGNAL_TTL_HOURS_TS: Record<string, number> = {
  tiktok_growth:  6, stream_velocity: 48, save_rate: 72,
  follower_velocity: 24, chart_momentum: 168, radio_spike: 168,
};

export function rankSignals(
  artistId: number,
  signals: TrajectorySignal[],
  featureVector: Record<string, number>
): SignalRankingResult {
  const warnings: string[] = [];
  const ranked: RankedSignal[] = [];

  for (const [signal, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const rawValue = featureVector[signal] ?? null;
    if (rawValue === null) {
      warnings.push(`Missing signal: ${signal}`);
      continue;
    }

    // Get latest signal record for metadata
    const latestSig = signals
      .filter(s => s.signalType === signal)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];

    const source = latestSig?.source ?? "unknown";
    const ttl = SIGNAL_TTL_HOURS_TS[signal] ?? 24;
    const ageHours = latestSig
      ? (Date.now() - new Date(latestSig.recordedAt).getTime()) / 3_600_000
      : Infinity;
    const isStale = ageHours > ttl;
    if (isStale) warnings.push(`Stale signal: ${signal} (${ageHours.toFixed(0)}h old, TTL ${ttl}h)`);

    // Apply source discount
    const sourceDiscount = source === "unofficial" ? 0.70 : source === "scraped" ? 0.65 : 1.0;
    const normalizedValue = Math.min(Math.max(rawValue * sourceDiscount, 0), 1);
    const contribution = weight * normalizedValue;
    const percentileLabel = getPercentileLabel(signal, normalizedValue);
    const interpretation = SIGNAL_INTERPRETATIONS[signal]?.(normalizedValue, percentileLabel) ?? signal;
    const trend = latestSig ? detectTrend(latestSig, signals) : "unknown";

    ranked.push({
      signal, rawValue, normalizedValue, weight, contribution,
      rank: 0, interpretation, percentileLabel, trend, source, isStale,
    });
  }

  // Sort by contribution descending, assign ranks
  ranked.sort((a, b) => b.contribution - a.contribution);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const overallScore = ranked.reduce((sum, r) => sum + r.contribution, 0);

  // Generate explanation text from top 2 signals
  const top2 = ranked.slice(0, 2);
  const explanationText = top2.length >= 2
    ? `Driven by ${top2[0].percentileLabel.toLowerCase()} ${top2[0].signal.replace(/_/g, " ")} and ${top2[1].percentileLabel.toLowerCase()} ${top2[1].signal.replace(/_/g, " ")}.`
    : top2.length === 1
    ? `Primary signal: ${top2[0].interpretation}`
    : "Insufficient signal data for explanation.";

  return {
    artistId,
    topSignals: ranked.slice(0, 3),
    allSignals: ranked,
    overallScore,
    explanationText,
    dataQualityWarnings: warnings,
  };
}
