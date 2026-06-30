/**
 * Tests for the AI scout-brief layer.
 *
 * The key product invariant: we never present an AI-sounding narrative unless a
 * real model produced it. Without a configured key — or on non-signal data —
 * generateScoutBrief must return the deterministic heuristic, tagged as such.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heuristicBrief, generateScoutBrief, type ScoutBriefInput } from '@/lib/ai/scoutBrief'
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
