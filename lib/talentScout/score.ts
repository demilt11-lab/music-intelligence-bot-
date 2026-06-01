// lib/talentScout/score.ts
import type { TalentScoutTrack } from './sources';

export type { TalentScoutTrack };

export type TalentScoutAction = {
  type:
    | 'ugc_double_down'
    | 'playlist_pitch'
    | 'geo_focus'
    | 'radio_watch'
    | 'rights_cleanup';
  description: string;
  expectedImpact: string;
};

export type TalentScoutRankedTrack = TalentScoutTrack & {
  totalScore: number;
  actions: TalentScoutAction[];
};

export type TalentScoutMode = 'ugc_early' | 'general';

export function rankTalentTracks(
  tracks: TalentScoutTrack[],
  mode: TalentScoutMode = 'ugc_early',
): TalentScoutRankedTrack[] {
  const scored = tracks
    .filter((t) => filterPreBreak(t, mode))
    .map((t) => {
      const totalScore =
        mode === 'ugc_early'
          ? computeUgcEarlyScore(t)
          : computeGeneralScore(t);
      return {
        ...t,
        totalScore,
        actions: buildActions(t, totalScore),
      };
    });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

function filterPreBreak(t: TalentScoutTrack, mode: TalentScoutMode): boolean {
  if (mode !== 'ugc_early') return true;
  const combined = Number(t.spotifyStreamsLatest ?? 0) + Number(t.luminateStreamsLatest ?? 0);
  return combined < 20_000_000;
}

function computeUgcEarlyScore(t: TalentScoutTrack): number {
  const ugcGrowth = growthScore(t.tiktokVelocity) * 0.4 + (t.tiktokScore ?? 0) * 0.3;
  const baselinePenalty = baselineSizePenalty(t.spotifyStreamsLatest, t.luminateStreamsLatest);
  const rightsPenalty = (t.rightsComplexityScore ?? 0) * 0.1;
  return ugcGrowth - baselinePenalty - rightsPenalty;
}

function computeGeneralScore(t: TalentScoutTrack): number {
  return growthScore(t.tiktokVelocity) * 0.3 + (t.tiktokScore ?? 0) * 0.2;
}

function growthScore(delta: number | undefined | null): number {
  if (!delta || Number.isNaN(delta)) return 0;
  const capped = Math.max(-100, Math.min(300, delta));
  return capped / 100;
}

function baselineSizePenalty(
  spotifyStreamsLatest: string | null | undefined,
  luminateStreamsLatest: string | null | undefined,
): number {
  const combined = Number(spotifyStreamsLatest ?? 0) + Number(luminateStreamsLatest ?? 0);
  if (combined <= 0) return 0;
  const log = Math.log10(combined + 1);
  return Math.max(0, (log - 6) / 4);
}

function buildActions(t: TalentScoutTrack, totalScore: number): TalentScoutAction[] {
  const actions: TalentScoutAction[] = [];

  if (growthScore(t.tiktokVelocity) > 0.5) {
    actions.push({
      type: 'ugc_double_down',
      description: 'UGC videos are surging; secure key creators and seed more content in lead markets.',
      expectedImpact: 'Sustain UGC velocity and widen creator base over next 7–14 days.',
    });
  }

  if (!t.spotifyStreamsLatest || Number(t.spotifyStreamsLatest) < 500_000) {
    actions.push({
      type: 'playlist_pitch',
      description: 'Track is early on streaming; pitch to editorial and algorithmic playlists.',
      expectedImpact: 'Convert UGC demand into 20–30% higher daily streams.',
    });
  }

  if (t.luminateSpinsLatest && Number(t.luminateSpinsLatest) > 0) {
    actions.push({
      type: 'radio_watch',
      description: 'Monitor early radio adopters for potential targeted pushes.',
      expectedImpact: 'Increase audience where spins are starting without overcommitting spend.',
    });
  }

  if ((t.rightsComplexityScore ?? 0) > 0.5) {
    actions.push({
      type: 'rights_cleanup',
      description: 'Rights and credits look complex; align ahead of campaign to avoid friction.',
      expectedImpact: 'Faster licensing and fewer blocked opportunities with partners and platforms.',
    });
  }

  if (!actions.length && totalScore > 0) {
    actions.push({
      type: 'geo_focus',
      description: 'Focus early marketing on top UGC geos where momentum is strongest.',
      expectedImpact: 'Increase conversion from UGC to platform streams in those markets.',
    });
  }

  return actions;
}
