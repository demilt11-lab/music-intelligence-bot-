/**
 * GET /api/v1/reason/:artistId
 *
 * Runs the chain-of-thought A&R reasoning engine for an artist.
 * Returns structured output: facts, inferences, hypotheses, verdict, confidence.
 *
 * Response is cached for 1h (reasoning is expensive but deterministic for same signals).
 * Returns partial result with warning if signals are incomplete.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalFact {
  signal: string;
  value: number | null;
  threshold: number;
  passes: boolean | null;
  strength: "strong" | "moderate" | "weak" | "absent";
  source: string;
  ageHours: number;
  interpretation: string;
}

interface SubproblemAnswer {
  question: string;
  answer: string;
  confidence: number;
  reasoning: string;
}

interface AssumptionResult {
  assumption: string;
  requiredValue: string;
  actualValue: string;
  result: "supported" | "violated" | "untestable";
  notes: string;
}

interface Contradiction {
  signalA: string;
  valueA: number;
  signalB: string;
  valueB: number;
  contradictionType: string;
  severity: "high" | "medium" | "low";
  explanation: string;
  hypothesisImplication: string;
}

interface HypothesisScore {
  label: string;
  name: string;
  description: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  priorProbability: number;
  likelihood: number;
  posterior: number;
}

interface ReasoningResult {
  artistId: number;
  artistName: string;
  facts: SignalFact[];
  inferences: SignalFact[];
  subproblems: SubproblemAnswer[];
  assumptionTests: AssumptionResult[];
  contradictions: Contradiction[];
  hypotheses: HypothesisScore[];
  verdict: string;
  confidencePct: number;
  primaryReasoning: string;
  decisionPath: string[];
  missingData: string[];
  signalHealth: Record<string, string>;
  dataCompletenessPct: number;
  modelVersion: string;
  reasonedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = "1.0.0-reasoning-ts";

const THRESHOLDS = {
  stream_velocity: 0.25,
  save_rate: 0.15,
  tiktok_growth: 0.50,
  follower_velocity: 0.15,
  skip_rate_organic: 0.35,
  playlist_add_rate: 0.10,
  listener_follower_conv: 0.05,
  algo_traffic_concern: 0.80,
};

const SIGNAL_TTL_HOURS: Record<string, number> = {
  tiktok_growth: 6,
  stream_velocity: 48,
  save_rate: 72,
  follower_velocity: 24,
  chart_momentum: 168,
  radio_spike: 168,
  playlist_signal: 24,
  skip_rate: 48,
  listener_follower_conversion: 24,
  ugc_count: 12,
  organic_score: 48,
  pre_save_normalized: 72,
};

const ALL_EXPECTED_SIGNALS = Object.keys(SIGNAL_TTL_HOURS);

const SIGNAL_WEIGHTS: Record<string, number> = {
  save_rate: 0.22,
  tiktok_growth: 0.28,
  stream_velocity: 0.20,
  follower_velocity: 0.09,
  chart_momentum: 0.10,
  playlist_signal: 0.05,
  radio_spike: 0.02,
};

const PRIORS = { breakout: 0.08, plateau: 0.62, artificial: 0.30 };

// Missing signal descriptions (ordered by importance)
const MISSING_DESCRIPTIONS: Record<string, string> = {
  tiktok_growth:
    "tiktok_growth: Collecting TikTok engagement velocity would enable organic-vs-artificial and platform checks.",
  stream_velocity:
    "stream_velocity: Streaming velocity would directly test the breakout-trajectory assumption.",
  save_rate:
    "save_rate: Spotify save rate enables committed-fan assumption test and fake-viral contradiction detection.",
  follower_velocity:
    "follower_velocity: Follower velocity activates the chart-prediction leading-indicator assumption.",
  skip_rate:
    "skip_rate: Skip rate enables algorithmic-push contradiction detection.",
};

// ---------------------------------------------------------------------------
// Evidence helper
// ---------------------------------------------------------------------------

function makeSignalFact(
  signal: string,
  value: number | null,
  threshold: number,
  source: string,
  ageHours: number,
  interpretation?: string,
): SignalFact {
  if (value === null) {
    return {
      signal, value, threshold, passes: null, strength: "absent",
      source, ageHours,
      interpretation: interpretation ?? `${signal} data is missing`,
    };
  }
  const passes = value >= threshold;
  const strength: SignalFact["strength"] = passes
    ? (value > 2 * threshold ? "strong" : "moderate")
    : "weak";
  return {
    signal, value, threshold, passes, strength, source, ageHours,
    interpretation: interpretation ?? `${signal}=${value.toFixed(3)} ${passes ? "≥" : "<"} ${threshold}`,
  };
}

// ---------------------------------------------------------------------------
// Subproblem evaluators
// ---------------------------------------------------------------------------

function evalEarlyMomentum(
  signals: Record<string, number | null>,
): SubproblemAnswer {
  const sv = signals["stream_velocity"] ?? null;
  const tg = signals["tiktok_growth"] ?? null;
  const fv = signals["follower_velocity"] ?? null;

  const passes = [
    sv !== null && sv >= 0.25,
    tg !== null && tg > 0,
    fv !== null && fv > 0,
  ];
  const absent = [sv === null, tg === null, fv === null];
  const nPass = passes.filter(Boolean).length;
  const nAbsent = absent.filter(Boolean).length;

  let answer: string;
  let confidence: number;

  if (nAbsent === 3) { answer = "insufficient_data"; confidence = 0.0; }
  else if (nPass === 3) { answer = "yes"; confidence = 0.85; }
  else if (nPass === 2) { answer = "unclear"; confidence = 0.60; }
  else if (nPass === 1) { answer = "unclear"; confidence = 0.40; }
  else { answer = "no"; confidence = 0.20; }

  const fired = (["stream_velocity", "tiktok_growth", "follower_velocity"] as const)
    .filter((s, i) => !absent[i] && passes[i]);
  const failed = (["stream_velocity", "tiktok_growth", "follower_velocity"] as const)
    .filter((s, i) => !absent[i] && !passes[i]);
  const missing = (["stream_velocity", "tiktok_growth", "follower_velocity"] as const)
    .filter((s, i) => absent[i]);

  const parts: string[] = [];
  if (fired.length) parts.push(`Signals above threshold: ${fired.join(", ")}.`);
  if (failed.length) parts.push(`Signals below threshold: ${failed.join(", ")}.`);
  if (missing.length) parts.push(`Missing signals: ${missing.join(", ")}.`);
  parts.push(`${nPass} of ${3 - nAbsent} present signals pass → answer='${answer}', confidence=${confidence.toFixed(2)}.`);

  return { question: "Is this artist showing early momentum?", answer, confidence, reasoning: parts.join(" ") };
}

function evalOrganicVsArtificial(
  signals: Record<string, number | null>,
): SubproblemAnswer {
  const tg = signals["tiktok_growth"] ?? null;
  const sr = signals["save_rate"] ?? null;
  const sv = signals["stream_velocity"] ?? null;
  const skip = signals["skip_rate"] ?? null;
  const fv = signals["follower_velocity"] ?? null;

  const highContradictions: string[] = [];
  const mediumContradictions: string[] = [];
  const parts: string[] = [];

  // fake_viral
  if (tg !== null && sr !== null && tg > 0.5 && sr < 0.10) {
    highContradictions.push("fake_viral");
    parts.push(`FAKE VIRAL: tiktok_growth=${tg.toFixed(3)} (>0.5) but save_rate=${sr.toFixed(3)} (<0.10).`);
  }
  // algorithmic_push
  if (sv !== null && skip !== null && sv >= 0.40 && skip > 0.60) {
    highContradictions.push("algorithmic_push");
    parts.push(`ALGORITHMIC PUSH: stream_velocity=${sv.toFixed(3)} (≥0.40) but skip_rate=${skip.toFixed(3)} (>0.60).`);
  }
  // bought_followers
  if (fv !== null && sv !== null && fv > 0.30 && sv < 0.10) {
    mediumContradictions.push("bought_followers");
    parts.push(`BOUGHT FOLLOWERS: follower_velocity=${fv.toFixed(3)} (>0.30) but stream_velocity=${sv.toFixed(3)} (<0.10).`);
  }

  const nHigh = highContradictions.length;
  const nMed = mediumContradictions.length;

  let answer: string;
  let confidence: number;

  if (nHigh === 0 && nMed === 0) {
    answer = "organic"; confidence = 0.75;
    parts.unshift("No contradiction patterns detected.");
  } else if (nHigh >= 2) {
    answer = "artificial"; confidence = 0.80;
  } else if (nHigh === 1) {
    answer = "suspect"; confidence = 0.55;
  } else {
    answer = "suspect"; confidence = 0.50;
  }

  parts.push(`${nHigh} high-severity, ${nMed} medium-severity contradictions → answer='${answer}', confidence=${confidence.toFixed(2)}.`);

  return {
    question: "Is the momentum organic or artificial (bot-driven)?",
    answer, confidence,
    reasoning: parts.join(" "),
  };
}

function evalPlatformMomentum(
  signals: Record<string, number | null>,
): SubproblemAnswer {
  const tg = signals["tiktok_growth"] ?? null;
  const sr = signals["save_rate"] ?? null;
  const radio = signals["radio_spike"] ?? null;

  const parts: string[] = [];
  let answer = "no";
  let confidence = 0.50;

  if (tg !== null) {
    if (tg > 0.40) {
      answer = "yes"; confidence = 0.85;
      parts.push(`TikTok growth=${tg.toFixed(3)} > 0.40 — TikTok leading, strongest early signal.`);
    } else {
      parts.push(`TikTok growth=${tg.toFixed(3)} present but below viral threshold 0.40.`);
    }
  } else {
    parts.push("TikTok data missing or from unofficial source — flagged as weak signal.");
  }

  if (sr !== null) {
    if (sr > 0.15) {
      parts.push(`Spotify save_rate=${sr.toFixed(3)} > 0.15 — Spotify engagement strong.`);
      if (answer !== "yes") { answer = "partial"; confidence = 0.65; }
    } else {
      parts.push(`Spotify save_rate=${sr.toFixed(3)} below healthy threshold 0.15.`);
    }
  }

  if (radio !== null && radio >= 0.30 && (tg === null || tg < 0.10)) {
    parts.push(`Radio spike=${radio.toFixed(3)} without digital — radio-only ceiling signal.`);
    if (answer !== "yes" && answer !== "partial") { answer = "no"; confidence = 0.60; }
  }

  if (parts.length === 0) { answer = "insufficient_data"; confidence = 0.20; }
  parts.push(`Platform verdict: '${answer}', confidence=${confidence.toFixed(2)}.`);

  return {
    question: "Is momentum on the right platform (TikTok = early signal)?",
    answer, confidence,
    reasoning: parts.join(" "),
  };
}

function evalPersistence(
  signals: Record<string, number | null>,
): SubproblemAnswer {
  const tg = signals["tiktok_growth"] ?? null;
  const historyWeeks = signals["tiktok_history_weeks"] ?? null;
  const slope = signals["signal_trend_slope"] ?? null;
  const sv = signals["stream_velocity"] ?? null;

  const parts: string[] = [];
  let answer = "unclear";
  let confidence = 0.40;

  if (historyWeeks !== null) {
    if (historyWeeks < 1) {
      parts.push(`Single data point (${historyWeeks} weeks) — persistence unknown.`);
      confidence = 0.30;
    } else if (historyWeeks >= 3) {
      if (slope !== null && slope > 0) {
        answer = "yes"; confidence = 0.80;
        parts.push(`Persistent: ${historyWeeks} weeks of TikTok signal with rising trend (slope=${slope.toFixed(3)}).`);
      } else {
        parts.push(`${historyWeeks} weeks of TikTok signal but trend direction unclear.`);
        confidence = 0.55;
      }
    } else {
      parts.push(`Only ${historyWeeks} weeks of TikTok history — need ≥3 weeks for persistence.`);
    }
  } else {
    parts.push("No TikTok history length — only current snapshot. Persistence confidence reduced.");
    confidence = 0.30;
  }

  if (slope !== null) {
    if (slope < 0) {
      answer = "no"; confidence = Math.max(confidence, 0.65);
      parts.push(`Trend slope=${slope.toFixed(3)} declining — spike fading, plateau risk.`);
    } else if (slope > 0 && answer !== "yes") {
      parts.push(`Trend slope=${slope.toFixed(3)} positive (rising).`);
    }
  }

  if (sv !== null) {
    parts.push(sv >= 0.25
      ? `Stream velocity=${sv.toFixed(3)} ≥ 0.25 — corroborates persistence.`
      : `Stream velocity=${sv.toFixed(3)} < 0.25 — not yet accelerating.`);
  }

  if (parts.length === 0) { answer = "insufficient_data"; confidence = 0.10; }
  parts.push(`Persistence verdict: '${answer}', confidence=${confidence.toFixed(2)}.`);

  return {
    question: "Does the momentum persist (not just one viral spike)?",
    answer, confidence,
    reasoning: parts.join(" "),
  };
}

function evalInfrastructure(
  signals: Record<string, number | null>,
): SubproblemAnswer {
  const ps = signals["playlist_signal"] ?? null;
  const radio = signals["radio_spike"] ?? null;
  const presave = signals["pre_save_normalized"] ?? null;
  const sv = signals["stream_velocity"] ?? null;
  const fv = signals["follower_velocity"] ?? null;

  const parts: string[] = [
    "NOTE: Infrastructure signals are proxies — no direct label data available.",
  ];
  let proxiesPassed = 0;

  if (ps !== null) {
    if (ps > 0.20) { proxiesPassed++; parts.push(`Playlist signal=${ps.toFixed(3)} > 0.20 — curators have noticed.`); }
    else { parts.push(`Playlist signal=${ps.toFixed(3)} ≤ 0.20 — limited editorial curation.`); }
  }
  if (radio !== null) {
    if (radio > 0.10) { proxiesPassed++; parts.push(`Radio spike=${radio.toFixed(3)} > 0.10 — radio coverage present.`); }
    else { parts.push(`Radio spike=${radio.toFixed(3)} ≤ 0.10 — minimal radio presence.`); }
  }
  if (presave !== null) {
    if (presave > 0.10) { proxiesPassed++; parts.push(`Pre-save=${presave.toFixed(3)} > 0.10 — label/distributor campaign running.`); }
    else { parts.push(`Pre-save=${presave.toFixed(3)} ≤ 0.10 — no significant pre-save campaign.`); }
  }
  if (fv !== null && sv !== null && sv > 0) {
    const ratio = fv / sv;
    if (ratio > 0.10) { proxiesPassed++; parts.push(`Follower/listener ratio=${ratio.toFixed(3)} > 0.10 — loyal fanbase.`); }
    else { parts.push(`Follower/listener ratio=${ratio.toFixed(3)} ≤ 0.10 — mostly casual listeners.`); }
  }

  let answer: string;
  let confidence: number;
  if (proxiesPassed >= 3) { answer = "yes"; confidence = 0.70; }
  else if (proxiesPassed === 2) { answer = "partial"; confidence = 0.50; }
  else if (proxiesPassed === 1) { answer = "no"; confidence = 0.55; }
  else { answer = parts.length > 1 ? "no" : "insufficient_data"; confidence = 0.10; }

  parts.push(`${proxiesPassed}/4 infrastructure proxies passed → answer='${answer}', confidence=${confidence.toFixed(2)}.`);

  return {
    question: "Does the artist have infrastructure to scale?",
    answer, confidence,
    reasoning: parts.join(" "),
  };
}

// ---------------------------------------------------------------------------
// Assumption tester
// ---------------------------------------------------------------------------

function testAssumptions(
  signals: Record<string, number | null>,
): AssumptionResult[] {
  const results: AssumptionResult[] = [];

  const tg = signals["tiktok_growth"] ?? null;
  const sv = signals["stream_velocity"] ?? null;
  const sr = signals["save_rate"] ?? null;
  const fv = signals["follower_velocity"] ?? null;

  // tiktok_precedes_streaming
  if (tg === null || sv === null) {
    results.push({
      assumption: "TikTok viral moment precedes 11% streaming increase",
      requiredValue: "tiktok_growth > stream_velocity",
      actualValue: `missing: ${[tg === null && "tiktok_growth", sv === null && "stream_velocity"].filter(Boolean).join(", ")}`,
      result: "untestable",
      notes: "Both tiktok_growth and stream_velocity required.",
    });
  } else {
    const passes = tg > sv && sv > 0;
    results.push({
      assumption: "TikTok viral moment precedes 11% streaming increase",
      requiredValue: "tiktok_growth > stream_velocity",
      actualValue: `tiktok_growth=${tg.toFixed(3)}, stream_velocity=${sv.toFixed(3)}`,
      result: passes ? "supported" : "violated",
      notes: `TikTok growth ${tg > sv ? "exceeds" : "does not exceed"} streaming velocity.`,
    });
  }

  // save_rate_committed_fans
  if (sr === null) {
    results.push({
      assumption: "Save rate >15% indicates committed fans",
      requiredValue: "save_rate >= 0.15",
      actualValue: "missing",
      result: "untestable",
      notes: "save_rate signal absent.",
    });
  } else {
    results.push({
      assumption: "Save rate >15% indicates committed fans",
      requiredValue: "save_rate >= 0.15",
      actualValue: `save_rate=${sr.toFixed(3)}`,
      result: sr >= 0.15 ? "supported" : "violated",
      notes: `Save rate ${sr >= 0.15 ? "above" : "below"} committed-fan threshold.`,
    });
  }

  // stream_velocity_breakout
  if (sv === null) {
    results.push({
      assumption: "Stream velocity >25%/month indicates breakout trajectory",
      requiredValue: "stream_velocity >= 0.25",
      actualValue: "missing",
      result: "untestable",
      notes: "stream_velocity signal absent.",
    });
  } else {
    results.push({
      assumption: "Stream velocity >25%/month indicates breakout trajectory",
      requiredValue: "stream_velocity >= 0.25",
      actualValue: `stream_velocity=${sv.toFixed(3)}`,
      result: sv >= 0.25 ? "supported" : "violated",
      notes: `Stream velocity ${sv >= 0.25 ? "consistent with" : "insufficient for"} breakout trajectory.`,
    });
  }

  // ugc_amplification
  const ugc = signals["ugc_count"] ?? null;
  const ugcPrimary = tg ?? ugc;
  const ugcName = tg !== null ? "tiktok_growth" : "ugc_count";
  if (ugcPrimary === null) {
    results.push({
      assumption: "UGC growth (TikTok/Reels) is the primary early amplification signal",
      requiredValue: "tiktok_growth or ugc_count > 0.20",
      actualValue: "missing",
      result: "untestable",
      notes: "Neither tiktok_growth nor ugc_count present.",
    });
  } else {
    results.push({
      assumption: "UGC growth (TikTok/Reels) is the primary early amplification signal",
      requiredValue: `${ugcName} > 0.20`,
      actualValue: `${ugcName}=${ugcPrimary.toFixed(3)}`,
      result: ugcPrimary > 0.20 ? "supported" : "violated",
      notes: `${ugcName}=${ugcPrimary.toFixed(3)} ${ugcPrimary > 0.20 ? "confirms" : "does not confirm"} UGC amplification.`,
    });
  }

  // follower_velocity_predictor
  if (fv === null) {
    results.push({
      assumption: "Follower velocity >15%/month predicts chart entry before it happens",
      requiredValue: "follower_velocity >= 0.15",
      actualValue: "missing",
      result: "untestable",
      notes: "follower_velocity signal absent.",
    });
  } else {
    results.push({
      assumption: "Follower velocity >15%/month predicts chart entry before it happens",
      requiredValue: "follower_velocity >= 0.15",
      actualValue: `follower_velocity=${fv.toFixed(3)}`,
      result: fv >= 0.15 ? "supported" : "violated",
      notes: `Follower velocity ${fv >= 0.15 ? "is a leading chart indicator" : "below chart-prediction threshold"}.`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Contradiction detector
// ---------------------------------------------------------------------------

function detectContradictions(
  signals: Record<string, number | null>,
): Contradiction[] {
  const patterns = [
    {
      name: "fake_viral", severityRank: 0,
      sigA: "tiktok_growth", thA: 0.50, opA: ">=",
      sigB: "save_rate", thB: 0.10, opB: "<",
      severity: "high" as const,
      explanation:
        "Content went viral on TikTok but users are not saving the track — suggesting a meme/trend vehicle rather than genuine fan connection.",
      hypothesisImplication: "Supports Hypothesis B (plateau) or C (artificial) over A (breakout)",
    },
    {
      name: "algorithmic_push", severityRank: 0,
      sigA: "stream_velocity", thA: 0.40, opA: ">=",
      sigB: "skip_rate", thB: 0.55, opB: ">=",
      severity: "high" as const,
      explanation:
        "High stream velocity combined with high skip rate — algorithmically surfaced but not genuinely listened to.",
      hypothesisImplication: "Supports Hypothesis B (algorithmic plateau) or C (gaming)",
    },
    {
      name: "bought_followers", severityRank: 1,
      sigA: "follower_velocity", thA: 0.30, opA: ">=",
      sigB: "stream_velocity", thB: 0.10, opB: "<",
      severity: "medium" as const,
      explanation:
        "Follower growth not translating to streams — classic signature of purchased followers.",
      hypothesisImplication: "Supports Hypothesis C (artificial)",
    },
    {
      name: "meme_without_fanbase", severityRank: 1,
      sigA: "tiktok_growth", thA: 0.40, opA: ">=",
      sigB: "listener_follower_conversion", thB: 0.02, opB: "<",
      severity: "medium" as const,
      explanation:
        "Music used in viral content but users not converting to artist followers — audio meme, not discovery vehicle.",
      hypothesisImplication: "Supports Hypothesis B (plateau)",
    },
    {
      name: "chart_gaming", severityRank: 1,
      sigA: "chart_momentum", thA: 0.60, opA: ">=",
      sigB: "organic_score", thB: 0.15, opB: "<",
      severity: "medium" as const,
      explanation:
        "Chart improving faster than organic signals predict — possible playlist manipulation or purchase-based charting.",
      hypothesisImplication: "Supports Hypothesis C (artificial) or B (label-pushed plateau)",
    },
    {
      name: "radio_without_digital", severityRank: 2,
      sigA: "radio_spike", thA: 0.30, opA: ">=",
      sigB: "tiktok_growth", thB: 0.10, opB: "<",
      severity: "low" as const,
      explanation:
        "Radio presence without digital signals — ceiling signal, not a fraud indicator.",
      hypothesisImplication: "Supports Hypothesis B (traditional-only plateau)",
    },
  ];

  const found: Contradiction[] = [];

  for (const p of patterns) {
    const va = signals[p.sigA] ?? null;
    const vb = signals[p.sigB] ?? null;
    if (va === null || vb === null) continue;

    const condA = p.opA === ">=" ? va >= p.thA : p.opA === ">" ? va > p.thA : p.opA === "<" ? va < p.thA : false;
    const condB = p.opB === ">=" ? vb >= p.thB : p.opB === ">" ? vb > p.thB : p.opB === "<" ? vb < p.thB : false;

    if (condA && condB) {
      found.push({
        signalA: p.sigA, valueA: va,
        signalB: p.sigB, valueB: vb,
        contradictionType: p.name,
        severity: p.severity,
        explanation: p.explanation,
        hypothesisImplication: p.hypothesisImplication,
      });
    }
  }

  // Sort: high first, then signal_a name
  const sevOrder = { high: 0, medium: 1, low: 2 };
  found.sort((a, b) =>
    sevOrder[a.severity] - sevOrder[b.severity] || a.signalA.localeCompare(b.signalA)
  );

  return found;
}

// ---------------------------------------------------------------------------
// Hypothesis engine (simplified Bayesian)
// ---------------------------------------------------------------------------

function buildHypotheses(
  subproblems: SubproblemAnswer[],
  contradictions: Contradiction[],
): HypothesisScore[] {
  const byQ = (kw: string) => subproblems.find(sp => sp.question.toLowerCase().includes(kw.toLowerCase()));

  const spMomentum    = byQ("early momentum");
  const spOrganic     = byQ("organic or artificial");
  const spPlatform    = byQ("right platform");
  const spPersistence = byQ("persist");
  const spInfra       = byQ("infrastructure");

  const conf = (sp: SubproblemAnswer | undefined, def = 0.3) => sp?.confidence ?? def;
  const ans  = (sp: SubproblemAnswer | undefined) => sp?.answer ?? "insufficient_data";

  // --- Hypothesis A: Breakout ---
  const mConf = ans(spMomentum) === "yes" ? conf(spMomentum) : conf(spMomentum) * 0.3;
  const oConf = ans(spOrganic) === "organic" ? conf(spOrganic) : conf(spOrganic) * 0.2;
  const pConf = ans(spPlatform) === "yes" ? conf(spPlatform)
    : ans(spPlatform) === "partial" ? conf(spPlatform) * 0.6 : conf(spPlatform) * 0.2;
  const perConf = ["yes", "persistent momentum"].includes(ans(spPersistence)) ? conf(spPersistence)
    : ans(spPersistence) === "unclear" ? conf(spPersistence) * 0.5 : conf(spPersistence) * 0.2;
  const iConf = ["yes", "partial"].includes(ans(spInfra)) ? conf(spInfra) : conf(spInfra) * 0.4;

  const likeA = Math.min(mConf * oConf * pConf * perConf * iConf, 0.95);

  // --- Hypothesis B: Plateau ---
  const platP = ans(spPlatform) === "partial" ? 1.0 : ans(spPlatform) === "yes" ? 0.5 : 0.7;
  const perP  = ["no", "spike fading"].includes(ans(spPersistence)) ? 1.0
    : ans(spPersistence) === "unclear" ? 0.6 : 0.3;
  const infraP = ans(spInfra) === "no" ? 1.0 : ans(spInfra) === "partial" ? 0.7 : 0.3;
  const orgP   = ans(spOrganic) === "suspect" ? 0.8 : ans(spOrganic) === "organic" ? 0.5 : 0.9;
  const momP   = ["yes", "unclear"].includes(ans(spMomentum)) ? 0.7 : 0.4;
  const likeB  = Math.min(platP * perP * infraP * orgP * momP, 0.95);

  // --- Hypothesis C: Artificial ---
  let likeC = 0.05;
  for (const c of contradictions) {
    if (c.severity === "high") likeC *= 3.0;
    else if (c.severity === "medium") likeC *= 1.8;
  }
  likeC = Math.min(likeC, 0.95);

  // Normalize posteriors
  const unnA = likeA * PRIORS.breakout;
  const unnB = likeB * PRIORS.plateau;
  const unnC = likeC * PRIORS.artificial;
  const total = unnA + unnB + unnC || 1;

  const postA = unnA / total;
  const postB = unnB / total;
  const postC = unnC / total;

  const supportingA = subproblems
    .filter(sp => ["yes", "organic", "persistent momentum"].includes(sp.answer))
    .map(sp => `${sp.question.slice(0, 60)}: ${sp.answer}`);
  const contradictingA = contradictions
    .filter(c => c.severity === "high")
    .map(c => `${c.contradictionType}: ${c.signalA} vs ${c.signalB}`);

  const supportingB: string[] = [];
  if (ans(spPlatform) === "partial") supportingB.push("Platform momentum confined to single platform");
  if (["no", "unclear"].includes(ans(spPersistence))) supportingB.push("Persistence weak or unconfirmed");
  if (["no", "partial"].includes(ans(spInfra))) supportingB.push("Limited infrastructure");
  for (const c of contradictions.filter(c => ["fake_viral", "meme_without_fanbase"].includes(c.contradictionType))) {
    supportingB.push(`${c.contradictionType} contradiction detected`);
  }

  const supportingC = contradictions.map(c =>
    `${c.contradictionType} (${c.severity}): ${c.signalA}=${c.valueA.toFixed(3)} vs ${c.signalB}=${c.valueB.toFixed(3)}`
  );
  const contradictingC = ans(spOrganic) === "organic"
    ? ["Organic subproblem found no contradictions"] : [];

  const hypotheses: HypothesisScore[] = [
    {
      label: "a",
      name: "Artist will break out",
      description: "Strong cross-platform momentum, organic, persistent, backed by infrastructure.",
      supportingEvidence: supportingA,
      contradictingEvidence: contradictingA,
      priorProbability: PRIORS.breakout,
      likelihood: likeA,
      posterior: Math.round(postA * 10000) / 10000,
    },
    {
      label: "b",
      name: "Artist will plateau",
      description: "Momentum confined to one platform or meme-driven — unlikely to sustain.",
      supportingEvidence: supportingB,
      contradictingEvidence: [],
      priorProbability: PRIORS.plateau,
      likelihood: likeB,
      posterior: Math.round(postB * 10000) / 10000,
    },
    {
      label: "c",
      name: "Artist is artificial",
      description: "Metrics are bot-driven or manipulated — do not represent genuine interest.",
      supportingEvidence: supportingC,
      contradictingEvidence: contradictingC,
      priorProbability: PRIORS.artificial,
      likelihood: likeC,
      posterior: Math.round(postC * 10000) / 10000,
    },
  ];

  hypotheses.sort((a, b) => b.posterior - a.posterior);
  return hypotheses;
}

// ---------------------------------------------------------------------------
// Verdict selection
// ---------------------------------------------------------------------------

function selectVerdict(
  hypotheses: HypothesisScore[],
  subproblems: SubproblemAnswer[],
  dataCompleteness: number,
): { verdict: string; confidencePct: number; primaryReasoning: string } {
  const byLabel = Object.fromEntries(hypotheses.map(h => [h.label, h]));
  const hypA = byLabel["a"];
  const hypB = byLabel["b"];
  const hypC = byLabel["c"];
  const allInsufficient = subproblems.every(sp => sp.answer === "insufficient_data");

  if (dataCompleteness < 0.4 || allInsufficient) {
    return {
      verdict: "unknown",
      confidencePct: Math.round(dataCompleteness * 40),
      primaryReasoning: `Insufficient signal data (completeness=${(dataCompleteness * 100).toFixed(0)}%) to draw any reliable conclusion.`,
    };
  }

  const top = hypotheses[0];

  if (hypC && hypC.posterior > 0.50) {
    return {
      verdict: "artificial",
      confidencePct: Math.round(hypC.posterior * 85),
      primaryReasoning:
        `Artificial activity signals dominate (posterior=${hypC.posterior.toFixed(2)}). ` +
        `Detected: ${hypC.supportingEvidence.slice(0, 2).join("; ") || "multiple contradiction patterns"}. ` +
        "Metrics cannot be trusted as genuine interest indicators.",
    };
  }

  if (hypA && hypA.posterior === top.posterior && hypA.posterior > 0.35) {
    return {
      verdict: "breakout",
      confidencePct: Math.round(hypA.posterior * 100),
      primaryReasoning:
        `Breakout hypothesis is strongest (posterior=${hypA.posterior.toFixed(2)}). ` +
        `Key supporting signals: ${hypA.supportingEvidence.slice(0, 2).join("; ") || "cross-platform momentum confirmed"}. ` +
        "Signal quality and cross-platform alignment support a genuine breakout trajectory.",
    };
  }

  if (hypB && hypB.posterior === top.posterior) {
    return {
      verdict: "plateau",
      confidencePct: Math.round(hypB.posterior * 85),
      primaryReasoning:
        `Plateau hypothesis is strongest (posterior=${hypB.posterior.toFixed(2)}). ` +
        `Key factors: ${hypB.supportingEvidence.slice(0, 2).join("; ") || "single-platform or spike pattern"}.`,
    };
  }

  if (dataCompleteness > 0.5) {
    return {
      verdict: "emerging",
      confidencePct: Math.round(top.posterior * 60),
      primaryReasoning:
        `No hypothesis exceeds 35% posterior (top=${top.name}: ${top.posterior.toFixed(2)}). ` +
        "Early signals present but insufficient to distinguish breakout from plateau. Monitor for 2-4 weeks.",
    };
  }

  return {
    verdict: "unknown",
    confidencePct: 15,
    primaryReasoning: "Data completeness and hypothesis confidence both insufficient for a reliable verdict.",
  };
}

// ---------------------------------------------------------------------------
// Decision path builder
// ---------------------------------------------------------------------------

function buildDecisionPath(
  subproblems: SubproblemAnswer[],
  assumptionTests: AssumptionResult[],
  contradictions: Contradiction[],
  verdict: string,
): string[] {
  const steps: string[] = [];
  let n = 1;

  steps.push(`Step ${n++}: Evaluated ${subproblems.length} subproblems across momentum, organicity, platform, persistence, and infrastructure.`);

  for (const sp of subproblems) {
    steps.push(`Step ${n++}: ${sp.question} → answer='${sp.answer}', confidence=${sp.confidence.toFixed(2)}.`);
  }

  const supported = assumptionTests.filter(a => a.result === "supported").length;
  const violated  = assumptionTests.filter(a => a.result === "violated").length;
  steps.push(`Step ${n++}: Tested ${assumptionTests.length} core A&R assumptions — ${supported} supported, ${violated} violated, ${assumptionTests.length - supported - violated} untestable.`);

  const highC = contradictions.filter(c => c.severity === "high");
  const medC  = contradictions.filter(c => c.severity === "medium");
  if (contradictions.length > 0) {
    steps.push(
      `Step ${n++}: Contradiction detector found ${contradictions.length} patterns ` +
      `(${highC.length} high-severity, ${medC.length} medium-severity): ` +
      `${contradictions.slice(0, 3).map(c => c.contradictionType).join(", ")}. ` +
      "High-severity contradictions reduce breakout posterior and elevate artificial/plateau probability."
    );
  } else {
    steps.push(`Step ${n++}: No contradiction patterns detected — signal set internally consistent.`);
  }

  steps.push(`Step ${n++}: Applied Bayesian hypothesis scoring with priors (breakout=8%, plateau=62%, artificial=30%). Likelihoods computed from subproblem confidences and contradiction multipliers.`);

  for (const c of highC.slice(0, 2)) {
    steps.push(
      `Step ${n++}: ${c.contradictionType} contradiction (${c.signalA}=${c.valueA.toFixed(3)} vs ` +
      `${c.signalB}=${c.valueB.toFixed(3)}) multiplied artificial likelihood by 3.0 → ${c.hypothesisImplication}.`
    );
  }

  steps.push(`Step ${n++}: Final verdict selected: '${verdict}'. Decision follows from winning hypothesis posterior and data completeness gate.`);
  return steps;
}

// ---------------------------------------------------------------------------
// Main reasoning orchestrator
// ---------------------------------------------------------------------------

function runReasoning(
  artistId: number,
  artistName: string,
  signals: Record<string, number | null>,
  sources: Record<string, string>,
  ages: Record<string, number>,
): ReasoningResult {
  // --- Classify signals ---
  const facts: SignalFact[] = [];
  const inferences: SignalFact[] = [];

  for (const sig of ALL_EXPECTED_SIGNALS) {
    const val = signals[sig] ?? null;
    if (val === null) continue;
    const age = ages[sig] ?? 0;
    const ttl = SIGNAL_TTL_HOURS[sig] ?? 24;
    const src = sources[sig] ?? "unknown";
    const isUnofficial = src.includes("unofficial") || src.includes("scrape");
    const isStale = age > ttl;
    const fact = makeSignalFact(sig, val, 0, src, age);
    if (!isUnofficial && !isStale) {
      facts.push({ ...fact, strength: "moderate" });
    } else {
      inferences.push({ ...fact, strength: "weak" });
    }
  }

  // --- Run subproblems ---
  const subproblems = [
    evalEarlyMomentum(signals),
    evalOrganicVsArtificial(signals),
    evalPlatformMomentum(signals),
    evalPersistence(signals),
    evalInfrastructure(signals),
  ];

  // --- Assumptions ---
  const assumptionTests = testAssumptions(signals);

  // --- Contradictions ---
  const contradictions = detectContradictions(signals);

  // --- Hypotheses ---
  const hypotheses = buildHypotheses(subproblems, contradictions);

  // --- Verdict ---
  const presentCount = ALL_EXPECTED_SIGNALS.filter(s => signals[s] !== null && signals[s] !== undefined).length;
  const dataCompleteness = presentCount / ALL_EXPECTED_SIGNALS.length;
  const { verdict, confidencePct, primaryReasoning } = selectVerdict(hypotheses, subproblems, dataCompleteness);

  // --- Decision path ---
  const decisionPath = buildDecisionPath(subproblems, assumptionTests, contradictions, verdict);

  // --- Signal health ---
  const signalHealth: Record<string, string> = {};
  for (const sig of ALL_EXPECTED_SIGNALS) {
    const val = signals[sig] ?? null;
    const age = ages[sig] ?? 0;
    const ttl = SIGNAL_TTL_HOURS[sig] ?? 24;
    const src = sources[sig] ?? "unknown";
    if (val === null) signalHealth[sig] = "missing";
    else if (age > ttl) signalHealth[sig] = "stale";
    else if (src.includes("unofficial") || src.includes("scrape")) signalHealth[sig] = "suspect";
    else signalHealth[sig] = "healthy";
  }

  // --- Missing data ---
  const missingSorted = ALL_EXPECTED_SIGNALS
    .filter(s => signals[s] === null || signals[s] === undefined)
    .slice(0, 5)
    .map(s => MISSING_DESCRIPTIONS[s] ?? `${s}: collecting this signal would improve verdict confidence.`);

  return {
    artistId,
    artistName,
    facts,
    inferences,
    subproblems,
    assumptionTests,
    contradictions,
    hypotheses,
    verdict,
    confidencePct,
    primaryReasoning,
    decisionPath,
    missingData: missingSorted,
    signalHealth,
    dataCompletenessPct: Math.round(dataCompleteness * 100),
    modelVersion: MODEL_VERSION,
    reasonedAt: new Date().toISOString(),
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

  try {
    // Fetch artist name
    const artist = await (prisma as any).artist?.findUnique?.({ where: { id: artistId } })
      .catch(() => null);
    const artistName: string = artist?.name ?? `Artist #${artistId}`;

    // Fetch all PredictionSignal records for last 7 days, one per signal type (latest)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rawSignals = await prisma.predictionSignal.findMany({
      where: {
        entityType: "artist",
        entityId: artistId,
        recordedAt: { gte: sevenDaysAgo },
      },
      orderBy: { recordedAt: "desc" },
    });

    if (rawSignals.length === 0) {
      return NextResponse.json(
        { error: "No signal data found for this artist in the last 7 days. Ingest signals first." },
        { status: 404 }
      );
    }

    // Group by signalType: keep latest per type
    const latestByType = new Map<string, typeof rawSignals[0]>();
    for (const sig of rawSignals) {
      if (!latestByType.has(sig.signalType)) {
        latestByType.set(sig.signalType, sig);
      }
    }

    // Build signals dict (null for missing expected signals)
    const signals: Record<string, number | null> = {};
    const sources: Record<string, string> = {};
    const ages: Record<string, number> = {};

    for (const sig of ALL_EXPECTED_SIGNALS) {
      const record = latestByType.get(sig);
      if (record) {
        signals[sig] = record.value;
        sources[sig] = (record as any).source ?? "unknown";
        ages[sig] = (Date.now() - record.recordedAt.getTime()) / (1000 * 60 * 60);
      } else {
        signals[sig] = null;
      }
    }

    // Run reasoning
    const result = runReasoning(artistId, artistName, signals, sources, ages);

    const dataIsPartial = result.dataCompletenessPct < 40;

    logger.info("A&R reasoning completed", {
      artistId,
      verdict: result.verdict,
      confidencePct: result.confidencePct,
      dataCompletenessPct: result.dataCompletenessPct,
      contradictions: result.contradictions.length,
    });

    return NextResponse.json(
      {
        ...result,
        ...(dataIsPartial ? { warning: "Signal data is incomplete — verdict confidence is limited. Collect more signals for a reliable assessment." } : {}),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, max-age=3600",
          "X-Reasoning-Model": MODEL_VERSION,
          "X-Data-Completeness": String(result.dataCompletenessPct),
        },
      }
    );
  } catch (err) {
    logger.error("A&R reasoning engine error", { artistId, err });
    return NextResponse.json(
      { error: "Internal error running reasoning engine" },
      { status: 500 }
    );
  }
});
