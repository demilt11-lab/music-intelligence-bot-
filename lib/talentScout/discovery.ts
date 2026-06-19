// lib/talentScout/discovery.ts
//
// NOV8TE discovery ranker — "songs to watch" lens.
//
// The primary Talent Scout ranker (lib/talentScout/score.ts) surfaces early
// breakouts from TikTok UGC velocity. This module ranks on a complementary,
// more downstream signal pair that A&R teams use to spot songs *converting*
// into real consumption + editorial momentum:
//
//   1. Month-over-month STREAMING GROWTH
//        source: track_platform_stats_daily.streams, summed over the last 30
//        days vs the prior 30 days.
//
//   2. Growth in CURATED-PLAYLIST FEATURES
//        source: playlist_membership_events (eventType='added') on playlists
//        that are linked to a curator via curator_playlists, counted over the
//        last 30 days vs the prior 30 days.
//
// Normalization mirrors compute_track_signals.ts (robust p95 normalization) so
// a single viral outlier can't compress everyone else's score to zero.

export type WatchCandidate = {
  trackId: number
  name: string
  artists: string[]
  /** Sum of daily streams over the last 30 days (track_platform_stats_daily). */
  streamsLast30d: number
  /** Sum of daily streams over the 30 days before that (the prior month). */
  streamsPrior30d: number
  /** Curated-playlist adds in the last 30 days (membership events on curator playlists). */
  curatedPlaylistAddsLast30d: number
  /** Curated-playlist adds in the prior 30 days. */
  curatedPlaylistAddsPrior30d: number
}

export type WatchScoreWeights = {
  streamGrowth: number
  playlistGrowth: number
}

/** Both criteria carry equal billing in the user's brief. */
export const DEFAULT_WEIGHTS: WatchScoreWeights = {
  streamGrowth: 0.5,
  playlistGrowth: 0.5,
}

export type RankedWatchCandidate = WatchCandidate & {
  /** MoM streaming growth as a rate (0.42 = +42%). */
  streamGrowthRate: number
  /** Absolute change in curated-playlist features vs the prior month. */
  curatedPlaylistAddsDelta: number
  /** Normalized [0,1] subscore for streaming growth (relative to the pool). */
  streamGrowthScore: number
  /** Normalized [0,1] subscore for curated-playlist momentum (relative to the pool). */
  playlistGrowthScore: number
  /** Blended [0,1] score used for ranking. */
  watchScore: number
  /** Human-readable justification for the watch recommendation. */
  reasons: string[]
}

// ── numeric helpers (shared philosophy with compute_track_signals.ts) ──

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * 95th-percentile of a set of values, used as the normalization denominator.
 * Robust to a single outlier dominating the scale.
 */
function computeP95(values: number[]): number {
  if (!values.length) return 1
  const sorted = values.slice().sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  return sorted[Math.min(idx, sorted.length - 1)] || 1
}

function robustNorm(value: number, p95: number): number {
  if (p95 <= 0) return 0
  return clamp(value / p95, 0, 1)
}

/**
 * Month-over-month growth rate. A floor on the denominator keeps a track that
 * goes from near-zero to real streams from producing an unbounded rate, while
 * still rewarding it strongly. Clamped to [-1, 4] (i.e. -100% .. +400%).
 */
export function streamGrowthRate(last30d: number, prior30d: number): number {
  const denom = Math.max(prior30d, 1)
  return clamp((last30d - prior30d) / denom, -1, 4)
}

/**
 * Decide whether a candidate belongs on a "to watch" list at all. The brief
 * asks for songs with BOTH increasing streams AND increased curated-playlist
 * features, so both signals must be trending up.
 */
export function qualifiesAsWatch(c: WatchCandidate): boolean {
  const streamUp = c.streamsLast30d > c.streamsPrior30d
  const playlistUp = c.curatedPlaylistAddsLast30d > c.curatedPlaylistAddsPrior30d
  return streamUp && playlistUp
}

function buildReasons(
  c: WatchCandidate,
  growthRate: number,
  playlistDelta: number,
): string[] {
  const reasons: string[] = []

  const pct = Math.round(growthRate * 100)
  reasons.push(
    `Streams +${pct}% MoM (${formatCount(c.streamsPrior30d)} → ${formatCount(c.streamsLast30d)})`,
  )
  reasons.push(
    `Curated-playlist features ${c.curatedPlaylistAddsPrior30d} → ` +
      `${c.curatedPlaylistAddsLast30d} (+${playlistDelta})`,
  )

  if (growthRate >= 1) reasons.push('Streaming more than doubled month-over-month')
  if (playlistDelta >= 5) reasons.push('Strong editorial pickup — 5+ new curated features')

  return reasons
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

/**
 * Rank candidates as "songs to watch" by blended streaming + curated-playlist
 * momentum. Only candidates trending up on BOTH signals are returned.
 *
 * @param candidates pool of candidate tracks (already hydrated with the four windows)
 * @param weights    relative weight of each signal (defaults to 50/50)
 * @returns          ranked qualifiers, highest watchScore first
 */
export function rankWatchCandidates(
  candidates: WatchCandidate[],
  weights: WatchScoreWeights = DEFAULT_WEIGHTS,
): RankedWatchCandidate[] {
  const qualifiers = candidates.filter(qualifiesAsWatch)
  if (!qualifiers.length) return []

  // Raw signals.
  const growthRates = qualifiers.map((c) =>
    streamGrowthRate(c.streamsLast30d, c.streamsPrior30d),
  )
  // Curated-playlist momentum = magnitude of recent features + acceleration.
  const playlistRaws = qualifiers.map(
    (c) =>
      c.curatedPlaylistAddsLast30d +
      Math.max(0, c.curatedPlaylistAddsLast30d - c.curatedPlaylistAddsPrior30d),
  )

  // Robust normalization denominators (relative to the qualifying pool).
  const growthP95 = computeP95(growthRates.map((g) => Math.max(0, g)))
  const playlistP95 = computeP95(playlistRaws)

  const totalWeight = weights.streamGrowth + weights.playlistGrowth || 1

  const ranked = qualifiers.map((c, i) => {
    const rate = growthRates[i]
    const playlistDelta =
      c.curatedPlaylistAddsLast30d - c.curatedPlaylistAddsPrior30d

    const streamGrowthScore = robustNorm(Math.max(0, rate), growthP95)
    const playlistGrowthScore = robustNorm(playlistRaws[i], playlistP95)

    const watchScore = clamp(
      (weights.streamGrowth * streamGrowthScore +
        weights.playlistGrowth * playlistGrowthScore) /
        totalWeight,
      0,
      1,
    )

    return {
      ...c,
      streamGrowthRate: rate,
      curatedPlaylistAddsDelta: playlistDelta,
      streamGrowthScore,
      playlistGrowthScore,
      watchScore,
      reasons: buildReasons(c, rate, playlistDelta),
    }
  })

  return ranked.sort((a, b) => b.watchScore - a.watchScore)
}
