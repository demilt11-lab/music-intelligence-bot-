import { fetchWithRetry } from '@/lib/http/retry';
/**
 * Shazam client using the official Shazam API.
 *
 * Required env vars:
 *   SHAZAM_API_KEY     — your Shazam API key
 *   SHAZAM_BASE_URL    — base URL from your Shazam API provider (no trailing slash)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShazamChartTrack {
  shazamId: string;
  title: string;
  artist: string;
  isrc?: string;
  rank: number;
  shazamCount?: number;
}

interface ShazamChartResponse {
  tracks?: ShazamTrackRaw[];
  chart?: ShazamChartItem[];
  data?: {
    chart?: ShazamChartItem[];
    tracks?: ShazamTrackRaw[];
  };
}

interface ShazamChartItem {
  track?: ShazamTrackRaw;
  rank?: number;
}

interface ShazamTrackRaw {
  key?: string;
  title?: string;
  subtitle?: string;
  hub?: { actions?: Array<{ id?: string; type?: string }> };
  isrc?: string;
  numberOfShazams?: number;
}

interface ShazamSearchResponse {
  tracks?: { hits?: Array<{ track?: ShazamTrackRaw }> };
}

interface ShazamDetailsResponse {
  key?: string;
  title?: string;
  subtitle?: string;
  isrc?: string;
  numberOfShazams?: number;
}

// ─── Request helper ───────────────────────────────────────────────────────────

function getCredentials(): { key: string; base: string } {
  const key = process.env.SHAZAM_API_KEY;
  const base = process.env.SHAZAM_BASE_URL;
  if (!key) throw new Error('Missing env var: SHAZAM_API_KEY');
  if (!base) throw new Error('Missing env var: SHAZAM_BASE_URL');
  return { key, base: base.replace(/\/$/, '') };
}

async function shazamGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { key, base } = getCredentials();
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': new URL(base).hostname,
    },
  }, { label: 'shazam' });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shazam API request failed [${path}] (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Normalise raw track ──────────────────────────────────────────────────────

function normaliseTrack(raw: ShazamTrackRaw, rank: number): ShazamChartTrack | null {
  const shazamId = raw.key;
  if (!shazamId) return null;
  return {
    shazamId,
    title: raw.title ?? 'Unknown',
    artist: raw.subtitle ?? 'Unknown',
    isrc: raw.isrc ?? undefined,
    rank,
    shazamCount: raw.numberOfShazams ?? undefined,
  };
}

// ─── Exported API functions ───────────────────────────────────────────────────

export async function getShazamCharts(country?: string, limit = 200): Promise<ShazamChartTrack[]> {
  const params: Record<string, string> = {
    locale: 'en-US',
    pageSize: String(Math.min(limit, 200)),
    startFrom: '0',
  };
  if (country) params.countryCode = country;

  const data = await shazamGet<ShazamChartResponse>('/charts/track', params);

  const rawTracks: ShazamTrackRaw[] =
    data.tracks ??
    data.data?.tracks ??
    (data.chart ?? data.data?.chart ?? [])
      .map((item) => item.track)
      .filter((t): t is ShazamTrackRaw => t != null);

  const results: ShazamChartTrack[] = [];
  for (let i = 0; i < rawTracks.length; i++) {
    const n = normaliseTrack(rawTracks[i], i + 1);
    if (n) results.push(n);
  }
  return results.slice(0, limit);
}

export async function searchShazam(query: string): Promise<ShazamChartTrack[]> {
  const data = await shazamGet<ShazamSearchResponse>('/search', {
    term: query,
    locale: 'en-US',
    offset: '0',
    limit: '5',
  });

  const hits = data.tracks?.hits ?? [];
  const results: ShazamChartTrack[] = [];
  for (let i = 0; i < hits.length; i++) {
    const raw = hits[i].track;
    if (!raw) continue;
    const n = normaliseTrack(raw, i + 1);
    if (n) results.push(n);
  }
  return results;
}

export async function getShazamTrackDetails(shazamId: string): Promise<ShazamChartTrack | null> {
  try {
    const data = await shazamGet<ShazamDetailsResponse>('/songs/get-details', { key: shazamId });
    if (!data.key) return null;
    return {
      shazamId: data.key,
      title: data.title ?? 'Unknown',
      artist: data.subtitle ?? 'Unknown',
      isrc: data.isrc ?? undefined,
      rank: 0,
      shazamCount: data.numberOfShazams ?? undefined,
    };
  } catch {
    return null;
  }
}
