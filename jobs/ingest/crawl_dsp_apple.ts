/**
 * Apple Music DSP chart ingestion job
 *
 * Apple Music's web player is a JS-rendered SPA that returns 403 to plain
 * HTTP fetches (no official public chart API), so this uses the crawl4ai
 * crawler service (services/crawler-api) with stealth mode (`magic: true`)
 * to render the page with a real headless browser, then parses the track
 * listing out of markdown and writes chart_snapshots + chart_rows, the same
 * shape jobs/ingest/billboard.ts uses.
 *
 * Charts scraped (Apple's editorial "Top 100" playlists, updated daily):
 *   - Top 100: Global
 *   - Top 100: USA
 *
 * This is the template for the other DSP-facing gaps (Amazon Music, Tidal):
 * add an entry to PLAYLISTS with the playlist URL + platform/chart metadata
 * and, if the site's markdown layout differs, a bespoke parse* function
 * following the same multi-strategy pattern as parseAppleMusicMarkdown.
 *
 * Track resolution: title+artist fuzzy → stub creation (lib/crawler/resolveTrack.ts)
 */

import { db } from '@/lib/db';
import { crawlUrl } from '@/lib/crawler/client';
import { cleanLine, isUsableLine } from '@/lib/crawler/textParsing';
import { resolveTrackByTitleArtist } from '@/lib/crawler/resolveTrack';
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Config ───────────────────────────────────────────────────────────────────

const PLAYLISTS = [
  {
    name: 'applemusic_top_100_global',
    url: 'https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31',
    countryCode: 'GLOBAL',
  },
  {
    name: 'applemusic_top_100_usa',
    url: 'https://music.apple.com/us/playlist/top-100-usa/pl.606afcbb70264d2eb2b51d8dbcfa6a12',
    countryCode: 'US',
  },
];

const PLATFORM = 'applemusic';
const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Parse markdown from the crawler service ──────────────────────────────────

interface AppleMusicEntry {
  rank: number;
  title: string;
  artist: string;
}

// Chrome/nav noise that shows up around each track row — never a title or artist.
const METADATA_RE =
  /^(PREVIEW|Play|Pause|Add|Add to Library|Explicit|New|Apple Music|Listen Now|Browse|Radio|Sign[- ]?[Ii]n|Try [Ff]ree|\d{1,2}:\d{2}|[|#\-–—]+|\d+)$/i;

/**
 * Parse an Apple Music playlist markdown render.
 *
 * Apple's web player renders each track row as a track-number line, a title
 * line, and an artist line (duration and chrome interspersed, filtered by
 * METADATA_RE). Falls back to an inline "N. Title" list, then pipe tables —
 * the same three-strategy shape as jobs/ingest/billboard.ts.
 */
function parseAppleMusicMarkdown(markdown: string): AppleMusicEntry[] {
  const entries: AppleMusicEntry[] = [];
  const seen = new Set<number>();
  const usable = (l: string) => isUsableLine(l, METADATA_RE);

  const lines = markdown.split('\n').map(cleanLine).filter((l) => l.length > 0);

  // ── Strategy 1: standalone rank number, then title, then artist ──────────
  for (let i = 0; i < lines.length && entries.length < 100; i++) {
    const rankMatch = lines[i].match(/^(\d{1,3})$/);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1], 10);
    if (rank < 1 || rank > 100 || seen.has(rank)) continue;

    const rest = lines.slice(i + 1, i + 6).filter(usable);
    if (rest.length < 2) continue;

    const title = rest[0];
    const artist = rest[1];
    if (title.length > 150 || artist.length > 150) continue;

    entries.push({ rank, title, artist });
    seen.add(rank);
  }

  if (entries.length >= 10) return entries.sort((a, b) => a.rank - b.rank);

  // ── Strategy 2: "N. Title" inline, artist on the next usable line ────────
  entries.length = 0;
  seen.clear();
  for (let i = 0; i < lines.length && entries.length < 100; i++) {
    const m = lines[i].match(/^(\d{1,3})[.)]\s+(.+)/);
    if (!m) continue;
    const rank = parseInt(m[1], 10);
    if (rank < 1 || rank > 100 || seen.has(rank)) continue;
    const title = m[2].trim();
    const next = lines[i + 1] ?? '';
    if (!usable(title) || !usable(next)) continue;
    entries.push({ rank, title, artist: next });
    seen.add(rank);
    i++;
  }

  if (entries.length >= 10) return entries.sort((a, b) => a.rank - b.rank);

  // ── Strategy 3: pipe-delimited table rows ─────────────────────────────────
  entries.length = 0;
  seen.clear();
  const tableRows = markdown.match(/^\|.+\|.+\|/mg) ?? [];
  for (const row of tableRows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const rank = parseInt(cells[0], 10);
    if (isNaN(rank) || rank < 1 || rank > 100 || seen.has(rank)) continue;
    const title = cleanLine(cells[1]);
    const artist = cleanLine(cells[2]);
    if (!usable(title) || !usable(artist)) continue;
    entries.push({ rank, title, artist });
    seen.add(rank);
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

// ─── Playlist ingestion ─────────────────────────────────────────────────────

async function ingestPlaylist(playlist: typeof PLAYLISTS[number], snapshotDate: Date): Promise<void> {
  console.log(`[crawl-dsp-apple] Crawling ${playlist.name}…`);

  const result = await crawlUrl(playlist.url, {
    magic: true,
    scanFullPage: true, // playlist track list lazy-loads on scroll
    delayBeforeReturnHtmlSeconds: 2,
    pageTimeoutMs: 45000,
  });

  if (!result.success || !result.markdown) {
    console.warn(`[crawl-dsp-apple] Crawl failed for ${playlist.name}: ${result.error ?? 'no content'}`);
    return;
  }

  console.log(`[crawl-dsp-apple] Raw markdown sample (${playlist.name}):\n---\n${result.markdown.slice(0, 1500)}\n---`);

  const entries = parseAppleMusicMarkdown(result.markdown);
  console.log(`[crawl-dsp-apple] Parsed ${entries.length} entries from ${playlist.name}`);

  if (entries.length === 0) {
    console.warn(`[crawl-dsp-apple] No entries parsed — page layout may have changed`);
    return;
  }

  const snapshot = await db.chartSnapshot.upsert({
    where: {
      chartName_platform_countryCode_snapshotDate: {
        chartName: playlist.name,
        platform: PLATFORM,
        countryCode: playlist.countryCode,
        snapshotDate,
      },
    },
    create: {
      chartName: playlist.name,
      platform: PLATFORM,
      countryCode: playlist.countryCode,
      snapshotDate,
    },
    update: {},
  });

  let written = 0;
  for (const entry of entries) {
    try {
      const { trackId } = await resolveTrackByTitleArtist(entry.title, entry.artist, 'crawl-dsp-apple');

      await db.chartRow.upsert({
        where: { snapshotId_rank: { snapshotId: snapshot.id, rank: entry.rank } },
        create: { snapshotId: snapshot.id, trackId, rank: entry.rank },
        update: { trackId },
      });
      written++;
    } catch (err) {
      console.warn(`[crawl-dsp-apple] Failed to write rank ${entry.rank} "${entry.title}":`, (err as Error).message);
    }
  }

  console.log(`[crawl-dsp-apple] ${playlist.name}: wrote ${written}/${entries.length} chart rows`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.CRAWLER_API_URL) throw new Error('Missing required env var: CRAWLER_API_URL');
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  console.log('[crawl-dsp-apple] Starting Apple Music chart ingestion…');

  const snapshotDate = toDateOnly(new Date());

  for (const playlist of PLAYLISTS) {
    try {
      await ingestPlaylist(playlist, snapshotDate);
    } catch (err) {
      console.error(`[crawl-dsp-apple] Playlist ${playlist.name} failed:`, (err as Error).message);
    }
    await sleep(DELAY_MS);
  }

  console.log('[crawl-dsp-apple] Ingestion complete.');
  await db.$disconnect();
}

runTrackedJob('ingest:crawl-dsp-apple', main).catch((err) => {
  console.error('[crawl-dsp-apple] Fatal error:', err);
  process.exit(1);
});
