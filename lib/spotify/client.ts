// lib/spotify/client.ts

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// ─── Credential helpers ───────────────────────────────────────────────────────

function getClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error('SPOTIFY_CLIENT_ID is not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error('SPOTIFY_CLIENT_SECRET is not set');
  return secret;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number; // unix ms
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 5_000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new SpotifyError(`Spotify token request failed ${res.status}`, res.status, body);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class SpotifyError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
    this.body = body;
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function spotifyGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const body = await parseBody(res);

  if (!res.ok) {
    if (res.status === 429) {
      throw new SpotifyError('Spotify rate limit hit (429)', res.status, body);
    }
    throw new SpotifyError(`Spotify error ${res.status}: ${path}`, res.status, body);
  }

  return body as T;
}

// ─── Spotify API types ────────────────────────────────────────────────────────

export interface SpotifyAudioFeatures {
  id: string;
  danceability: number;
  energy: number;
  loudness: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number;
  time_signature: number;
  key: number;
  mode: number;
  duration_ms: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  popularity: number;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  external_ids: { isrc?: string };
  album: {
    id: string;
    name: string;
    release_date: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  artists: Array<{ id: string; name: string }>;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  popularity: number;
  followers: { total: number };
  images: Array<{ url: string; width: number; height: number }>;
  genres: string[];
}

export interface SpotifyPlaylistItem {
  added_at: string;
  track: SpotifyTrack | null;
}

export interface SpotifyPagingObject<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  followers: { total: number };
  images: Array<{ url: string; width: number; height: number }>;
  tracks: SpotifyPagingObject<SpotifyPlaylistItem>;
  owner: { id: string; display_name: string };
}

export interface SpotifySearchResult {
  tracks: SpotifyPagingObject<SpotifyTrack>;
}

// ─── Public API functions ─────────────────────────────────────────────────────

/** Fetch audio features for a single track by Spotify ID */
export async function getTrackAudioFeatures(spotifyId: string): Promise<SpotifyAudioFeatures> {
  return spotifyGet<SpotifyAudioFeatures>(`/audio-features/${spotifyId}`);
}

/** Fetch track details (name, popularity, ISRC, etc.) */
export async function getTrackDetails(spotifyId: string): Promise<SpotifyTrack> {
  return spotifyGet<SpotifyTrack>(`/tracks/${spotifyId}`);
}

/** Fetch all tracks in a playlist, auto-paginating */
export async function getPlaylistTracks(playlistId: string): Promise<SpotifyPlaylistItem[]> {
  const items: SpotifyPlaylistItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await spotifyGet<SpotifyPagingObject<SpotifyPlaylistItem>>(
      `/playlists/${playlistId}/tracks`,
      { limit, offset, fields: 'items(added_at,track(id,name,popularity,duration_ms,explicit,preview_url,external_ids,album,artists)),total,next' },
    );
    items.push(...page.items);
    if (!page.next) break;
    offset += limit;
    await delay(100);
  }

  return items;
}

/** Fetch artist details by Spotify artist ID */
export async function getArtistDetails(spotifyId: string): Promise<SpotifyArtist> {
  return spotifyGet<SpotifyArtist>(`/artists/${spotifyId}`);
}

/** Search Spotify for tracks matching a query string */
export async function searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
  const result = await spotifyGet<SpotifySearchResult>('/search', {
    q: query,
    type: 'track',
    limit,
  });
  return result.tracks.items;
}

// Top 50 chart playlist IDs per market
const TOP_CHART_PLAYLISTS: Record<string, string> = {
  global: '37i9dQZEVXbMDoHDwVN2tF',
  US: '37i9dQZEVXbLRQDuF5jeBp',
  GB: '37i9dQZEVXbLnolsZ8PSNw',
  AU: '37i9dQZEVXbJPcfkRz0wJ0',
  CA: '37i9dQZEVXbKj23U1GF4IR',
  BR: '37i9dQZEVXbMXbN3EUUhlg',
  DE: '37i9dQZEVXbJiZcmkrIHGU',
  FR: '37i9dQZEVXbIPWwFssbupI',
  MX: '37i9dQZEVXbO3qyFxbkOE1',
};

/** Fetch Spotify Top 50 chart for a given market (defaults to global) */
export async function getTopCharts(market = 'global'): Promise<{
  playlistId: string;
  market: string;
  items: SpotifyPlaylistItem[];
}> {
  const playlistId = TOP_CHART_PLAYLISTS[market];
  if (!playlistId) {
    throw new Error(`No top chart playlist configured for market: ${market}`);
  }
  const items = await getPlaylistTracks(playlistId);
  return { playlistId, market, items };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  release_date: string;
  total_tracks: number;
  images: Array<{ url: string; width: number; height: number }>;
}

/** New releases — works with client credentials, no special scopes needed */
export async function getNewReleases(country = 'US', limit = 50): Promise<SpotifyAlbum[]> {
  const result = await spotifyGet<{ albums: { items: SpotifyAlbum[] } }>('/browse/new-releases', {
    country,
    limit,
  });
  return result.albums.items;
}

/** Popular tracks via search — works reliably with client credentials */
export async function getPopularTracks(_market: string, limit = 50): Promise<SpotifyTrack[]> {
  const year = new Date().getFullYear();
  const queries = [
    `genre:pop year:${year}`,
    `genre:hip-hop year:${year}`,
    `genre:r-n-b year:${year}`,
    `genre:latin year:${year}`,
    `genre:dance year:${year}`,
  ];

  const tracks: SpotifyTrack[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (tracks.length >= limit) break;
    try {
      const results = await searchTracks(q, 20);
      for (const t of results) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          tracks.push(t);
        }
      }
      await delay(120);
    } catch {
      // skip failed query
    }
  }

  tracks.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return tracks.slice(0, limit);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
