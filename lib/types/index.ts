// lib/types/index.ts

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── API Envelope ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Radio ────────────────────────────────────────────────────────────────────

export interface RadioItem {
  id: string;
  slug: string;
  name: string;
  countryCode: string | null;
  market: string | null;
  genre: string | null;
  streamUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

export interface RadioSpinItem {
  id: string;
  radioId: string;
  songUuid: string;
  songTitle: string | null;
  artistName: string | null;
  isrc: string | null;
  airedAtUtc: string;
  durationSec: number | null;
  countryCode: string | null;
}

// ─── Track ────────────────────────────────────────────────────────────────────

export interface TrackItem {
  id: number;
  isrc: string | null;
  title: string;
  explicit: boolean;
  releaseDate: string | null;
  coverUrl: string | null;
  popularity: number | null;
  artists: { id: number; name: string; role: string }[];
}

// ─── Artist ───────────────────────────────────────────────────────────────────

export interface ArtistItem {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  country: string | null;
  popularity: number | null;
  followersCount: number | null;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

export interface ChartRowItem {
  position: number;
  prevPosition: number | null;
  weeksOnChart: number;
  peakPosition: number | null;
  track: TrackItem | null;
}

export interface ChartSnapshotItem {
  id: number;
  platform: string;
  chartName: string;
  countryCode: string | null;
  snapshotDate: string;
  rows: ChartRowItem[];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  tracks: TrackItem[];
  artists: ArtistItem[];
  radios: RadioItem[];
  total: number;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  db: 'ok' | 'error';
  cache: 'ok' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
}
