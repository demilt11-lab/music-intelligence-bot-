import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth/middleware";
import { logger } from "@/lib/monitoring/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SignalRole = "leading" | "lagging" | "coincident";
type SpikeType = "organic" | "algorithmic" | "viral_meme" | "noise" | "unknown";
type RegimeType = "acceleration" | "deceleration" | "plateau" | "decline" | "breakout" | "recovery";
type TrendDirection = "up" | "down" | "flat";

interface RollingStats {
  signal: string;
  ma7: number | null;
  ma14: number | null;
  ma30: number | null;
  wowPct: number | null;         // week-over-week %
  momPct: number | null;         // month-over-month %
  velocity: number | null;       // smoothed growth rate
  acceleration: number | null;   // change in velocity
  trendDirection: TrendDirection;
  trendStrength: number;
}

interface SpikeEvent {
  date: string;
  signal: string;
  value: number;
  zScore: number;
  spikeType: SpikeType;
  magnitude: "major" | "moderate" | "minor";
  isSustained: boolean;
  daysSustained: number;
  likelyCause: string;
  breakoutSignal: boolean;
  explanation: string;
}

interface LeadingIndicatorResult {
  signal: string;
  role: SignalRole;
  avgLeadDays: number;
  predictiveValue: "high" | "medium" | "low";
  explanation: string;
}

interface RegimeChange {
  date: string;
  signal: string;
  fromRegime: RegimeType;
  toRegime: RegimeType;
  magnitude: number;
  confidence: number;
  explanation: string;
}

interface Forecast {
  horizonDays: number;
  breakoutProbability: number;
  probabilityLower: number;
  probabilityUpper: number;
  expectedBreakoutDay: number | null;
  timelineUncertaintyDays: number;
  confidenceLevel: "high" | "medium" | "low";
  keyDrivers: string[];
  explanation: string;
}

interface RiskFactor {
  name: string;
  category: string;
  severity: "high" | "medium" | "low";
  probability: "likely" | "possible" | "unlikely";
  impactOnForecast: string;
  monitoringSignal: string;
}

interface MonitoringSignal {
  signal: string;
  checkFrequency: "daily" | "weekly";
  alertThreshold: string;
  whyImportant: string;
}

interface TrendsResult {
  artistId: number;
  artistName: string;
  predictionDate: string;
  rollingStats: RollingStats[];
  spikeEvents: SpikeEvent[];
  leadingIndicators: LeadingIndicatorResult[];
  regimeChanges: RegimeChange[];
  forecast30d: Forecast;
  forecast90d: Forecast;
  riskFactors: RiskFactor[];
  monitoringSignals: MonitoringSignal[];
  dataPointsUsed: number;
  temporalLeakageCheck: string;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_SIGNALS = [
  "stream_velocity", "tiktok_growth", "save_rate", "follower_velocity",
  "chart_momentum", "playlist_signal", "radio_spike", "skip_rate",
  "listener_follower_conversion",
];

const SIGNAL_ROLES: Record<string, { role: SignalRole; avgLeadDays: number; explanation: string }> = {
  tiktok_growth: {
    role: "leading", avgLeadDays: 14,
    explanation: "TikTok/UGC virality precedes streaming acceleration by 10-21 days as users discover music then seek it on DSPs.",
  },
  save_rate: {
    role: "leading", avgLeadDays: 7,
    explanation: "Save rate >15% indicates committed fans who return, a leading indicator of sustained streaming growth and playlist adds.",
  },
  playlist_signal: {
    role: "leading", avgLeadDays: 3,
    explanation: "Playlist additions precede listener count spikes by 3-7 days as the track surfaces to new audiences.",
  },
  follower_velocity: {
    role: "leading", avgLeadDays: 21,
    explanation: "Follower acceleration precedes chart entry — fans follow before a track charts, discovered through social/UGC first.",
  },
  listener_follower_conversion: {
    role: "leading", avgLeadDays: 10,
    explanation: "High listener-to-follower conversion predicts retention — artists with high conversion build sustainable audiences.",
  },
  stream_velocity: {
    role: "coincident", avgLeadDays: 0,
    explanation: "Stream velocity moves with breakout events — confirms but does not lead. Use as confirmation of what TikTok/save_rate predicted.",
  },
  chart_momentum: {
    role: "lagging", avgLeadDays: -14,
    explanation: "Chart position is a lagging indicator — reflects what already happened in streaming, not what is about to happen.",
  },
  radio_spike: {
    role: "lagging", avgLeadDays: -21,
    explanation: "Radio adds happen after a track has demonstrated digital traction. Radio-first strategies are rare for emerging artists.",
  },
  skip_rate: {
    role: "coincident", avgLeadDays: 0,
    explanation: "Skip rate reflects current listener satisfaction — high skip rate suppresses algorithmic distribution.",
  },
};

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function windowSlice(arr: number[], end: number, size: number): number[] {
  const start = Math.max(0, end - size + 1);
  return arr.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Rolling stats
// ---------------------------------------------------------------------------

function computeRollingStats(
  series: { date: string; value: number }[],
  signal: string,
): RollingStats {
  const vals = series.map(s => s.value);
  const n = vals.length;

  if (n === 0) {
    return { signal, ma7: null, ma14: null, ma30: null, wowPct: null, momPct: null, velocity: null, acceleration: null, trendDirection: "flat", trendStrength: 0 };
  }

  const ma7  = n >= 7  ? mean(vals.slice(-7))  : null;
  const ma14 = n >= 14 ? mean(vals.slice(-14)) : null;
  const ma30 = n >= 30 ? mean(vals.slice(-30)) : null;

  // WoW: compare last 7-day avg vs prior 7-day avg
  let wowPct: number | null = null;
  if (n >= 14) {
    const cur7  = mean(vals.slice(-7));
    const prev7 = mean(vals.slice(-14, -7));
    wowPct = ((cur7 - prev7) / (Math.abs(prev7) + 1e-8)) * 100;
  }

  // MoM: compare last 30-day avg vs prior 30-day avg
  let momPct: number | null = null;
  if (n >= 60) {
    const cur30  = mean(vals.slice(-30));
    const prev30 = mean(vals.slice(-60, -30));
    momPct = ((cur30 - prev30) / (Math.abs(prev30) + 1e-8)) * 100;
  }

  const velocity = wowPct;

  // Acceleration: velocity change over last 7 days
  let acceleration: number | null = null;
  if (n >= 21) {
    const cur7  = mean(vals.slice(-7));
    const prev7 = mean(vals.slice(-14, -7));
    const pp7   = mean(vals.slice(-21, -14));
    const velNow  = ((cur7 - prev7) / (Math.abs(prev7) + 1e-8)) * 100;
    const velPrev = ((prev7 - pp7) / (Math.abs(pp7) + 1e-8)) * 100;
    acceleration = velNow - velPrev;
  }

  const trendDirection: TrendDirection =
    velocity !== null && velocity > 2 ? "up" :
    velocity !== null && velocity < -2 ? "down" : "flat";

  const trendStrength = velocity !== null ? Math.min(Math.abs(velocity) / 100, 1.0) : 0;

  return { signal, ma7, ma14, ma30, wowPct, momPct, velocity, acceleration, trendDirection, trendStrength };
}

// ---------------------------------------------------------------------------
// Spike detection
// ---------------------------------------------------------------------------

function detectSpikes(
  series: { date: string; value: number }[],
  signal: string,
  allSignalSeries: Record<string, { date: string; value: number }[]>,
  zThreshold = 2.0,
): SpikeEvent[] {
  const vals = series.map(s => s.value);
  const n = vals.length;
  if (n < 10) return [];

  const spikes: SpikeEvent[] = [];

  for (let i = 5; i < n; i++) {
    const window = vals.slice(Math.max(0, i - 30), i);
    const m = mean(window);
    const s = std(window) + 1e-8;
    const z = (vals[i] - m) / s;

    if (Math.abs(z) < zThreshold) continue;

    const date = series[i].date;
    const value = vals[i];

    // Magnitude
    const magnitude: "major" | "moderate" | "minor" =
      Math.abs(z) > 3 ? "major" : Math.abs(z) > 2 ? "moderate" : "minor";

    // Sustained check: next 7 days mean vs pre-spike mean
    const preSpikeWindow = vals.slice(Math.max(0, i - 7), i);
    const preMean = mean(preSpikeWindow) + 1e-8;
    const postWindow = vals.slice(i + 1, Math.min(n, i + 8));
    const postMean = postWindow.length > 0 ? mean(postWindow) : 0;
    const isSustained = postMean > preMean * 1.5;
    let daysSustained = 0;
    for (let j = i + 1; j < Math.min(n, i + 30); j++) {
      if (vals[j] > preMean * 1.2) daysSustained++;
      else break;
    }

    // Classify spike type
    let spikeType: SpikeType = "unknown";
    const tiktokSeries = allSignalSeries["tiktok_growth"] ?? [];
    const saveSeries   = allSignalSeries["save_rate"] ?? [];
    const playlistSeries = allSignalSeries["playlist_signal"] ?? [];

    const tiktokNearby = tiktokSeries.slice(Math.max(0, i - 3), i + 4).some(s => s.value > 0.5);
    const saveElevated = saveSeries[i] ? saveSeries[i].value > 0.15 : false;
    const playlistElevated = playlistSeries[i] ? playlistSeries[i].value > 0.2 : false;

    if (signal === "tiktok_growth" && z > 3) {
      spikeType = "viral_meme";
    } else if (signal === "stream_velocity" && tiktokNearby) {
      spikeType = "viral_meme";
    } else if (signal === "stream_velocity" && playlistElevated) {
      spikeType = "algorithmic";
    } else if (z > 3 && saveElevated) {
      spikeType = "organic";
    } else if (!isSustained && daysSustained <= 1) {
      spikeType = "noise";
    }

    const likelyCause: Record<SpikeType, string> = {
      organic: "Genuine listener interest — save rate elevated alongside stream spike. Indicates real fan engagement.",
      algorithmic: "Playlist or DSP editorial push — stream spike coincides with playlist signal. May be temporary.",
      viral_meme: "TikTok/UGC-driven spike — audio used in viral content. Monitor save rate to confirm fan conversion.",
      noise: "Single-day anomaly — likely noise from data ingestion, a single viral video, or reporting artifact.",
      unknown: "Cause unclear — insufficient corroborating signals to classify.",
    };

    const breakoutSignal = spikeType === "organic" || (spikeType === "viral_meme" && isSustained);

    const explanation =
      spikeType === "noise"
        ? `One-day ${signal} spike on ${date}. Z-score=${z.toFixed(1)}. Values reverted next day — likely noise from a single event, not a sustained trend. Monitor for recurrence over 7 days.`
        : `${magnitude.charAt(0).toUpperCase() + magnitude.slice(1)} ${signal} spike on ${date} (Z=${z.toFixed(1)}). ${isSustained ? `Sustained for ${daysSustained} days — this is ${breakoutSignal ? "a genuine breakout signal" : "elevated but uncertain"}.` : "Did not sustain — spike faded within days."}`;

    spikes.push({ date, signal, value, zScore: z, spikeType, magnitude, isSustained, daysSustained, likelyCause: likelyCause[spikeType], breakoutSignal, explanation });
  }

  return spikes;
}

// ---------------------------------------------------------------------------
// Regime change detection
// ---------------------------------------------------------------------------

function detectRegimeChanges(
  series: { date: string; value: number }[],
  signal: string,
): RegimeChange[] {
  const n = series.length;
  if (n < 14) return [];

  const changes: RegimeChange[] = [];
  const vals = series.map(s => s.value);

  function computeRegime(window: number[], prevWindow: number[]): RegimeType {
    const m = mean(window);
    const p = mean(prevWindow) + 1e-8;
    const vel = ((m - p) / Math.abs(p)) * 100;
    const prevVel = ((mean(prevWindow.slice(-4)) - mean(prevWindow.slice(0, 4))) / (Math.abs(mean(prevWindow.slice(0, 4))) + 1e-8)) * 100;
    const accel = vel - prevVel;
    if (m > p * 1.5) return "breakout";
    if (vel > 5 && accel > 0) return "acceleration";
    if (vel < -10) return "decline";
    if (vel < -3 && accel < 0) return "deceleration";
    if (vel > 3 && prevVel < -5) return "recovery";
    return "plateau";
  }

  let prevRegime: RegimeType | null = null;

  for (let i = 14; i < n; i++) {
    const window = vals.slice(Math.max(0, i - 7), i + 1);
    const prevWindow = vals.slice(Math.max(0, i - 14), i - 6);
    const regime = computeRegime(window, prevWindow);

    if (prevRegime && regime !== prevRegime) {
      const mag = Math.abs(mean(window) - mean(prevWindow)) / (Math.abs(mean(prevWindow)) + 1e-8);
      changes.push({
        date: series[i].date,
        signal,
        fromRegime: prevRegime,
        toRegime: regime,
        magnitude: Math.round(mag * 100) / 100,
        confidence: Math.min(0.5 + mag * 0.5, 0.95),
        explanation: `${signal} transitioned from ${prevRegime} to ${regime} on ${series[i].date}. Magnitude=${(mag * 100).toFixed(0)}%.`,
      });
    }
    prevRegime = regime;
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Forecaster
// ---------------------------------------------------------------------------

function computeFeatureScore(statsMap: Record<string, RollingStats>): { score: number; drivers: string[] } {
  const drivers: string[] = [];
  let score = 0;

  const tt = statsMap["tiktok_growth"];
  if (tt?.velocity !== null && (tt?.velocity ?? 0) > 10) { score += 0.25; drivers.push("TikTok growth accelerating (WoW >10%)"); }
  const sr = statsMap["save_rate"];
  if (sr?.ma7 !== null && (sr?.ma7 ?? 0) > 0.15) { score += 0.20; drivers.push("Save rate >15% (committed fan signal)"); }
  const sv = statsMap["stream_velocity"];
  if (sv?.acceleration !== null && (sv?.acceleration ?? 0) > 0) { score += 0.15; drivers.push("Stream velocity accelerating"); }
  const fv = statsMap["follower_velocity"];
  if (fv?.velocity !== null && (fv?.velocity ?? 0) > 5) { score += 0.10; drivers.push("Follower velocity rising >5% WoW"); }
  const ps = statsMap["playlist_signal"];
  if (ps?.velocity !== null && (ps?.velocity ?? 0) > 0) { score += 0.10; drivers.push("Playlist signal trending up"); }
  const cm = statsMap["chart_momentum"];
  if (cm?.trendDirection === "up") { score += 0.08; drivers.push("Chart momentum trending up"); }

  score += 0.12; // base structural score

  return { score: Math.min(score, 1.0), drivers: drivers.slice(0, 3) };
}

function scoreToProbability(score: number, horizonDays: number): [number, number, number] {
  const base = sigmoid(5 * (score - 0.5));
  const prob = horizonDays === 90 ? Math.min(base * 1.35, 0.95) : base;
  const ciWidth = score > 0.7 ? 0.20 : score > 0.5 ? 0.30 : 0.40;
  const lower = Math.max(0.02, prob - ciWidth / 2);
  const upper = Math.min(0.95, prob + ciWidth / 2);
  return [Math.round(prob * 1000) / 1000, Math.round(lower * 1000) / 1000, Math.round(upper * 1000) / 1000];
}

function buildForecast(statsMap: Record<string, RollingStats>, horizonDays: number, dataPoints: number): Forecast {
  const { score, drivers } = computeFeatureScore(statsMap);
  const [prob, lower, upper] = scoreToProbability(score, horizonDays);

  const confLevel: "high" | "medium" | "low" =
    score > 0.7 && dataPoints >= 30 ? "high" :
    score > 0.5 ? "medium" : "low";

  const expectedBreakoutDay = prob > 0.6
    ? Math.max(7, Math.round(horizonDays * (1 - score * 0.4)))
    : null;

  const uncertaintyDays = confLevel === "high" ? 15 : confLevel === "medium" ? 30 : 45;

  const explanation =
    `${Math.round(prob * 100)}% probability of breakout within ${horizonDays} days ` +
    `(80% CI: ${Math.round(lower * 100)}%–${Math.round(upper * 100)}%). ` +
    (expectedBreakoutDay
      ? `Expected timeline: ~${expectedBreakoutDay} days ±${uncertaintyDays} days. `
      : "Breakout not probable at current trajectory. ") +
    `Confidence: ${confLevel}. ` +
    (drivers.length > 0 ? `Key drivers: ${drivers.join("; ")}.` : "Insufficient signal data for high confidence.");

  return { horizonDays, breakoutProbability: prob, probabilityLower: lower, probabilityUpper: upper, expectedBreakoutDay, timelineUncertaintyDays: uncertaintyDays, confidenceLevel: confLevel, keyDrivers: drivers, explanation };
}

// ---------------------------------------------------------------------------
// Risk factors
// ---------------------------------------------------------------------------

const BASE_RISKS: RiskFactor[] = [
  { name: "Second single underperforms", category: "content", severity: "high", probability: "possible", impactOnForecast: "Breaks momentum narrative; stream velocity could halve within 2 weeks of a weak follow-up.", monitoringSignal: "stream_velocity on release date of next single" },
  { name: "TikTok algorithm deprioritizes music", category: "algorithmic", severity: "high", probability: "possible", impactOnForecast: "Primary leading indicator goes dark. Revise forecast down 30-40% if tiktok_growth drops >50% WoW.", monitoringSignal: "tiktok_growth WoW% — alert if < -30%" },
  { name: "Spotify removes from editorial playlist", category: "platform", severity: "high", probability: "unlikely", impactOnForecast: "Kills algorithmic recommendation flywheel. Stream velocity typically drops 40-60% within 7 days.", monitoringSignal: "playlist_signal daily — alert if drops >30% in 3 days" },
  { name: "Skip rate increases sharply", category: "platform", severity: "medium", probability: "possible", impactOnForecast: "DSP algorithms deprioritize high-skip tracks, reducing organic discovery.", monitoringSignal: "skip_rate daily — alert if >55% or WoW increase >15 points" },
  { name: "Save rate drops below threshold", category: "content", severity: "medium", probability: "possible", impactOnForecast: "Leading indicator loss — indicates listener fatigue. Breakout timeline extends 2-4 weeks.", monitoringSignal: "save_rate weekly — alert if <10% or drops >5 points WoW" },
  { name: "Bot/fake stream detection by DSP", category: "platform", severity: "high", probability: "unlikely", impactOnForecast: "Streams removed in audit. Can cause -20% to -80% stream count correction.", monitoringSignal: "listener_follower_conversion — near-zero indicates inflated streams" },
  { name: "Competing viral moment captures attention", category: "market", severity: "low", probability: "possible", impactOnForecast: "Major album releases or cultural events temporarily suppress organic discovery.", monitoringSignal: "tiktok_growth relative to genre peers" },
  { name: "Label withdraws promotional support", category: "content", severity: "high", probability: "unlikely", impactOnForecast: "Removes playlist pitching, radio promo, ad spend. Organic signals may persist but growth slows.", monitoringSignal: "playlist_signal and radio_spike — sudden drops suggest promo withdrawal" },
];

function buildRiskFactors(statsMap: Record<string, RollingStats>, forecast30d: Forecast): RiskFactor[] {
  const risks = BASE_RISKS.map(r => ({ ...r }));

  const tt = statsMap["tiktok_growth"];
  if (tt?.wowPct !== null && (tt?.wowPct ?? 0) < -10) {
    const risk = risks.find(r => r.name.includes("TikTok"));
    if (risk) risk.probability = "likely";
  }
  const sk = statsMap["skip_rate"];
  if (sk?.trendDirection === "up") {
    const risk = risks.find(r => r.name.includes("Skip rate"));
    if (risk) risk.probability = "likely";
  }
  const sr = statsMap["save_rate"];
  if ((sr?.ma7 ?? 1) < 0.10) {
    const risk = risks.find(r => r.name.includes("Save rate"));
    if (risk) risk.probability = "likely";
  }
  if (forecast30d.breakoutProbability > 0.7) {
    const risk = risks.find(r => r.name.includes("single"));
    if (risk) risk.probability = "likely";
  }

  const sevOrder = { high: 0, medium: 1, low: 2 };
  const probOrder = { likely: 0, possible: 1, unlikely: 2 };
  risks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || probOrder[a.probability] - probOrder[b.probability]);
  return risks;
}

function buildMonitoringSignals(statsMap: Record<string, RollingStats>): MonitoringSignal[] {
  const signals: MonitoringSignal[] = [
    { signal: "tiktok_growth", checkFrequency: "daily", alertThreshold: "WoW% > +20% or < -30%", whyImportant: "Primary leading indicator — moves 14 days ahead of streaming acceleration" },
    { signal: "save_rate", checkFrequency: "weekly", alertThreshold: "Drops below 10% or increases above 25%", whyImportant: "Committed fan signal — predicts 7-day sustained streaming growth" },
    { signal: "stream_velocity", checkFrequency: "daily", alertThreshold: "WoW% > +15% or < -20%", whyImportant: "Real-time confirmation of breakout or plateau" },
    { signal: "playlist_signal", checkFrequency: "daily", alertThreshold: "Drops >30% in 3 consecutive days", whyImportant: "Playlist removal kills discovery flywheel within 7 days" },
    { signal: "follower_velocity", checkFrequency: "weekly", alertThreshold: "Drops below 5% WoW for 2 consecutive weeks", whyImportant: "21-day leading indicator for chart entry" },
  ];

  // Filter out signals with no data
  return signals.filter(s => statsMap[s.signal] !== undefined);
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

function runTrendAnalysis(
  artistId: number,
  artistName: string,
  rawSnapshots: { date: string; signalType: string; value: number }[],
  predictionDate: string,
): TrendsResult {
  const predTs = new Date(predictionDate).getTime();

  // Temporal leakage guard
  const filtered = rawSnapshots.filter(s => new Date(s.date).getTime() <= predTs);
  const dropped = rawSnapshots.length - filtered.length;
  const leakageCheck = dropped > 0
    ? `warning: ${dropped} snapshots dropped (after prediction_date ${predictionDate})`
    : "passed";

  // Group by signal type, sort by date
  const bySignal: Record<string, { date: string; value: number }[]> = {};
  for (const snap of filtered) {
    if (!bySignal[snap.signalType]) bySignal[snap.signalType] = [];
    bySignal[snap.signalType].push({ date: snap.date, value: snap.value });
  }
  for (const key of Object.keys(bySignal)) {
    bySignal[key].sort((a, b) => a.date.localeCompare(b.date));
  }

  const dataPointsUsed = filtered.length;

  // Rolling stats
  const rollingStats: RollingStats[] = ALL_SIGNALS.map(sig =>
    computeRollingStats(bySignal[sig] ?? [], sig)
  );
  const statsMap = Object.fromEntries(rollingStats.map(rs => [rs.signal, rs]));

  // Regime changes
  const regimeChanges: RegimeChange[] = [];
  for (const sig of ALL_SIGNALS) {
    if (bySignal[sig]) regimeChanges.push(...detectRegimeChanges(bySignal[sig], sig));
  }
  // Keep last 5 most recent
  regimeChanges.sort((a, b) => b.date.localeCompare(a.date));
  const recentRegimes = regimeChanges.slice(0, 10);

  // Spikes
  const spikeEvents: SpikeEvent[] = [];
  for (const sig of ALL_SIGNALS) {
    if (bySignal[sig]) spikeEvents.push(...detectSpikes(bySignal[sig], sig, bySignal, 2.0));
  }
  // Keep last 10
  spikeEvents.sort((a, b) => b.date.localeCompare(a.date));
  const recentSpikes = spikeEvents.slice(0, 10);

  // Leading indicators
  const leadingIndicators: LeadingIndicatorResult[] = ALL_SIGNALS.map(sig => {
    const role = SIGNAL_ROLES[sig] ?? { role: "coincident" as SignalRole, avgLeadDays: 0, explanation: `${sig} signal.` };
    const rs = statsMap[sig];
    const predictiveValue: "high" | "medium" | "low" =
      role.role === "leading" && rs?.velocity !== null && Math.abs(rs?.velocity ?? 0) > 10 ? "high" :
      role.role === "leading" ? "medium" : "low";
    return { signal: sig, role: role.role, avgLeadDays: role.avgLeadDays, predictiveValue, explanation: role.explanation };
  });

  // Forecasts
  const forecast30d = buildForecast(statsMap, 30, dataPointsUsed);
  const forecast90d = buildForecast(statsMap, 90, dataPointsUsed);

  // Risks and monitoring
  const riskFactors = buildRiskFactors(statsMap, forecast30d);
  const monitoringSignals = buildMonitoringSignals(statsMap);

  return {
    artistId,
    artistName,
    predictionDate,
    rollingStats,
    spikeEvents: recentSpikes,
    leadingIndicators,
    regimeChanges: recentRegimes,
    forecast30d,
    forecast90d,
    riskFactors,
    monitoringSignals,
    dataPointsUsed,
    temporalLeakageCheck: leakageCheck,
    analyzedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const GET = withAuth("trajectory:read", async (req: NextRequest, ctx: { params: { artistId: string } }) => {
  const artistId = parseInt(ctx.params.artistId, 10);
  if (isNaN(artistId)) {
    return NextResponse.json({ error: "Invalid artist ID — must be an integer" }, { status: 400 });
  }

  // Optional prediction_date query param (defaults to now)
  const url = new URL(req.url);
  const predictionDate = url.searchParams.get("prediction_date")
    ?? new Date().toISOString().slice(0, 10);

  try {
    const artist = await (prisma as any).artist?.findUnique?.({ where: { id: artistId } }).catch(() => null);
    const artistName: string = artist?.name ?? `Artist #${artistId}`;

    // Fetch ArtistDailySnapshot records (time-series snapshots)
    const snapshots = await (prisma as any).artistDailySnapshot?.findMany?.({
      where: { artistId, date: { lte: new Date(predictionDate) } },
      orderBy: { date: "asc" },
    }).catch(() => []) as Array<{ date: Date; [key: string]: unknown }> ?? [];

    // Convert snapshots to signal rows
    const signalRows: { date: string; signalType: string; value: number }[] = [];
    for (const snap of snapshots) {
      const dateStr = snap.date instanceof Date ? snap.date.toISOString().slice(0, 10) : String(snap.date);
      for (const sig of ALL_SIGNALS) {
        const val = snap[sig];
        if (typeof val === "number") {
          signalRows.push({ date: dateStr, signalType: sig, value: val });
        }
      }
    }

    // Also pull PredictionSignal records for richer signal data
    const predSignals = await prisma.predictionSignal.findMany({
      where: {
        entityType: "artist",
        entityId: artistId,
        recordedAt: { lte: new Date(predictionDate) },
      },
      orderBy: { recordedAt: "asc" },
      take: 2000,
    });

    for (const ps of predSignals) {
      const dateStr = ps.recordedAt.toISOString().slice(0, 10);
      if (ALL_SIGNALS.includes(ps.signalType)) {
        signalRows.push({ date: dateStr, signalType: ps.signalType, value: ps.value });
      }
    }

    if (signalRows.length === 0) {
      return NextResponse.json(
        { error: "No time-series data found for this artist. Ingest daily snapshots first." },
        { status: 404 },
      );
    }

    const result = runTrendAnalysis(artistId, artistName, signalRows, predictionDate);

    logger.info("Trend analysis completed", {
      artistId,
      dataPoints: result.dataPointsUsed,
      forecast30d: result.forecast30d.breakoutProbability,
      forecast90d: result.forecast90d.breakoutProbability,
      spikes: result.spikeEvents.length,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=3600",
        "X-Data-Points": String(result.dataPointsUsed),
        "X-Forecast-30d": String(result.forecast30d.breakoutProbability),
      },
    });
  } catch (err) {
    logger.error("Trend analysis error", { artistId, err });
    return NextResponse.json({ error: "Internal error running trend analysis" }, { status: 500 });
  }
});
