// lib/integrations/soundcharts/ingest-mapping.ts
//
// Pure mapping/normalization helpers for the Soundcharts ingest job
// (jobs/ingest/soundcharts.ts). Kept free of DB and network access so the
// unit tests exercise the real production logic.

// ─── Platform mapping ─────────────────────────────────────────────────────────

/**
 * Soundcharts platform code → our canonical platform string (as used by the
 * playlist/curator directories in lib/playlists and lib/curators).
 */
export const SOUNDCHARTS_TO_CANONICAL_PLATFORM: Record<string, string> = {
  'apple-music': 'applemusic',
  applemusic: 'applemusic',
  amazon: 'amazon',
  deezer: 'deezer',
  spotify: 'spotify',
  youtube: 'youtube',
};

/** The DSPs this ingest pulls playlist data for (Soundcharts platform codes). */
export const PLAYLIST_PLATFORMS: string[] = ['apple-music', 'amazon'];

export function toCanonicalPlatform(soundchartsPlatform: string): string | null {
  return SOUNDCHARTS_TO_CANONICAL_PLATFORM[soundchartsPlatform.toLowerCase()] ?? null;
}

// ─── Envelope unwrapping ──────────────────────────────────────────────────────

/**
 * Soundcharts responses wrap payloads inconsistently across endpoints:
 * `{ obj: {...} }` for single objects, `{ items: [...] }` for collections,
 * and occasionally a bare array. Returns the first array found, else [].
 */
export function unwrapItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    for (const key of ['items', 'obj', 'data']) {
      const v = p[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

/** Returns the single-object payload (`obj` envelope or the payload itself). */
export function unwrapObject(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const obj = p.obj;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return obj as Record<string, unknown>;
  }
  return p;
}

/** Extracts the Soundcharts UUID from a resolver response object. */
export function extractUuid(payload: unknown): string | null {
  const obj = unwrapObject(payload);
  if (!obj) return null;
  const uuid = obj.uuid ?? (obj.song as Record<string, unknown> | undefined)?.uuid
    ?? (obj.artist as Record<string, unknown> | undefined)?.uuid;
  return typeof uuid === 'string' && uuid.length > 0 ? uuid : null;
}

// ─── Playlist entries ─────────────────────────────────────────────────────────

export interface NormalizedPlaylistEntry {
  /** Soundcharts playlist UUID — stored as Playlist.externalId. */
  playlistUuid: string;
  name: string;
  curatorName: string | null;
  countryCode: string | null;
  playlistType: string | null;
  subscriberCount: bigint | null;
  trackCount: number | null;
  position: number | null;
  entryDate: string | null; // YYYY-MM-DD
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function big(v: unknown): bigint | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return BigInt(Math.round(v));
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

function dateOnly(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Normalizes one row of GET /song/{uuid}/playlist/current/{platform}.
 * Rows nest the playlist under `playlist`; position/entryDate live at the
 * row level. Returns null when there is no usable playlist identity.
 */
export function normalizePlaylistEntry(raw: unknown): NormalizedPlaylistEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const playlist = (row.playlist && typeof row.playlist === 'object'
    ? row.playlist
    : row) as Record<string, unknown>;

  const playlistUuid = str(playlist.uuid) ?? str(playlist.identifier);
  const name = str(playlist.name);
  if (!playlistUuid || !name) return null;

  const curator = (playlist.curator && typeof playlist.curator === 'object'
    ? (playlist.curator as Record<string, unknown>)
    : null);

  return {
    playlistUuid,
    name,
    curatorName: curator ? str(curator.name) : str(playlist.curatorName),
    countryCode: str(playlist.countryCode) ?? str(row.countryCode),
    playlistType: str(playlist.type) ?? str(row.type),
    subscriberCount: big(playlist.latestSubscriberCount ?? playlist.subscriberCount),
    trackCount: num(playlist.trackCount),
    position: num(row.position),
    entryDate: dateOnly(row.entryDate) ?? dateOnly(row.positionDate),
  };
}

// ─── Membership diffing ───────────────────────────────────────────────────────

export interface MembershipDiff {
  adds: number[];
  removes: number[];
}

/**
 * Given the playlist IDs a track was previously on and the ones it is on
 * now (per platform), returns which memberships were added and removed.
 * Mirrors the diff semantics of jobs/ingest/spotify.ts (playlist-major)
 * from the track-major direction Soundcharts provides.
 */
export function diffTrackPlaylistMembership(
  previousPlaylistIds: Iterable<number>,
  currentPlaylistIds: Iterable<number>,
): MembershipDiff {
  const prev = new Set(previousPlaylistIds);
  const curr = new Set(currentPlaylistIds);
  return {
    adds: [...curr].filter((id) => !prev.has(id)),
    removes: [...prev].filter((id) => !curr.has(id)),
  };
}

// ─── Listener time series ─────────────────────────────────────────────────────

export interface ListenerPoint {
  date: string; // YYYY-MM-DD
  value: bigint;
}

/**
 * Normalizes one point of an audience/streaming time series. Soundcharts
 * emits `{ date, value }` (audience) or `{ date, plots: [{ value }] }`
 * (streaming) depending on the endpoint.
 */
export function normalizeListenerPoint(raw: unknown): ListenerPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const date = dateOnly(row.date);
  if (!date) return null;

  let value = big(row.value);
  if (value === null && Array.isArray(row.plots) && row.plots.length > 0) {
    const first = row.plots[0] as Record<string, unknown>;
    value = big(first?.value);
  }
  if (value === null) return null;

  return { date, value };
}

/** Latest point by date, or null for an empty series. */
export function latestListenerPoint(points: ListenerPoint[]): ListenerPoint | null {
  if (points.length === 0) return null;
  return points.reduce((a, b) => (b.date > a.date ? b : a));
}
