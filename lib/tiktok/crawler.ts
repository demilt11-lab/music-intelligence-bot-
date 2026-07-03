// lib/tiktok/crawler.ts
//
// TikTok trending-music data via the self-hosted crawl4ai service
// (services/crawler-api) — replaces the TikTok Research API (which requires
// an approved research application) and the RapidAPI sound-search fallback
// (paid subscription) for jobs/ingest/tiktok.ts.
//
// Source: TikTok Creative Center's public trending-music charts
// (ads.tiktok.com/business/creativecenter). Two extraction tiers:
//
//   1. In-page API — the chart page's own JSON endpoint
//      (/creative_radar_api/v1/popular_trend/sound/rank_list) is fetched
//      same-origin via js_code inside the crawled page, and the response is
//      written into the DOM where a CSS extraction can read it. Structured,
//      stable, and immune to class-name obfuscation.
//   2. Markdown fallback — if the in-page API shape changes or is blocked,
//      parse the rendered page's markdown for ranked title/author entries
//      (same resilience approach as jobs/ingest/billboard.ts).
//
// All parsing lives in pure exported functions so tests exercise the real
// logic with fixture payloads.

import { crawlUrl } from '@/lib/crawler/client';
import { cleanLine, isUsableLine } from '@/lib/crawler/textParsing';

export interface CrawledSound {
  /** Creative Center clip id — used as the sound's external id. */
  soundId: string;
  title: string;
  author: string;
  rank: number;
  /** 'popular' (established trending) or 'surging' (breakout). */
  chart: 'popular' | 'surging';
}

const CREATIVE_CENTER_URL =
  'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en';

/** DOM element id the in-page fetch writes its JSON into. */
const SINK_ID = 'mi-sound-rank-sink';

/**
 * js_code executed inside the crawled page: call the page's own rank-list
 * API (same-origin, so the page's cookies/anti-bot headers apply) and dump
 * the JSON into a <pre> the extraction schema can read. Any error is
 * written into the sink too, so the caller can distinguish "API refused"
 * from "page never loaded".
 */
function rankListJs(rankType: 'popular' | 'surging'): string {
  return `
    try {
      const res = await fetch('/creative_radar_api/v1/popular_trend/sound/rank_list?page=1&limit=50&period=7&rank_type=${rankType}&country_code=US', {
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const body = await res.text();
      const pre = document.createElement('pre');
      pre.id = '${SINK_ID}';
      pre.textContent = res.ok ? body : JSON.stringify({ miCrawlError: res.status + ' ' + body.slice(0, 300) });
      document.body.appendChild(pre);
    } catch (e) {
      const pre = document.createElement('pre');
      pre.id = '${SINK_ID}';
      pre.textContent = JSON.stringify({ miCrawlError: String(e) });
      document.body.appendChild(pre);
    }
  `;
}

/**
 * Parses the rank_list API payload into CrawledSound[].
 * Tolerates the field-name variants Creative Center has used
 * (sound_list/music_list, clip_id/id/song_id, author/artist_name).
 */
export function parseRankListPayload(
  payload: unknown,
  chart: 'popular' | 'surging',
): CrawledSound[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  if (root.miCrawlError) return [];

  const data = (root.data ?? root) as Record<string, unknown>;
  const list = (data.sound_list ?? data.music_list ?? data.list ?? []) as unknown[];
  if (!Array.isArray(list)) return [];

  const out: CrawledSound[] = [];
  let rank = 1;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const soundId = String(item.clip_id ?? item.song_id ?? item.id ?? '').trim();
    const title = String(item.title ?? item.song_name ?? '').trim();
    const author = String(item.author ?? item.artist_name ?? item.author_name ?? '').trim();
    if (!soundId || !title) continue;
    out.push({ soundId, title, author: author || 'Unknown', rank: rank++, chart });
  }
  return out;
}

// Nav/chrome noise on the Creative Center page that must not be mistaken
// for a song title when falling back to markdown parsing.
const CC_METADATA_RE =
  /^(TikTok\b.*|Creative Center.*|Trend(s|ing)?|Inspiration|Popular|Breakout|Music|Songs?|Hashtags?|Creators?|Videos?|Products?|Keyword|Ads?|Log ?in|Sign ?up|Get Started|For You|View More|See More|More|Filter|Region|Period|Last \d+ days|New to|Rank(ing)?s?|[0-9]+(st|nd|rd|th)?|[\d\s\-–|.,:]+)$/i;

/**
 * Markdown fallback: Creative Center renders each sound card with the song
 * title and artist on adjacent lines. Pair consecutive usable lines as
 * (title, author). Conservative by design — it prefers returning fewer,
 * correct entries over guessing.
 */
export function parseCreativeCenterMarkdown(
  markdown: string,
  chart: 'popular' | 'surging',
): CrawledSound[] {
  const lines = markdown
    .split('\n')
    .map(cleanLine)
    .filter((l) => isUsableLine(l, CC_METADATA_RE));

  const out: CrawledSound[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 1 < lines.length && out.length < 50; i++) {
    const title = lines[i];
    const author = lines[i + 1];
    // Titles/authors on this page are short; long lines are descriptions.
    if (title.length > 80 || author.length > 80) continue;
    const key = `${title}::${author}`.toLowerCase();
    if (seen.has(key)) {
      i++; // consume the whole repeated pair, not just its title line
      continue;
    }
    seen.add(key);
    out.push({
      // No stable id in markdown mode — derive one from the pair so the
      // sound resolver's ExternalId cache still de-duplicates across runs.
      soundId: `cc-md-${key.replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
      title,
      author,
      rank: out.length + 1,
      chart,
    });
    i++; // consume the author line
  }
  return out;
}

/** Extracts the JSON the in-page fetch wrote into the sink element. */
export function extractSinkJson(extracted: unknown): unknown {
  const rows = Array.isArray(extracted) ? extracted : extracted ? [extracted] : [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const text = (row as Record<string, unknown>).json;
    if (typeof text !== 'string' || !text.trim()) continue;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fetches one Creative Center chart ('popular' or 'surging') through the
 * crawler service. Throws on crawler-level failure (service unreachable,
 * page blocked) so the caller can count real failures; returns [] only when
 * the page loaded but yielded nothing parseable.
 */
export async function fetchCreativeCenterChart(
  chart: 'popular' | 'surging',
): Promise<CrawledSound[]> {
  const result = await crawlUrl(CREATIVE_CENTER_URL, {
    // Must run BEFORE waitFor: the script itself creates the sink element
    // the wait condition looks for.
    jsCodeBeforeWait: [rankListJs(chart)],
    waitFor: `css:#${SINK_ID}`,
    waitForTimeoutMs: 20_000,
    delayBeforeReturnHtmlSeconds: 1.5,
    pageTimeoutMs: 60_000,
    magic: true,
    extractionSchema: {
      name: 'SoundRankSink',
      baseSelector: 'body',
      fields: [{ name: 'json', selector: `#${SINK_ID}`, type: 'text' }],
    },
  });

  if (!result.success) {
    throw new Error(`crawler failed for Creative Center (${chart}): ${result.error ?? 'unknown error'}`);
  }

  const payload = extractSinkJson(result.extracted);
  const fromApi = parseRankListPayload(payload, chart);
  if (fromApi.length > 0) {
    console.log(`[tiktok-crawler] ${chart}: ${fromApi.length} sounds via in-page rank_list API`);
    return fromApi;
  }

  const fromMarkdown = result.markdown ? parseCreativeCenterMarkdown(result.markdown, chart) : [];
  if (fromMarkdown.length > 0) {
    console.log(`[tiktok-crawler] ${chart}: ${fromMarkdown.length} sounds via markdown fallback`);
    return fromMarkdown;
  }

  // Nothing parsed — log a diagnostic head so the workflow logs show what
  // the page actually served (bot wall, consent screen, layout change).
  const head = (result.markdown ?? '').split('\n').slice(0, 25).join(' | ').slice(0, 1200);
  console.warn(`[tiktok-crawler] ${chart}: page loaded but nothing parsed. Markdown head: ${head}`);
  return [];
}

// ─── Creator profiles (best-effort) ──────────────────────────────────────────

export interface CrawledCreator {
  username: string;
  followerCount: bigint | null;
  displayName: string | null;
}

/** Parses "1.2M" / "834.5K" / "12,345" style counts into a bigint. */
export function parseCompactCount(text: string): bigint | null {
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[
    (m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'
  ] ?? 1;
  return BigInt(Math.round(base * mult));
}

/** Finds a "<count> Followers" figure in profile-page markdown. */
export function parseFollowersFromMarkdown(markdown: string): bigint | null {
  // Strip markdown emphasis first — counts typically render as "**1.2M** Followers".
  const plain = markdown.replace(/[*_`]/g, '');
  const m = plain.match(/([\d.,]+\s*[KMB]?)\s*Followers/i);
  return m ? parseCompactCount(m[1]) : null;
}

/**
 * Best-effort follower count for a TikTok profile. Profile pages are far
 * more aggressively bot-walled than Creative Center, so a null here is a
 * normal outcome from datacenter IPs — callers must treat it as optional
 * enrichment, never as a required signal.
 */
export async function fetchCreatorProfile(username: string): Promise<CrawledCreator> {
  try {
    const result = await crawlUrl(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
      magic: true,
      delayBeforeReturnHtmlSeconds: 2,
      pageTimeoutMs: 45_000,
    });
    if (!result.success || !result.markdown) {
      return { username, followerCount: null, displayName: null };
    }
    return {
      username,
      followerCount: parseFollowersFromMarkdown(result.markdown),
      displayName: null,
    };
  } catch {
    return { username, followerCount: null, displayName: null };
  }
}
