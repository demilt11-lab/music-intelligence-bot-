// lib/ai/scoutBrief.ts
//
// Generates the A&R "Buddy briefing" shown at the top of the Talent Scout feed.
//
// The brief is grounded entirely in the real ranked tracks for the current
// scan. When a real model response is available it is used; otherwise we fall
// back to a deterministic, data-derived summary. We NEVER fabricate an
// AI-sounding narrative on top of non-signal data — if the batch isn't
// signal-backed, the heuristic (which states that plainly) is used.

import { generateText, isAiConfigured, aiModel } from './anthropic'

export type ScoutBriefTrack = {
  name: string
  artists: string[]
  /** 0..1 conviction score. */
  score: number
}

export type ScoutBriefInput = {
  market: string
  mode: 'ugc_early' | 'general'
  isSignalBacked: boolean
  topTracks: ScoutBriefTrack[]
}

export type ScoutBriefResult = {
  text: string
  source: 'ai' | 'heuristic'
  model?: string
}

const MODE_LABEL: Record<ScoutBriefInput['mode'], string> = {
  ugc_early: 'early UGC breakouts',
  general: 'general cross-platform momentum',
}

function pct(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function describeTrack(t: ScoutBriefTrack): string {
  const artists = t.artists.length ? ` by ${t.artists.join(', ')}` : ''
  return `${t.name}${artists} (conviction ${pct(t.score)}/100)`
}

/**
 * Deterministic fallback. Always safe to show: it only states what the data
 * actually supports and never implies model reasoning that didn't happen.
 */
export function heuristicBrief(input: ScoutBriefInput): string {
  const { market, mode, isSignalBacked, topTracks } = input

  if (!topTracks.length) {
    return `No live ${MODE_LABEL[mode]} have loaded for ${market} yet. Once the ingest pipeline refreshes, the strongest breakout candidates will surface here for review.`
  }

  if (!isSignalBacked) {
    return `Showing ${topTracks.length} record${topTracks.length === 1 ? '' : 's'} for ${market} from fallback data while live breakout signals are unavailable. Treat these as catalog context, not conviction calls — conviction scoring stays paused until real signals arrive.`
  }

  const lead = topTracks[0]
  const others = topTracks.slice(1, 3).map((t) => t.name)
  const tail = others.length ? ` Also worth a look: ${others.join(' and ')}.` : ''
  return `Top priority in ${market} right now is ${describeTrack(lead)}, leading this ${MODE_LABEL[mode]} scan on combined momentum signals — review it first for A&R follow-up.${tail}`
}

function buildPrompt(input: ScoutBriefInput): string {
  const lines = input.topTracks
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${describeTrack(t)}`)
    .join('\n')

  return [
    `Market: ${input.market}`,
    `Scout lens: ${MODE_LABEL[input.mode]}`,
    `Top ranked records (already scored by our momentum model):`,
    lines,
    '',
    'Write a 2-3 sentence A&R briefing for a label scout reviewing this scan.',
    'Lead with the single highest-priority record and why it deserves attention first.',
    'Only reference the records and conviction scores provided above — do not invent',
    'streaming numbers, deal context, or facts not given. Be direct and specific.',
  ].join('\n')
}

const SYSTEM_PROMPT =
  'You are Buddy, an A&R analyst assistant for a music-intelligence platform. ' +
  'You help label scouts triage breaking records. You are precise and grounded: ' +
  'you only speak to the data you are given, never fabricate metrics, and keep ' +
  'briefings tight and decision-oriented. No emojis, no preamble.'

const MIN_BRIEF_LENGTH = 20
const MAX_BRIEF_LENGTH = 1200

/**
 * Cheap, reliable sanity check on a model-generated brief before it ships —
 * not a full hallucination detector (that would need semantic parsing this
 * codebase doesn't have), but it catches the failure modes that matter most:
 * a response that never even grounds itself in the real top track, or one
 * that's empty/garbage/runaway. There was previously no check of any kind —
 * any non-empty string from the model shipped as-is.
 */
export function isPlausibleBrief(text: string, input: ScoutBriefInput): boolean {
  if (text.length < MIN_BRIEF_LENGTH || text.length > MAX_BRIEF_LENGTH) return false
  if (!input.topTracks.length) return false

  const lead = input.topTracks[0]
  const normalized = text.toLowerCase()
  // The prompt explicitly asks the model to lead with the top track — a
  // response that never names it either ignored the instruction or drifted
  // off the real data, either way not safe to label as a grounded briefing.
  return normalized.includes(lead.name.toLowerCase())
}

/**
 * Produce the scout briefing. Uses Claude when configured and the batch is
 * signal-backed; otherwise returns the deterministic heuristic.
 */
export async function generateScoutBrief(
  input: ScoutBriefInput,
): Promise<ScoutBriefResult> {
  const fallback: ScoutBriefResult = {
    text: heuristicBrief(input),
    source: 'heuristic',
  }

  // Only spend a model call when there is real signal to talk about.
  if (!isAiConfigured() || !input.isSignalBacked || input.topTracks.length === 0) {
    return fallback
  }

  const text = await generateText({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input),
    maxTokens: 400,
  })

  if (!text) return fallback
  if (!isPlausibleBrief(text, input)) {
    console.warn('[ai/scout-brief] model response failed plausibility check — falling back to heuristic')
    return fallback
  }
  return { text, source: 'ai', model: aiModel() }
}
