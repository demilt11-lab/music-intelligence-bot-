import type { TalentScoutTrack } from './sources';

export function emptyTrack(trackId: number): TalentScoutTrack {
  return {
    trackId,
    name: '',
    artists: [],
    code2: null,
    tiktokScore: 0,
    tiktokViews: '0',
    tiktokLikes: '0',
    tiktokVelocity: 0,
    spotifyStreamsLatest: null,
    spotifyPopularity: null,
    luminateStreamsLatest: null,
    luminateAudienceLatest: null,
    luminateSpinsLatest: null,
    viralScore: null,
    rightsComplexityScore: null,
  };
}
