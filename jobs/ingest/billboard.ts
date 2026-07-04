/**
 * Billboard chart ingestion job
 *
 * Uses the crawl4ai crawler service (services/crawler-api) to render
 * Billboard chart pages with a real headless browser and write entries
 * into chart_snapshots + chart_rows, keyed to canonical DB tracks.
 *
 * Charts scraped:
 *   - Hot 100 (Global)
 *   - Hot R&B/Hip-Hop Songs
 *   - Hot Country Songs
 *   - Pop Airplay
 *
 * Add more chart sites by appending to CHARTS below — the markdown parser
 * is heuristic (three fallback strategies) rather than tied to Billboard's
 * specific markup, so it generalizes to other ranked chart pages as long as
 * they render as "rank heading, then title, then artist" or a pipe table.
 *
 * Track resolution: ExternalId(billboard) → title+artist fuzzy → stub creation
 */

import { db } from '@/lib/db';
import { crawlUrl } from '@/lib/crawler/client';
import { cleanLine, isUsableLine } from '@/lib/crawler/textParsing';
import { resolveTrackByTitleArtist } from '@/lib/crawler/resolveTrack';
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Config ───────────────────────────────────────────────────────────────────

const CHARTS = [
  { name: 'billboard_hot_100', url: 'https://www.billboard.com/charts/hot-100/', genre: 'all' },
  { name: 'billboard_hot_rnb_hiphop', url: 'https://www.billboard.com/charts/r-b-hip-hop-songs/', genre: 'rnb_hiphop' },
  { name: 'billboard_hot_country', url: 'https://www.billboard.com/charts/country-songs/', genre: 'country' },
  { name: 'billboard_pop_airplay', url: 'https://www.billboard.com/charts/pop-airplay/', genre: 'pop' },
];

const PLATFORM = 'billboard';
const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Parse markdown from the crawler service ──────────────────────────────────

interface BillboardEntry {
  rank: number;
  title: string;
  artist: string;
  previousRank?: number;
  weeksOnChart?: number;
}

// Lines that are metadata/nav noise, never a song title or artist name
const METADATA_RE = /^(LW|PK|WOC|NEW|RE-?ENTRY|Award|Peak|Chart|Date|Debut|Hot|Billboard|spotify|apple|amazon|youtube|tidal|pandora|trending|airplay|radio|sales|streaming|Skip to|Toggle|Share|Award Badge|[|#\-–—]+|\d+)$/i;

/**
 * Parse Billboard chart markdown.
 *
 * The crawler renders Billboard as a sequence of rank headings (### N or ## N)
 * followed by metadata lines, then the song title and artist as plain text.
 * The title is NOT reliably bold — it appears as the first non-metadata text
 * line after the rank heading.
 *
 * Fallback: pipe-delimited table rows  |rank|title|artist|
 */
function parseBillboardMarkdown(markdown: string): BillboardEntry[] {
  const entries: BillboardEntry[] = [];
  const seen = new Set<number>();
  const usable = (l: string) => isUsableLine(l, METADATA_RE);

  // ── Strategy 1: rank-heading sections ────────────────────────────────────
  // Split on lines that are only a heading + a 1-3 digit number, e.g. "### 42"
  const sections = markdown.split(/(?=^#{1,4}\s+\d{1,3}\s*$)/m);

  for (const section of sections) {
    const rankMatch = section.match(/^#{1,4}\s+(\d{1,3})\s*$/m);
    if (!rankMatch) continue;
    const rank = parseInt(rankMatch[1], 10);
    if (rank < 1 || rank > 100 || seen.has(rank)) continue;

    // Collect non-empty cleaned lines that follow the rank heading
    const afterHeading = section.slice(rankMatch.index! + rankMatch[0].length);
    const candidates = afterHeading
      .split('\n')
      .map(cleanLine)
      .filter(usable);

    if (candidates.length < 2) continue;

    const title = candidates[0];
    const artist = candidates[1];

    // Sanity: reject if they look like navigation / chart-UI text
    if (title.length > 100 || artist.length > 100) continue;

    entries.push({ rank, title, artist });
    seen.add(rank);
  }

  if (entries.length >= 10) return entries.sort((a, b) => a.rank - b.rank);

  // ── Strategy 2: pipe-delimited table rows ─────────────────────────────────
  // Some renders come out as: | 1 | Song Title | Artist |
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

  if (entries.length >= 10) return entries.sort((a, b) => a.rank - b.rank);

  // ── Strategy 3: "N. Title\nArtist" inline list ───────────────────────────
  const lines = markdown.split('\n').map(cleanLine).filter((l) => l.length > 0);
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

  return entries.sort((a, b) => a.rank - b.rank);
}

// ─── Chart ingestion ──────────────────────────────────────────────────────────

async function ingestChart(chart: typeof CHARTS[number], snapshotDate: Date): Promise<void> {
  console.log(`[billboard] Crawling ${chart.name}…`);

  const result = await crawlUrl(chart.url, {
    magic: true,
    delayBeforeReturnHtmlSeconds: 2,
  });

  if (!result.success || !result.markdown) {
    console.warn(`[billboard] Crawl failed for ${chart.name}: ${result.error ?? 'no content'}`);
    return;
  }

  // Log first 1500 chars so we can inspect the actual structure
  console.log(`[billboard] Raw markdown sample (${chart.name}):\n---\n${result.markdown.slice(0, 1500)}\n---`);

  const entries = parseBillboardMarkdown(result.markdown);
  console.log(`[billboard] Parsed ${entries.length} entries from ${chart.name}`);

  if (entries.length === 0) {
    console.warn(`[billboard] No entries parsed — markdown may have changed structure`);
    return;
  }

  // Upsert snapshot
  const snapshot = await db.chartSnapshot.upsert({
    where: {
      chartName_platform_countryCode_snapshotDate: {
        chartName: chart.name,
        platform: PLATFORM,
        countryCode: 'US',
        snapshotDate,
      },
    },
    create: {
      chartName: chart.name,
      platform: PLATFORM,
      countryCode: 'US',
      genre: chart.genre,
      snapshotDate,
    },
    update: {},
  });

  let written = 0;
  for (const entry of entries) {
    try {
      const { trackId } = await resolveTrackByTitleArtist(entry.title, entry.artist, 'billboard');

      await db.chartRow.upsert({
        where: { snapshotId_rank: { snapshotId: snapshot.id, rank: entry.rank } },
        create: {
          snapshotId: snapshot.id,
          trackId,
          rank: entry.rank,
          previousRank: entry.previousRank ?? null,
          weeksOnChart: entry.weeksOnChart ?? null,
        },
        update: {
          trackId,
          previousRank: entry.previousRank ?? null,
          weeksOnChart: entry.weeksOnChart ?? null,
        },
      });
      written++;
    } catch (err) {
      console.warn(`[billboard] Failed to write rank ${entry.rank} "${entry.title}":`, (err as Error).message);
    }
  }

  console.log(`[billboard] ${chart.name}: wrote ${written}/${entries.length} chart rows`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.CRAWLER_API_URL) throw new Error('Missing required env var: CRAWLER_API_URL');
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  console.log('[billboard] Starting Billboard chart ingestion…');

  // Clean up any stub tracks written by a previous broken parse run
  const deleted = await db.track.deleteMany({
    where: {
      OR: [
        { title: { startsWith: '####' } },
        { title: { startsWith: '###' } },
        { title: { contains: 'Peak Chart Date' } },
        { title: { contains: 'billboard.com' } },
        { title: { in: ['LW', 'PK', 'WOC', 'NEW', 'RE-ENTRY', 'Award'] } },
      ],
      externalIds: { none: { platform: { not: 'billboard' } } },
    },
  });
  if (deleted.count > 0) {
    console.log(`[billboard] Cleaned up ${deleted.count} bad stub tracks from prior broken parse`);
  }

  const snapshotDate = toDateOnly(new Date());

  for (const chart of CHARTS) {
    try {
      await ingestChart(chart, snapshotDate);
    } catch (err) {
      console.error(`[billboard] Chart ${chart.name} failed:`, (err as Error).message);
    }
    await sleep(DELAY_MS);
  }

  console.log('[billboard] Ingestion complete.');
  await db.$disconnect();
}

runTrackedJob('ingest:billboard', main).catch((err) => {
  console.error('[billboard] Fatal error:', err);
  process.exit(1);
});
