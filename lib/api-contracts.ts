// lib/api-contracts.ts

export type ArtistSummary = {
  id: number;
  name: string;
};

export type TrackStatsRaw = {
  spotifyStreams?: string;
  spotifyPopularity?: number;
  tiktokVideoCount?: number;
  youtubeViews?: string;
};

export type TrackStatsDerived = {
  streamVelocity7d?: number;
  viralScore?: number;
};

export type TrackResponse = {
  id: number;
  name: string;
  isrc?: string;
  artists: ArtistSummary[];
  album?: {
    id: number;
    name: string;
    label?: string;
  };
  statistics?: {
    raw?: TrackStatsRaw;
    derived?: TrackStatsDerived;
  };
};
