export type EntityType = "track" | "artist";

// ── Trajectory / ML ──────────────────────────────────────────────────────────

export interface TrajectoryScore {
  momentum: number;         // [0, 1]
  breakoutProb: number;     // [0, 1]
  viralityScore: number;    // [0, 1]
  estimatedDaysToViral: number;
  peakScoreEstimate: number; // [0, 100]
  confidence: number;       // [0, 1]
}

export interface TrajectoryPrediction {
  entityType: EntityType;
  entityId: number;
  score: TrajectoryScore;
  modelVersion: string;
  computedAt: string;
}

export interface TrendingEntry {
  entityType: EntityType;
  entityId: number;
  rank: number;
  score: TrajectoryScore;
  deltaRank: number;
  sparkline: number[];
  track?: TrackMeta;
}

// ── Track / Artist ────────────────────────────────────────────────────────────

export interface TrackMeta {
  id: number;
  title: string;
  isrc?: string;
  durationMs?: number;
  releaseDate?: string;
  coverUrl?: string | null;
  popularity?: number;
  artists?: { id: number; name: string }[];
  genres?: string[];
  explicit?: boolean;
}

export interface AudioFeatures {
  danceability?: number;
  energy?: number;
  valence?: number;
  tempo?: number;
  acousticness?: number;
  instrumentalness?: number;
  speechiness?: number;
  liveness?: number;
  loudness?: number;
  key?: number;
  mode?: number;
  timeSignature?: number;
}

export interface ArtistMeta {
  id: number;
  name: string;
  imageUrl?: string | null;
  country?: string;
  followersCount?: string;
  popularity?: number;
}

// ── Signals ───────────────────────────────────────────────────────────────────

export type SignalType =
  | "stream_velocity"
  | "tiktok_growth"
  | "chart_entry"
  | "playlist_add"
  | "radio_spike";

export interface Signal {
  entityType: EntityType;
  entityId: number;
  signalType: SignalType;
  value: number;
  recordedAt: string;
  source?: string;
}

// ── Search ────────────────────────────────────────────────────────────────────

export type SearchEntityType = "track" | "artist" | "playlist" | "curator";

export interface SearchResult {
  type: SearchEntityType;
  id: number;
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  score?: number;
}

// ── User data (Supabase) ──────────────────────────────────────────────────────

export interface WatchlistItem {
  id: string;
  userId: string;
  entityId: number;
  entityType: EntityType;
  addedAt: string;
  track?: TrackMeta;
  trajectory?: TrajectoryPrediction;
}

export type AlertType = "viral_score" | "momentum" | "breakout_prob";

export interface Alert {
  id: string;
  userId: string;
  entityId: number;
  entityType: EntityType;
  threshold: number;
  alertType: AlertType;
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  track?: TrackMeta;
}

export interface AppNotification {
  id: string;
  userId: string;
  message: string;
  entityId?: number;
  entityType?: EntityType;
  isRead: boolean;
  createdAt: string;
}

// ── Chart data shapes ─────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  date: string;
  value: number;
  label?: string;
}

export interface RadarDataPoint {
  metric: string;
  value: number;
  fullMark: number;
}

export interface GeoDataPoint {
  country: string;
  code: string;
  value: number;
}

// ── API response wrappers ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
