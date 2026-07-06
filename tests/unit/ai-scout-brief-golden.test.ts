/**
 * Golden-set evaluation for the A&R scout-brief AI workflow.
 *
 * This is the "AI evaluation report with golden set results" evidence: a
 * repeatable, CI-runnable rubric (no API key needed — it scores the
 * deterministic grounded generator and the safety guardrail) with explicit
 * pass thresholds. It measures the dimensions a label team cares about:
 *   - grounding      — names the real lead track + market
 *   - no-fabrication — every number in the brief is one the data supports
 *   - actionability  — leads with the top record and gives a next step
 *   - safety         — no legal/commercial overclaiming
 *   - format         — passes the production plausibility guardrail
 *
 * A regression that made the brief hallucinate a metric, drift off the real
 * top track, or overclaim would drop the score below threshold and fail here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicBrief, isPlausibleBrief, type ScoutBriefInput } from '@/lib/ai/scoutBrief';
import { scoutBriefGolden, type GoldenCase } from '@/tests/golden/scoutBriefGolden';

const pct = (s: number) => Math.round(Math.max(0, Math.min(1, s)) * 100);
const ints = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

// The only numbers a truthful brief may contain: each track's conviction pct,
// the "/100" denominator, and the record count.
function allowedNumbers(input: ScoutBriefInput): Set<number> {
  const set = new Set<number>([100, input.topTracks.length]);
  for (const t of input.topTracks) set.add(pct(t.score));
  return set;
}

const OVERCLAIM = [
  'guaranteed', 'guarantee', 'will chart', 'will be a hit', 'cleared',
  'owns the rights', 'rights are clear', 'no risk', 'certain to',
];

type Dim = 'grounding' | 'noFabrication' | 'actionability' | 'safety' | 'format';

function scoreCase(gc: GoldenCase): Record<Dim, boolean> {
  const { input } = gc;
  const brief = heuristicBrief(input);
  const lower = brief.toLowerCase();

  const mentionsMarket = lower.includes(input.market.toLowerCase());
  const lead = input.topTracks[0];

  const grounding =
    gc.category === 'empty'
      ? mentionsMarket
      : mentionsMarket && (gc.category !== 'signal_backed' || lower.includes(lead.name.toLowerCase()));

  const allowed = allowedNumbers(input);
  const noFabrication = ints(brief).every((n) => allowed.has(n));

  let actionability = true;
  if (gc.category === 'signal_backed') {
    const leadIdx = lower.indexOf(lead.name.toLowerCase());
    const others = input.topTracks.slice(1).map((t) => lower.indexOf(t.name.toLowerCase())).filter((i) => i >= 0);
    const leadsWithTop = leadIdx >= 0 && others.every((i) => leadIdx < i);
    const hasNextStep = /(review|look|follow-up|follow up|priority)/.test(lower);
    actionability = leadsWithTop && hasNextStep;
  } else {
    // Non-signal/empty briefs must set expectations rather than push action.
    actionability = /(paused|fallback|unavailable|yet|context)/.test(lower);
  }

  const safety = !OVERCLAIM.some((w) => lower.includes(w));

  // Empty/fallback briefs are intentionally shorter than the guardrail's floor
  // for a *signal-backed* brief and aren't meant to name a lead track, so the
  // format dimension only applies to the signal-backed path.
  const format = gc.category === 'signal_backed' ? isPlausibleBrief(brief, input) : true;

  return { grounding, noFabrication, actionability, safety, format };
}

test('golden set: grounding and no-fabrication are perfect (hard requirements)', () => {
  for (const gc of scoutBriefGolden) {
    const s = scoreCase(gc);
    assert.ok(s.grounding, `[${gc.id}] grounding failed`);
    assert.ok(s.noFabrication, `[${gc.id}] fabricated a number not supported by the data`);
    assert.ok(s.safety, `[${gc.id}] contains overclaiming language`);
  }
});

test('golden set: overall rubric score >= 0.9 across all dimensions', () => {
  const dims: Dim[] = ['grounding', 'noFabrication', 'actionability', 'safety', 'format'];
  let pass = 0;
  let total = 0;
  for (const gc of scoutBriefGolden) {
    const s = scoreCase(gc);
    for (const d of dims) {
      total++;
      if (s[d]) pass++;
    }
  }
  const rate = pass / total;
  assert.ok(rate >= 0.9, `golden rubric pass rate ${(rate * 100).toFixed(1)}% < 90%`);
});

// ── Safety guardrail as a classifier: a mini-eval of isPlausibleBrief ────────
const guardInput: ScoutBriefInput = {
  market: 'US',
  mode: 'ugc_early',
  isSignalBacked: true,
  topTracks: [{ name: 'Neon Pulse', artists: ['Nova Rae'], score: 0.82 }],
};

test('guardrail accepts a grounded, well-formed brief', () => {
  assert.ok(isPlausibleBrief('Top priority in US right now is Neon Pulse — review it first for A&R follow-up.', guardInput));
});

test('guardrail rejects the known failure modes (ungrounded / empty / runaway)', () => {
  assert.equal(isPlausibleBrief('', guardInput), false, 'empty');
  assert.equal(isPlausibleBrief('x'.repeat(2000), guardInput), false, 'runaway length');
  assert.equal(
    isPlausibleBrief('Several interesting records are trending this week across markets.', guardInput),
    false,
    'never names the real lead track (drifted off the data)',
  );
});
