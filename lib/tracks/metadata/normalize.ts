import { toBigIntString, safeNumber } from '@/lib/shared/bigint';
import { TrackMetadata, TrackArtist, TrackAlbum, TrackStatistics } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

/** Returns `null` when `v` is nullish, otherwise trims and returns the string. */
function nullableStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/** Converts a Date, ISO string, or null to an ISO date string (YYYY-MM-DD) or null. */
function toDateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10) || null;
}

/** Safely converts an unknown value to a number, or returns null. */
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-shape normalisers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a raw `trackArtists[n].artist` relation into a {@link TrackArtist}.
 */
function normalizeTrackArtist(artistRow: RawRow): TrackArtist {
  return {
    id: Number(artistRow.id),
    name: String(artistRow.name ?? ''),
    imageUrl: nullableStr(artistRow.imageUrl ?? artistRow.image_url),
    code2: nullableStr(artistRow.code2 ?? artistRow.countryCode),
  };
}

/**
 * Normalises a raw `trackAlbums[n].album` relation into a {@link TrackAlbum}.
 */
function normalizeTrackAlbum(albumRow: RawRow): TrackAlbum {
  return {
    id: Number(albumRow.id),
    name: String(albumRow.name ?? albumRow.title ?? ''),
    upc: nullableStr(albumRow.upc),
    releaseDate: toDateStr(albumRow.releaseDate ?? albumRow.release_date),
    label: nullableStr(albumRow.label),
    imageUrl: nullableStr(albumRow.imageUrl ?? albumRow.image_url),
    popularity: toNumber(albumRow.popularity),
  };
}

/**
 * Normalises a raw `trackStatisticsLatest` row (or array) into
 * {@link TrackStatistics}.
 *
 * The statistics relation may be a single row or an array depending on the
 * Prisma schema definition. Both shapes are handled.
 */
function normalizeStatistics(raw: unknown): TrackStatistics {
  const empty: TrackStatistics = {
    spotifyPopularity: null,
    spotifyStreams: null,
    tiktokVideoCount: null,
    geniusPageViews: null,
    youtubeViews: null,
    shazamCount: null,
    pandoraStreams: null,
    boomplayStreams: null,
  };

  if (!raw) return empty;

  // Handle both array and single-object shapes
  const row: RawRow = Array.isArray(raw)
    ? (raw[0] as RawRow | undefined) ?? {}
    : (raw as RawRow);

  if (!row) return empty;

  return {
    spotifyPopularity: toNumber(row.spotifyPopularity ?? row.spotify_popularity),
    spotifyStreams: toBigIntString(
      (row.spotifyStreams ?? row.spotify_streams) as bigint | number | null | undefined,
    ),
    tiktokVideoCount: toBigIntString(
      (row.tiktokVideoCount ?? row.tiktok_video_count) as bigint | number | null | undefined,
    ),
    geniusPageViews: toBigIntString(
      (row.geniusPageViews ?? row.genius_page_views) as bigint | number | null | undefined,
    ),
    youtubeViews: toBigIntString(
      (row.youtubeViews ?? row.youtube_views) as bigint | number | null | undefined,
    ),
    shazamCount: toBigIntString(
      (row.shazamCount ?? row.shazam_count) as bigint | number | null | undefined,
    ),
    pandoraStreams: toBigIntString(
      (row.pandoraStreams ?? row.pandora_streams) as bigint | number | null | undefined,
    ),
    boomplayStreams: toBigIntString(
      (row.boomplayStreams ?? row.boomplay_streams) as bigint | number | null | undefined,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag classification
// ─────────────────────────────────────────────────────────────────────────────

const TAG_TYPE_MAP: Record<string, keyof Pick<TrackMetadata, 'tags' | 'moods' | 'activities' | 'genres'>> = {
  tag: 'tags',
  mood: 'moods',
  activity: 'activities',
  genre: 'genres',
};

// ─────────────────────────────────────────────────────────────────────────────
// Primary normaliser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw Prisma track row (with all required relations) into the
 * strongly-typed {@link TrackMetadata} shape.
 *
 * - All snake_case fields are mapped to camelCase.
 * - BigInt values are serialised as decimal strings.
 * - Null arrays are normalised to empty arrays.
 * - The shape is stable: every key is always present.
 *
 * @param row - Raw Prisma result from {@link queryTrack}.
 */
export function normalizeTrackMetadata(row: unknown): TrackMetadata {
  const r = row as RawRow;

  // ── Artists ──────────────────────────────────────────────────────────────
  const trackArtistsRaw =
    (r.trackArtists as Array<RawRow> | undefined) ?? [];
  const artists: TrackArtist[] = trackArtistsRaw.map((ta) => {
    const artistRow = (ta.artist as RawRow | undefined) ?? ta;
    return normalizeTrackArtist(artistRow);
  });

  // ── Albums ───────────────────────────────────────────────────────────────
  const trackAlbumsRaw = (r.trackAlbums as Array<RawRow> | undefined) ?? [];
  const albums: TrackAlbum[] = trackAlbumsRaw.map((ta) => {
    const albumRow = (ta.album as RawRow | undefined) ?? ta;
    return normalizeTrackAlbum(albumRow);
  });

  // ── Tags → classified buckets ─────────────────────────────────────────────
  const tagsBuckets: { tags: string[]; moods: string[]; activities: string[]; genres: string[] } = {
    tags: [],
    moods: [],
    activities: [],
    genres: [],
  };
  const trackTagsRaw = (r.trackTags as Array<RawRow> | undefined) ?? [];
  for (const tt of trackTagsRaw) {
    const tagRow = (tt.tag as RawRow | undefined) ?? tt;
    const tagName = nullableStr(tagRow.name);
    if (!tagName) continue;
    const tagType = String(tagRow.type ?? 'tag').toLowerCase();
    const bucket = TAG_TYPE_MAP[tagType] ?? 'tags';
    tagsBuckets[bucket].push(tagName);
  }

  // ── Songwriters (from composer fields on the track) ───────────────────────
  const songwriters: string[] = [];
  const composerField = nullableStr(r.composerName ?? r.composer_name ?? r.composers);
  if (composerField) {
    // Support comma-separated list
    composerField.split(',').forEach((s) => {
      const trimmed = s.trim();
      if (trimmed) songwriters.push(trimmed);
    });
  }
  // Also extract from trackArtists with a composer role
  for (const ta of trackArtistsRaw) {
    const role = String(ta.role ?? '').toLowerCase();
    if (['composer', 'songwriter', 'lyricist', 'writer'].includes(role)) {
      const artistRow = (ta.artist as RawRow | undefined) ?? ta;
      const name = nullableStr(artistRow.name);
      if (name && !songwriters.includes(name)) {
        songwriters.push(name);
      }
    }
  }

  // ── Primary album label ───────────────────────────────────────────────────
  const albumLabel =
    albums.length > 0 ? (albums[0].label ?? null) : nullableStr(r.label);

  // ── Release date: prefer track-level, fall back to primary album ──────────
  const releaseDate =
    toDateStr(r.releaseDate ?? r.release_date) ??
    (albums.length > 0 ? albums[0].releaseDate : null);

  // ── Statistics ────────────────────────────────────────────────────────────
  const statistics = normalizeStatistics(
    r.trackStatisticsLatest ?? r.statistics,
  );

  return {
    id: Number(r.id),
    name: String(r.name ?? r.title ?? ''),
    isrc: nullableStr(r.isrc),
    imageUrl: nullableStr(r.imageUrl ?? r.image_url),
    previewUrl: nullableStr(r.previewUrl ?? r.preview_url),
    durationMs: toNumber(r.durationMs ?? r.duration_ms),
    composerName: nullableStr(r.composerName ?? r.composer_name),
    trackTier: nullableStr(r.trackTier ?? r.track_tier),
    artists,
    albums,
    tags: tagsBuckets.tags,
    moods: tagsBuckets.moods,
    activities: tagsBuckets.activities,
    genres: tagsBuckets.genres,
    songwriters,
    releaseDate,
    albumLabel,
    explicit:
      r.explicit !== null && r.explicit !== undefined
        ? Boolean(r.explicit)
        : null,
    score: toNumber(r.popularity ?? r.score),
    statistics,
  };
}
