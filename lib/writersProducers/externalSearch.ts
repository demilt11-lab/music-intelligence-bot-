// lib/writersProducers/externalSearch.ts
//
// Searches for rising writers and producers across external platforms:
// Spotify, YouTube, SoundCloud (via RapidAPI), and music blogs (via Firecrawl).
import { fetchWithRetry } from '@/lib/http/retry';
import { ExternalCreatorHit } from './types';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function rapidApiKey(): string | null {
  return process.env.RAPIDAPI_KEY ?? null;
}

function firecrawlKey(): string | null {
  return process.env.FIRECRAWL_API_KEY ?? null;
}

// ─── Spotify search ───────────────────────────────────────────────────────────
// Searches Spotify playlist names to find writer / producer playlists,
// then extracts artist/track metadata from those playlists.

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchWithRetry(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    },
    { label: 'spotify' },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function spotifySearchWriterProducerPlaylists(
  q: string,
  token: string,
): Promise<ExternalCreatorHit[]> {
  const query = encodeURIComponent(`${q} songwriter writer producer`);
  const url = `https://api.spotify.com/v1/search?q=${query}&type=playlist&limit=10`;
  const res = await fetchWithRetry(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: 'spotify' },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    playlists: {
      items: Array<{
        id: string;
        name: string;
        owner: { display_name: string | null };
        images: Array<{ url: string }>;
        tracks: { total: number };
        external_urls: { spotify: string };
      }>;
    };
  };

  return (data.playlists?.items ?? []).map((pl) => ({
    name: pl.owner.display_name ?? pl.name,
    platform: 'spotify' as const,
    externalId: pl.id,
    profileUrl: pl.external_urls?.spotify ?? null,
    imageUrl: pl.images?.[0]?.url ?? null,
    bio: pl.name,
    followerCount: null,
    topTracks: [],
    playlists: [
      {
        name: pl.name,
        url: pl.external_urls?.spotify ?? null,
        trackCount: pl.tracks?.total ?? null,
      },
    ],
    estimatedRisingScore: null,
  }));
}

// ─── YouTube search ───────────────────────────────────────────────────────────

async function youtubeSearchWriterProducerPlaylists(
  q: string,
): Promise<ExternalCreatorHit[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const query = encodeURIComponent(`${q} songwriter producer playlist rising`);
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=playlist&maxResults=10&key=${apiKey}`;

  const res = await fetchWithRetry(url, {}, { label: 'youtube' });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items: Array<{
      id: { playlistId: string };
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails: { medium?: { url: string } };
        channelId: string;
        description: string;
      };
    }>;
  };

  return (data.items ?? []).map((item) => ({
    name: item.snippet.channelTitle,
    platform: 'youtube' as const,
    externalId: item.id.playlistId,
    profileUrl: `https://www.youtube.com/playlist?list=${item.id.playlistId}`,
    imageUrl: item.snippet.thumbnails?.medium?.url ?? null,
    bio: item.snippet.description || null,
    followerCount: null,
    topTracks: [],
    playlists: [
      {
        name: item.snippet.title,
        url: `https://www.youtube.com/playlist?list=${item.id.playlistId}`,
        trackCount: null,
      },
    ],
    estimatedRisingScore: null,
  }));
}

// ─── SoundCloud search via RapidAPI ──────────────────────────────────────────

async function soundcloudSearchWritersProducers(
  q: string,
): Promise<ExternalCreatorHit[]> {
  const key = rapidApiKey();
  if (!key) return [];

  const query = encodeURIComponent(`${q} songwriter producer`);
  const url = `https://soundcloud-scraper.p.rapidapi.com/v1/search?query=${query}&type=users`;

  const res = await fetchWithRetry(
    url,
    {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'soundcloud-scraper.p.rapidapi.com',
      },
    },
    { label: 'soundcloud' },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      name: string;
      username: string;
      profileUrl: string;
      thumbnail: string;
      followersCount: number;
      description: string;
    }>;
  };

  return (data.items ?? []).slice(0, 10).map((u) => ({
    name: u.name || u.username,
    platform: 'soundcloud' as const,
    externalId: u.id,
    profileUrl: u.profileUrl ?? null,
    imageUrl: u.thumbnail ?? null,
    bio: u.description ?? null,
    followerCount: u.followersCount ?? null,
    topTracks: [],
    playlists: [],
    estimatedRisingScore: null,
  }));
}

// ─── Blog article search via Firecrawl ───────────────────────────────────────
// Uses Firecrawl's search to find music blog articles about rising writers/producers.

interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
}

async function blogSearchWritersProducers(
  q: string,
): Promise<ExternalCreatorHit[]> {
  const key = firecrawlKey();
  if (!key) return [];

  const query = `rising ${q} songwriter producer unsigned music 2024 2025`;
  const res = await fetchWithRetry(
    'https://api.firecrawl.dev/v1/search',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit: 5 }),
    },
    { label: 'firecrawl' },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as { data?: FirecrawlSearchResult[] };

  return (data.data ?? []).map((article) => ({
    name: extractNameFromArticle(article.title, q),
    platform: 'blog' as const,
    externalId: article.url,
    profileUrl: article.url,
    imageUrl: null,
    bio: article.description ?? null,
    followerCount: null,
    topTracks: [],
    playlists: [],
    estimatedRisingScore: scoreArticleRelevance(article),
  }));
}

function extractNameFromArticle(title: string, query: string): string {
  // Heuristic: strip common prefixes like "Meet ...", "Rising star ..."
  const cleaned = title
    .replace(/^(meet|watch|rising star|new artist|producer spotlight)[:\s]+/i, '')
    .split(/[|–—:]/)[0]
    .trim();
  return cleaned || query;
}

function scoreArticleRelevance(article: FirecrawlSearchResult): number {
  const text = `${article.title} ${article.description}`.toLowerCase();
  let score = 0;
  if (text.includes('unsigned')) score += 0.3;
  if (text.includes('rising')) score += 0.2;
  if (text.includes('breakout')) score += 0.2;
  if (text.includes('2025') || text.includes('2026')) score += 0.15;
  if (text.includes('producer') || text.includes('songwriter')) score += 0.15;
  return Math.min(1, score);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function searchExternalPlatforms(
  q: string,
  platforms: ('spotify' | 'youtube' | 'soundcloud' | 'blog')[],
): Promise<ExternalCreatorHit[]> {
  const tasks: Promise<ExternalCreatorHit[]>[] = [];

  if (platforms.includes('spotify')) {
    tasks.push(
      getSpotifyToken().then((token) =>
        token ? spotifySearchWriterProducerPlaylists(q, token) : [],
      ),
    );
  }

  if (platforms.includes('youtube')) {
    tasks.push(youtubeSearchWriterProducerPlaylists(q));
  }

  if (platforms.includes('soundcloud')) {
    tasks.push(soundcloudSearchWritersProducers(q));
  }

  if (platforms.includes('blog')) {
    tasks.push(blogSearchWritersProducers(q));
  }

  const results = await Promise.allSettled(tasks);

  const hits: ExternalCreatorHit[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') hits.push(...r.value);
  }

  // Deduplicate by lowercased name
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = h.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
