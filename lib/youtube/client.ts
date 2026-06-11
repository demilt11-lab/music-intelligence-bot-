import { fetchWithRetry } from '@/lib/http/retry';
/**
 * YouTube Data API v3 client
 * Uses API key auth — public data only, no OAuth needed.
 */

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Missing required env var: YOUTUBE_API_KEY');
  return key;
}

/** Generic GET helper — appends the API key automatically. */
export async function youtubeGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetchWithRetry(url.toString(), {}, { label: 'youtube' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status} for ${endpoint}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Response shape types ────────────────────────────────────────────────────

export interface YtSnippet {
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnails: Record<string, { url: string; width: number; height: number }>;
}

export interface YtStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  favoriteCount?: string;
}

export interface YtVideo {
  kind: string;
  etag: string;
  id: string;
  snippet?: YtSnippet;
  statistics?: YtStatistics;
}

export interface YtSearchItem {
  kind: string;
  etag: string;
  id: { kind: string; videoId: string };
  snippet?: YtSnippet;
}

export interface YtPagedResponse<T> {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
  items: T[];
}

export interface YtPlaylistItem {
  kind: string;
  etag: string;
  id: string;
  snippet?: {
    publishedAt: string;
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    resourceId: { kind: string; videoId: string };
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Search for music videos (videoCategoryId=10).
 * Cost: 100 quota units per call — use sparingly.
 */
export async function searchMusicVideos(
  query: string,
  maxResults = 25,
): Promise<YtPagedResponse<YtSearchItem>> {
  return youtubeGet<YtPagedResponse<YtSearchItem>>('search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    q: query,
    maxResults,
  });
}

/**
 * Batch-fetch video statistics + snippet for up to 50 video IDs.
 * Cost: 1 quota unit per call.
 */
export async function getVideoStats(
  videoIds: string[],
): Promise<YtPagedResponse<YtVideo>> {
  if (videoIds.length === 0) return { kind: '', etag: '', pageInfo: { totalResults: 0, resultsPerPage: 0 }, items: [] };
  const ids = videoIds.slice(0, 50).join(',');
  return youtubeGet<YtPagedResponse<YtVideo>>('videos', {
    part: 'statistics,snippet',
    id: ids,
  });
}

/**
 * Fetch the most popular music videos chart for a region.
 * Cost: 1 quota unit per call.
 */
export async function getTrendingMusicVideos(
  regionCode = 'US',
  maxResults = 50,
): Promise<YtPagedResponse<YtVideo>> {
  return youtubeGet<YtPagedResponse<YtVideo>>('videos', {
    part: 'statistics,snippet',
    chart: 'mostPopular',
    videoCategoryId: '10',
    regionCode,
    maxResults,
  });
}

/**
 * Approximate "YouTube Shorts trending music" by searching for short-duration
 * music videos. YouTube has no dedicated Shorts chart endpoint.
 * Cost: 100 quota units per call — limit usage.
 */
export async function getYouTubeShortsCharts(
  regionCode = 'US',
  maxResults = 25,
): Promise<YtPagedResponse<YtSearchItem>> {
  return youtubeGet<YtPagedResponse<YtSearchItem>>('search', {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoDuration: 'short',
    regionCode,
    order: 'viewCount',
    maxResults,
  });
}

/**
 * Fetch all videos from a playlist (up to 50).
 * Cost: 1 quota unit per call.
 */
export async function getPlaylistVideos(
  playlistId: string,
): Promise<YtPagedResponse<YtPlaylistItem>> {
  return youtubeGet<YtPagedResponse<YtPlaylistItem>>('playlistItems', {
    part: 'snippet',
    playlistId,
    maxResults: 50,
  });
}
