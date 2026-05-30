// lib/talentScout/score.ts

import { TalentScoutTrack } from './sources';

export type TalentScoutAction = {
  type:
    | 'playlist_pitch'
    | 'tiktok_creator_outreach'
    | 'radio_push'
    | 'international_focus'
    | 'rights_cleanup';
  description: string;
  expectedImpact: string;
};

export type TalentScoutRankedTrack = TalentScoutTrack & {
  totalScore: number;
  actions: TalentScoutAction[];
};

export function rankTalentTracks(tracks: TalentScoutTrack[]): TalentScoutRankedTrack[] {
  const scored = tracks.map((t) => {
    const viralScore = t.viralScore ?? computeSimpleViralScore(t);
    const rightsPenalty = t.rightsComplexityScore ?? 0;

    const base =
      viralScore * 0.6 +
      normalizeStreams(t.spotifyStreamsLatest) * 0.2 +
      normalizeStreams(t.luminateStreamsLatest) * 0.2;

    const totalScore = base - rightsPenalty * 0.1;

    return {
      ...t,
      totalScore,
      actions: buildActions({ ...t, totalScore }),
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

function computeSimpleViralScore(t: TalentScoutTrack): number {
  const v = t.tiktokVelocity ?? 0;
  const views = Number(t.tiktokViews ?? 0);
  const likes = Number(t.tiktokLikes ?? 0);
  const viewsComponent = views > 0 ? Math.log10(views) : 0;
  const likesComponent = likes > 0 ? Math.log10(likes) : 0;
  return v * 0.5 + viewsComponent * 0.3 + likesComponent * 0.2;
}

function normalizeStreams(value: string | null): number {
  if (!value) return 0;
  const num = Number(value);
  if (!num || num <= 0) return 0;
  return Math.min(1, Math.log10(num + 1) / 7); // cap around 10M+ as ~1
}

function buildActions(t: TalentScoutRankedTrack): TalentScoutAction[] {
  const actions: TalentScoutAction[] = [];

  if ((t.tiktokVelocity ?? 0) > 3) {
    actions.push({
      type: 'tiktok_creator_outreach',
      description: 'Lock in top creators posting this sound in key markets.',
      expectedImpact: 'Increase TikTok video volume and sustain velocity over next 7–14 days.',
    });
  }

  if (!t.spotifyStreamsLatest || Number(t.spotifyStreamsLatest) < 500000) {
    actions.push({
      type: 'playlist_pitch',
      description: 'Target priority editorial and algorithmic playlists for early adoption.',
      expectedImpact: 'Translate TikTok demand into 20–30% lift in Spotify daily streams.',
    });
  }

  if (t.luminateSpinsLatest && Number(t.luminateSpinsLatest) > 0) {
    actions.push({
      type: 'radio_push',
      description: 'Double down on stations already spinning the record.',
      expectedImpact: 'Grow audience impressions and chart position in those markets.',
    });
  }

  // Placeholder for proprietary rights signal
  if ((t.rightsComplexityScore ?? 0) > 0.5) {
    actions.push({
      type: 'rights_cleanup',
      description: 'Align rights and credits to reduce friction for campaigns.',
      expectedImpact: 'Faster licensing and fewer blocked opportunities across partners.',
    });
  }

  return actions;
}
