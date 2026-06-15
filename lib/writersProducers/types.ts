// lib/writersProducers/types.ts

export type WriterProducerRole =
  | 'songwriter'
  | 'writer'
  | 'lyricist'
  | 'composer'
  | 'producer'
  | 'co-producer'
  | 'executive_producer';

export const WRITER_ROLES: WriterProducerRole[] = [
  'songwriter',
  'writer',
  'lyricist',
  'composer',
];

export const PRODUCER_ROLES: WriterProducerRole[] = [
  'producer',
  'co-producer',
  'executive_producer',
];

export const ALL_CREATOR_ROLES: WriterProducerRole[] = [
  ...WRITER_ROLES,
  ...PRODUCER_ROLES,
];

export type CreatorType = 'writer' | 'producer' | 'both';

export interface PlaylistAppearance {
  playlistId: number;
  playlistName: string;
  platform: string;
  followerCount: string | null;
  isOfficial: boolean;
  trackPosition: number | null;
  addedAt: string | null;
}

export interface ChartPosition {
  chartType: string;
  platform: string;
  rank: number;
  peakRank: number | null;
  date: string;
}

export interface Collaboration {
  trackId: number;
  trackTitle: string;
  isrc: string | null;
  releaseDate: string | null;
  coCreators: Array<{ id: number; name: string; role: string | null }>;
  playlists: PlaylistAppearance[];
  chartPositions: ChartPosition[];
  totalStreams: string | null;
  tiktokViews: string | null;
  youtubeViews: string | null;
}

export interface WriterProducerResult {
  id: number;
  name: string;
  slug: string | null;
  ipi: string | null;
  roles: WriterProducerRole[];
  creatorType: CreatorType;
  trackCount: number;
  recentCollaborations: Collaboration[];
  risingScore: number | null;
  isSigned: boolean;
  signedLabel: string | null;
  region: string | null;
  source: 'database' | 'spotify' | 'youtube' | 'soundcloud' | 'blog';
}

/**
 * A detected concentration event: the creator is credited on multiple songs
 * from the same album, the same playlist, or within the same release week.
 * Surfaced in the UI as evidence for the multiTrackPresence score.
 */
export interface ClusterEvent {
  type: 'album' | 'playlist' | 'weekly_release';
  name: string;           // album title / playlist name / "Week of YYYY-MM-DD"
  trackCount: number;     // how many of this creator's tracks appear in the cluster
  trackTitles: string[];  // the actual track titles
  releaseDate?: string;   // ISO date — for album clusters
  followerCount?: string | null; // for playlist clusters
  isOfficial?: boolean;   // for playlist clusters
}

export interface RisingTalentEntry {
  songwriterId: number;
  name: string;
  slug: string | null;
  creatorType: CreatorType;
  risingScore: number;
  streamVelocity: number | null;
  playlistMomentum: number | null;
  collaborationScore: number | null;
  ugcMomentum: number | null;
  multiTrackPresence: number | null;
  mlBreakoutProb30d: number | null;
  isSigned: boolean;
  signedLabel: string | null;
  region: string;
  topTracks: Array<{
    trackId: number;
    title: string;
    artists: string[];
    topPlaylist: string | null;
    chartRank: number | null;
    streams7d: string | null;
  }>;
  notableCollaborators: string[];
  clusterEvents: ClusterEvent[];
}

export interface ExternalCreatorHit {
  name: string;
  platform: 'spotify' | 'youtube' | 'soundcloud' | 'blog';
  externalId: string | null;
  profileUrl: string | null;
  imageUrl: string | null;
  bio: string | null;
  followerCount: number | null;
  topTracks: Array<{
    title: string;
    artists: string[];
    url: string | null;
    playCount: number | null;
  }>;
  playlists: Array<{
    name: string;
    url: string | null;
    trackCount: number | null;
  }>;
  estimatedRisingScore: number | null;
}
