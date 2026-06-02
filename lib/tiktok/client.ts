/**
 * TikTok Research API client + RapidAPI fallback for sound search.
 *
 * Credentials are read from process.env:
 *   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET  — Research API OAuth2
 *   RAPIDAPI_KEY                              — RapidAPI TikTok Scraper fallback
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TiktokTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface TiktokVideoQueryParams {
  query: {
    and?: TiktokCondition[];
    or?: TiktokCondition[];
    not?: TiktokCondition[];
  };
  start_date: string; // YYYYMMDD
  end_date: string;
  max_count?: number;
  cursor?: number;
  search_id?: string;
  fields?: string[];
}

export interface TiktokCondition {
  field_name: string;
  field_values: string[];
  operation: 'EQ' | 'IN' | 'GT' | 'GTE' | 'LT' | 'LTE';
}

export interface TiktokVideo {
  id: string;
  create_time: number;
  username: string;
  region_code: string;
  video_description: string;
  music_id: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  hashtag_names: string[];
  music?: TiktokMusic;
}

export interface TiktokMusic {
  id: string;
  title: string;
  author_name: string;
  duration: number;
  cover_large: string;
  play_url: string;
}

export interface TiktokVideoQueryResponse {
  data: {
    videos: TiktokVideo[];
    cursor: number;
    has_more: boolean;
    search_id: string;
  };
  error: {
    code: string;
    message: string;
    log_id: string;
  };
}

export interface TiktokUserInfoParams {
  username: string;
  fields?: string[];
}

export interface TiktokUserInfo {
  display_name: string;
  bio_description: string;
  avatar_url: string;
  is_verified: boolean;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
}

export interface TiktokUserInfoResponse {
  data: TiktokUserInfo;
  error: {
    code: string;
    message: string;
    log_id: string;
  };
}

export interface RapidApiMusicSearchResult {
  music_info: {
    id: string;
    title: string;
    author: string;
    cover: string;
    play_url: string;
    duration: number;
  };
  music_videos: {
    video_id: string;
    cover: string;
    play_count: number;
  }[];
}

export interface RapidApiMusicSearchResponse {
  code: number;
  msg: string;
  processed_time: number;
  data: {
    music_list: RapidApiMusicSearchResult[];
    cursor: number;
    has_more: boolean;
  };
}

// ─── Token cache ─────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey) throw new Error('Missing env var: TIKTOK_CLIENT_KEY');
  if (!clientSecret) throw new Error('Missing env var: TIKTOK_CLIENT_SECRET');

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok OAuth2 token request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as TiktokTokenResponse;
  cachedToken = json.access_token;
  tokenExpiresAt = now + json.expires_in * 1_000;
  return cachedToken;
}

// ─── Core request helper ─────────────────────────────────────────────────────

const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tiktokPost<T>(path: string, body: unknown): Promise<T> {
  await sleep(DELAY_MS);
  const token = await getAccessToken();

  const url = path.startsWith('http') ? path : `https://open.tiktokapis.com${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok API request failed [${path}] (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Exported API functions ───────────────────────────────────────────────────

const DEFAULT_VIDEO_FIELDS = [
  'id',
  'create_time',
  'username',
  'region_code',
  'video_description',
  'music_id',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
  'hashtag_names',
  'music',
];

/**
 * Search for videos via the TikTok Research API.
 * POST /v2/research/video/query/
 */
export async function queryVideos(
  params: TiktokVideoQueryParams,
): Promise<TiktokVideoQueryResponse> {
  const fields = params.fields ?? DEFAULT_VIDEO_FIELDS;
  const url = `/v2/research/video/query/?fields=${fields.join(',')}`;
  return tiktokPost<TiktokVideoQueryResponse>(url, {
    query: params.query,
    start_date: params.start_date,
    end_date: params.end_date,
    max_count: params.max_count ?? 100,
    cursor: params.cursor ?? 0,
    ...(params.search_id ? { search_id: params.search_id } : {}),
  });
}

/**
 * Fetch details for specific video IDs.
 * POST /v2/research/video/query/ with id IN filter
 */
export async function getVideoDetails(videoIds: string[]): Promise<TiktokVideoQueryResponse> {
  if (videoIds.length === 0) {
    return {
      data: { videos: [], cursor: 0, has_more: false, search_id: '' },
      error: { code: 'ok', message: '', log_id: '' },
    };
  }

  const today = new Date();
  const end = formatDate(today);
  const start = formatDate(new Date(today.getTime() - 30 * 86_400_000));

  return queryVideos({
    query: {
      and: [
        {
          field_name: 'id',
          field_values: videoIds,
          operation: 'IN',
        },
      ],
    },
    start_date: start,
    end_date: end,
    max_count: videoIds.length,
  });
}

/**
 * Fetch TikTok user (creator) info.
 * POST /v2/research/user/info/
 */
export async function queryCreators(params: TiktokUserInfoParams): Promise<TiktokUserInfoResponse> {
  const fields = params.fields ?? [
    'display_name',
    'bio_description',
    'avatar_url',
    'is_verified',
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
  ];
  const url = `/v2/research/user/info/?fields=${fields.join(',')}`;
  return tiktokPost<TiktokUserInfoResponse>(url, { username: params.username });
}

/**
 * Search sounds/music via RapidAPI TikTok Scraper fallback.
 * GET https://tiktok-scraper7.p.rapidapi.com/music/search
 */
export async function searchSounds(keyword: string): Promise<RapidApiMusicSearchResponse> {
  await sleep(DELAY_MS);

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error('Missing env var: RAPIDAPI_KEY');

  const url = new URL('https://tiktok-scraper7.p.rapidapi.com/music/search');
  url.searchParams.set('keywords', keyword);
  url.searchParams.set('count', '20');
  url.searchParams.set('cursor', '0');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RapidAPI TikTok sound search failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<RapidApiMusicSearchResponse>;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
