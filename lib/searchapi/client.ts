// lib/searchapi/client.ts
import { fetchWithRetry } from '@/lib/http/retry';
// SearchAPI.io client for Google Search, YouTube Search, and Google Trends

const SEARCHAPI_BASE = 'https://www.searchapi.io/api/v1';

function getApiKey(): string {
  const key = process.env.SEARCHAPI_KEY;
  if (!key) throw new Error('Missing required env var: SEARCHAPI_KEY');
  return key;
}

async function searchApiGet<T>(
  engine: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(`${SEARCHAPI_BASE}/search`);
  url.searchParams.set('engine', engine);
  url.searchParams.set('api_key', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetchWithRetry(url.toString(), {}, { label: 'searchapi' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SearchAPI error (${res.status}) for engine=${engine}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ─── Google Search ─────────────────────────────────────────────────────────────

export interface GoogleSearchResult {
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet?: string;
    date?: string;
  }>;
  knowledge_graph?: {
    title?: string;
    description?: string;
  };
}

export async function googleSearch(query: string, num = 10): Promise<GoogleSearchResult> {
  return searchApiGet<GoogleSearchResult>('google', { q: query, num });
}

// ─── YouTube Search ────────────────────────────────────────────────────────────

export interface YouTubeSearchResult {
  video_results?: Array<{
    title: string;
    link: string;
    video_id: string;
    published_date?: string;
    views?: string;
    channel?: { name: string };
  }>;
}

export async function youtubeSearch(query: string, num = 10): Promise<YouTubeSearchResult> {
  return searchApiGet<YouTubeSearchResult>('youtube', { q: query, num });
}

// ─── Google Trends ─────────────────────────────────────────────────────────────

export interface TrendsResult {
  interest_over_time?: {
    timeline_data?: Array<{
      date: string;
      values: Array<{ query: string; value: number; extracted_value: number }>;
    }>;
  };
  related_queries?: {
    rising?: Array<{ query: string; value: string }>;
    top?: Array<{ query: string; value: string }>;
  };
}

export async function googleTrends(
  query: string,
  geo = '',
  timeRange = 'now 7-d',
): Promise<TrendsResult> {
  return searchApiGet<TrendsResult>('google_trends', {
    q: query,
    geo,
    date: timeRange,
    data_type: 'TIMESERIES',
  });
}

export async function googleTrendsRising(
  category = '35',
  geo = '',
): Promise<TrendsResult> {
  return searchApiGet<TrendsResult>('google_trends', {
    geo,
    cat: category,
    data_type: 'RELATED_QUERIES',
  });
}
