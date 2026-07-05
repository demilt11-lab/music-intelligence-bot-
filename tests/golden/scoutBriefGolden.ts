// tests/golden/scoutBriefGolden.ts
//
// Golden dataset for the A&R scout-brief AI workflow. Each case pins an input
// scenario and the category it belongs to; the rubric in
// tests/unit/ai-scout-brief-golden.test.ts scores the generated brief against
// grounding / no-fabrication / actionability / safety dimensions.
//
// This is the "golden set" evidence for the AI evaluation gate. Add rows here as
// new failure modes are discovered; the rubric enforces the same bar on all.
import type { ScoutBriefInput } from '@/lib/ai/scoutBrief';

export type GoldenCategory = 'signal_backed' | 'not_signal_backed' | 'empty';

export type GoldenCase = {
  id: string;
  input: ScoutBriefInput;
  category: GoldenCategory;
};

export const scoutBriefGolden: GoldenCase[] = [
  {
    id: 'ugc-3-tracks-us',
    category: 'signal_backed',
    input: {
      market: 'US',
      mode: 'ugc_early',
      isSignalBacked: true,
      topTracks: [
        { name: 'Neon Pulse', artists: ['Nova Rae'], score: 0.82 },
        { name: 'Frequency', artists: ['Jay Meridian'], score: 0.61 },
        { name: 'Undertow', artists: ['Kline'], score: 0.55 },
      ],
    },
  },
  {
    id: 'general-single-track-gb',
    category: 'signal_backed',
    input: {
      market: 'GB',
      mode: 'general',
      isSignalBacked: true,
      topTracks: [{ name: 'Cassette Sun', artists: ['Marlowe Ait'], score: 0.74 }],
    },
  },
  {
    id: 'general-5-tracks-global',
    category: 'signal_backed',
    input: {
      market: 'GLOBAL',
      mode: 'general',
      isSignalBacked: true,
      topTracks: [
        { name: 'Aster', artists: ['Vell'], score: 0.9 },
        { name: 'Paper Crowns', artists: ['The Lyle'], score: 0.71 },
        { name: 'Molten', artists: ['Sga'], score: 0.66 },
        { name: 'Halo Static', artists: ['Ovr'], score: 0.6 },
        { name: 'Riverside', artists: ['Meko', 'Dae'], score: 0.58 },
      ],
    },
  },
  {
    id: 'no-artist-name',
    category: 'signal_backed',
    input: {
      market: 'BR',
      mode: 'ugc_early',
      isSignalBacked: true,
      topTracks: [{ name: 'Sem Nome', artists: [], score: 0.68 }],
    },
  },
  {
    id: 'fallback-not-signal-backed',
    category: 'not_signal_backed',
    input: {
      market: 'DE',
      mode: 'general',
      isSignalBacked: false,
      topTracks: [
        { name: 'Old Catalog A', artists: ['X'], score: 0.4 },
        { name: 'Old Catalog B', artists: ['Y'], score: 0.3 },
      ],
    },
  },
  {
    id: 'empty-no-tracks',
    category: 'empty',
    input: { market: 'JP', mode: 'ugc_early', isSignalBacked: true, topTracks: [] },
  },
];
