/**
 * Tests for the AI scout-brief layer.
 *
 * The key product invariant: we never present an AI-sounding narrative unless a
 * real model produced it. Without a configured key — or on non-signal data —
 * generateScoutBrief must return the deterministic heuristic, tagged as such.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heuristicBrief, generateScoutBrief, isPlausibleBrief, type ScoutBriefInput } from '@/lib/ai/scoutBrief'
import { isAiConfigured } from '@/lib/ai/anthropic'

const SIGNAL_INPUT: ScoutBriefInput = {
  market: 'US',
  mode: 'ugc_early',
  isSignalBacked: true,
  topTracks: [
    { name: 'Neon Pulse', artists: ['Nova Rae'], score: 0.82 },
    { name: 'Frequency', artists: ['Jay Meridian'], score: 0.61 },
  ],
}

test('heuristicBrief leads with the top track for a signal-backed scan', () => {
  const text = heuristicBrief(SIGNAL_INPUT)
  assert.ok(text.includes('Neon Pulse'), 'names the lead track')
  assert.ok(text.includes('US'), 'names the market')
  assert.ok(/82\/100/.test(text), 'includes the conviction score')
})

test('heuristicBrief is explicit when the batch is not signal-backed', () => {
  const text = heuristicBrief({ ...SIGNAL_INPUT, isSignalBacked: false })
  assert.ok(/fallback data/i.test(text), 'flags fallback data')
  assert.ok(/paused/i.test(text), 'states conviction scoring is paused')
})

test('heuristicBrief handles an empty scan without throwing', () => {
  const text = heuristicBrief({ ...SIGNAL_INPUT, topTracks: [] })
  assert.ok(text.length > 0)
  assert.ok(/no live/i.test(text))
})

test('isAiConfigured reflects ANTHROPIC_API_KEY presence', () => {
  const prev = process.env.ANTHROPIC_API_KEY
  try {
    delete process.env.ANTHROPIC_API_KEY
    assert.equal(isAiConfigured(), false)
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    assert.equal(isAiConfigured(), true)
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  }
})

test('generateScoutBrief returns the heuristic (no model call) when AI is unconfigured', async () => {
  const prev = process.env.ANTHROPIC_API_KEY
  try {
    delete process.env.ANTHROPIC_API_KEY
    const result = await generateScoutBrief(SIGNAL_INPUT)
    assert.equal(result.source, 'heuristic')
    assert.equal(result.model, undefined)
    assert.equal(result.text, heuristicBrief(SIGNAL_INPUT))
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  }
})

test('generateScoutBrief never calls the model on non-signal data', async () => {
  // Even with a key set, a non-signal batch must stay heuristic — no spend,
  // no AI-sounding output on data that isn't real signal.
  const prev = process.env.ANTHROPIC_API_KEY
  try {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    const result = await generateScoutBrief({ ...SIGNAL_INPUT, isSignalBacked: false })
    assert.equal(result.source, 'heuristic')
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  }
})

// ── isPlausibleBrief — the guard against shipping an ungrounded or
// malformed model response as if it were a real briefing ────────────────────

test('isPlausibleBrief accepts a response that names the lead track', () => {
  const text = `Top priority is Neon Pulse by Nova Rae, leading on combined momentum. Also worth a look: Frequency.`
  assert.equal(isPlausibleBrief(text, SIGNAL_INPUT), true)
})

test('isPlausibleBrief rejects a response that never mentions the lead track', () => {
  // Simulates a drifted/hallucinated response that ignores the real top
  // track entirely — this is exactly the failure mode with no prior check.
  const text = `Top priority is Midnight Echo by an unlisted artist, showing huge growth this week across every platform.`
  assert.equal(isPlausibleBrief(text, SIGNAL_INPUT), false)
})

test('isPlausibleBrief rejects an empty or near-empty response', () => {
  assert.equal(isPlausibleBrief('', SIGNAL_INPUT), false)
  assert.equal(isPlausibleBrief('Neon Pulse.', SIGNAL_INPUT), false)
})

test('isPlausibleBrief rejects a runaway-length response', () => {
  const text = `Neon Pulse ${'is trending. '.repeat(200)}`
  assert.equal(isPlausibleBrief(text, SIGNAL_INPUT), false)
})

test('isPlausibleBrief rejects when there are no top tracks to ground against', () => {
  assert.equal(isPlausibleBrief('Neon Pulse is a great record.', { ...SIGNAL_INPUT, topTracks: [] }), false)
})

test('generateScoutBrief falls back to heuristic when the model response fails the plausibility check', async () => {
  // Exercises the real generateText call path with a mocked global fetch so
  // we can prove the ungrounded-response guard actually short-circuits to
  // the heuristic, without hitting the real Anthropic API.
  const prev = process.env.ANTHROPIC_API_KEY
  const originalFetch = globalThis.fetch
  try {
    process.env.ANTHROPIC_API_KEY = 'sk-test'
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Some other record is blowing up right now with huge numbers.' }],
        }),
        { status: 200 },
      )) as typeof fetch

    const result = await generateScoutBrief(SIGNAL_INPUT)
    assert.equal(result.source, 'heuristic', 'ungrounded model output must not ship as an AI briefing')
    assert.equal(result.text, heuristicBrief(SIGNAL_INPUT))
  } finally {
    globalThis.fetch = originalFetch
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prev
  }
})
