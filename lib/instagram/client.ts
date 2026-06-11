import { fetchWithRetry } from '@/lib/http/retry';
/**
 * Meta Graph API client for Instagram Reels music ingestion.
 *
 * Credentials are read from process.env:
 *   META_APP_ID       — Meta app ID
 *   META_APP_SECRET   — Meta app secret
 *   IG_USER_ID        — Instagram business/creator account ID (required for hashtag search)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
}

export interface IgHashtagSearchResponse {
  data: Array<{ id: string }>;
}

export interface IgMediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
  plays?: number;
  timestamp?: string;
  caption?: string;
  media_type?: string;
}

export interface IgHashtagMediaResponse {
  data: IgMediaItem[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}

export type IgMediaDetailsResponse = IgMediaItem;

// ─── Token cache ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
// App tokens do not expire in the traditional sense (they are long-lived),
// but we cache for the process lifetime. Set expiry to 24 h to be safe.
let tokenExpiresAt = 0;

const BASE_URL = 'https://graph.facebook.com/v19.0';
const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAppAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId) throw new Error('Missing env var: META_APP_ID');
  if (!appSecret) throw new Error('Missing env var: META_APP_SECRET');

  const url = new URL('https://graph.facebook.com/oauth/access_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetchWithRetry(url.toString(), {}, { label: 'instagram' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta OAuth2 token request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as MetaTokenResponse;
  cachedToken = json.access_token;
  tokenExpiresAt = now + 24 * 60 * 60 * 1_000; // 24 h
  return cachedToken;
}

// ─── Core GET helper ──────────────────────────────────────────────────────────

export async function metaGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  await sleep(DELAY_MS);

  const token = await getAppAccessToken();
  const url = new URL(`${BASE_URL}${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('access_token', token);

  const res = await fetchWithRetry(url.toString(), {}, { label: 'instagram' });

  if (res.status === 429) {
    console.warn('[instagram] Rate limit hit — waiting 60 s before retry');
    await sleep(60_000);
    return metaGet<T>(path, params);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta Graph API request failed [${path}] (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Exported API functions ───────────────────────────────────────────────────

/**
 * Search for an Instagram hashtag object ID.
 * GET /ig_hashtag_search?user_id={IG_USER_ID}&q={hashtag}
 *
 * IG_USER_ID must be an Instagram Business or Creator account ID linked
 * to the Meta app. The `q` parameter should NOT include the # symbol.
 */
export async function searchHashtagId(hashtag: string): Promise<string | null> {
  const userId = process.env.IG_USER_ID;
  if (!userId) throw new Error('Missing env var: IG_USER_ID');

  try {
    const resp = await metaGet<IgHashtagSearchResponse>('/ig_hashtag_search', {
      user_id: userId,
      q: hashtag,
    });
    return resp.data?.[0]?.id ?? null;
  } catch (err) {
    console.error(`[instagram] searchHashtagId(${hashtag}) failed:`, err);
    return null;
  }
}

/**
 * Fetch top media for a hashtag.
 * GET /{hashtagId}/top_media
 */
export async function getHashtagTopMedia(
  hashtagId: string,
  fields = 'id,like_count,comments_count,media_type,timestamp,caption',
): Promise<IgMediaItem[]> {
  const userId = process.env.IG_USER_ID;
  if (!userId) throw new Error('Missing env var: IG_USER_ID');

  const resp = await metaGet<IgHashtagMediaResponse>(`/${hashtagId}/top_media`, {
    user_id: userId,
    fields,
  });
  return resp.data ?? [];
}

/**
 * Fetch recent media for a hashtag.
 * GET /{hashtagId}/recent_media
 */
export async function getHashtagRecentMedia(
  hashtagId: string,
  fields = 'id,like_count,comments_count,media_type,timestamp,caption',
): Promise<IgMediaItem[]> {
  const userId = process.env.IG_USER_ID;
  if (!userId) throw new Error('Missing env var: IG_USER_ID');

  const resp = await metaGet<IgHashtagMediaResponse>(`/${hashtagId}/recent_media`, {
    user_id: userId,
    fields,
  });
  return resp.data ?? [];
}

/**
 * Fetch details for a single media object.
 * GET /{mediaId}?fields=id,like_count,comments_count,plays,timestamp,caption,media_type
 */
export async function getMediaDetails(
  mediaId: string,
  fields = 'id,like_count,comments_count,plays,timestamp,caption,media_type',
): Promise<IgMediaDetailsResponse> {
  return metaGet<IgMediaDetailsResponse>(`/${mediaId}`, { fields });
}
