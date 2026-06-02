/**
 * Shazam client using the unofficial RapidAPI Shazam endpoint.
 *
 * Required env var: RAPIDAPI_KEY
 *
 * Endpoints used:
 *   GET https://shazam.p.rapidapi.com/charts/track
 *   GET https://shazam.p.rapidapi.com/search
 *   GET https://shazam.p.rapidapi.com/songs/get-details
 */

const SHAZAM_HOST = 'shazam.p.rapidapi.com';
const SHAZAM_BASE = 'https://shazam.p.rapidapi.com';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShazamChartTrack {
  shazamId: string;
  title: string;
  artist: string;
  isrc?: string;
  rank: number;
  shazamCount?: number;
}

// Raw API shapes — kept minimal; only what we actually consume
interface ShazamChartResponse {
  tracks?: ShazamTrackRaw[];
  chart?: ShazamChartItem[];
  // Some endpoint variants nest under "data" or "tracks"
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
  subtitle?: string; // artist name
  hub?: {
    actions?: Array<{ id?: string; type?: string }>;
  };
  isrc?: string;
  // Shazam count appears in track details responses
  numberOfShazams?: number;
}

interface ShazamSearchResponse {
  tracks?: {
    hits?: Array<{
      track?: ShazamTrackRaw;
    }>;
  };
}

interface ShazamDetailsResponse {
  key?: string;
  title?: string;
  subtitle?: string;
  isrc?: string;
  numberOfShazams?: number;
}

// ─── Request helper ───────────────────────────────────────────────────────────

function getRapidApiKey(): string {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('Missing env var: RAPIDAPI_KEY');
  return key;
}

async function shazamGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getRapidApiKey();
  const url = new URL(`${SHAZAM_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': SHAZAM_HOST,
    },
  });

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

/**
 * Fetch the Shazam Top 200 chart for a given country.
 *
 * @param country  ISO 3166-1 alpha-2 country code (e.g. 'US', 'GB').
 *                 Omit for global chart.
 * @param limit    Maximum number of tracks to return (default 200, max 200).
 */
export async function getShazamCharts(
  country?: string,
  limit = 200,
): Promise<ShazamChartTrack[]> {
  const params: Record<string, string> = {
    locale: 'en-US',
    pageSize: String(Math.min(limit, 200)),
    startFrom: '0',
  };
  if (country) {
    params.countryCode = country;
  }

  const data = await shazamGet<ShazamChartResponse>('/charts/track', params);

  // The endpoint nests its results differently depending on the response version
  const rawTracks: ShazamTrackRaw[] =
    data.tracks ??
    data.data?.tracks ??
    (data.chart ?? data.data?.chart ?? [])
      .map((item) => item.track)
      .filter((t): t is ShazamTrackRaw => t != null) ??
    [];

  const results: ShazamChartTrack[] = [];
  for (let i = 0; i < rawTracks.length; i++) {
    const normalised = normaliseTrack(rawTracks[i], i + 1);
    if (normalised) results.push(normalised);
  }

  return results.slice(0, limit);
}

/**
 * Search Shazam for a query string and return up to 5 matching tracks.
 *
 * @param query  Track title + artist, e.g. "Levitating Dua Lipa"
 */
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
    const normalised = normaliseTrack(raw, i + 1);
    if (normalised) results.push(normalised);
  }

  return results;
}

/**
 * Fetch full details for a Shazam track by its key/ID.
 * Useful for retrieving ISRC and shazamCount when not present in chart responses.
 *
 * @param shazamId  The track key returned by getShazamCharts / searchShazam.
 */
export async function getShazamTrackDetails(
  shazamId: string,
): Promise<ShazamChartTrack | null> {
  try {
    const data = await shazamGet<ShazamDetailsResponse>('/songs/get-details', {
      key: shazamId,
    });

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
