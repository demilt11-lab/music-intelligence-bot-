/**
 * Billboard chart ingestion job
 *
 * Uses Firecrawl to scrape Billboard chart pages and write entries
 * into chart_snapshots + chart_rows, keyed to canonical DB tracks.
 *
 * Charts scraped:
 *   - Hot 100 (Global)
 *   - Hot R&B/Hip-Hop Songs
 *   - Hot Country Songs
 *   - Pop Airplay
 *
 * Track resolution: ExternalId(billboard) → title+artist fuzzy → stub creation
 */

import { db } from '@/lib/db';
import { scrapeUrl } from '@/lib/firecrawl/client';

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

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Parse markdown from Firecrawl ────────────────────────────────────────────

interface BillboardEntry {
  rank: number;
  title: string;
  artist: string;
  previousRank?: number;
  weeksOnChart?: number;
}

// Lines that are metadata/nav noise, never a song title or artist name
const METADATA_RE = /^(LW|PK|WOC|NEW|RE-?ENTRY|Award|Peak|Chart|Date|Debut|Hot|Billboard|spotify|apple|amazon|youtube|tidal|pandora|trending|airplay|radio|sales|streaming|Skip to|Toggle|Share|Award Badge|[|#\-–—]+|\d+)$/i;

function cleanLine(l: string): string {
  return l
    .replace(/\*+/g, '')          // strip bold/italic markers
    .replace(/#+/g, '')           // strip heading hashes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links → text
    .replace(/`+/g, '')
    .trim();
}

function isUsableLine(l: string): boolean {
  if (l.length < 2) return false;
  if (METADATA_RE.test(l)) return false;
  if (/^[\d\s\-–|.,]+$/.test(l)) return false;  // pure numbers/punctuation
  if (/^https?:\/\//.test(l)) return false;
  return true;
}

/**
 * Parse Billboard chart markdown from Firecrawl.
 *
 * Firecrawl renders Billboard as a sequence of rank headings (### N or ## N)
 * followed by metadata lines, then the song title and artist as plain text.
 * The title is NOT reliably bold — it appears as the first non-metadata text
 * line after the rank heading.
 *
 * Fallback: pipe-delimited table rows  |rank|title|artist|
 */
function parseBillboardMarkdown(markdown: string): BillboardEntry[] {
  const entries: BillboardEntry[] = [];
  const seen = new Set<number>();

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
      .filter(isUsableLine);

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
  // Some Firecrawl outputs render as: | 1 | Song Title | Artist |
  const tableRows = markdown.match(/^\|.+\|.+\|/mg) ?? [];
  for (const row of tableRows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const rank = parseInt(cells[0], 10);
    if (isNaN(rank) || rank < 1 || rank > 100 || seen.has(rank)) continue;
    const title = cleanLine(cells[1]);
    const artist = cleanLine(cells[2]);
    if (!isUsableLine(title) || !isUsableLine(artist)) continue;
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
    if (!isUsableLine(title) || !isUsableLine(next)) continue;
    entries.push({ rank, title, artist: next });
    seen.add(rank);
    i++;
  }

  return entries.sort((a, b) => a.rank - b.rank);
}

// ─── Track resolution ─────────────────────────────────────────────────────────

interface ResolvedTrack {
  trackId: number;
  isNew: boolean;
}

async function resolveBillboardTrack(entry: BillboardEntry): Promise<ResolvedTrack> {
  const normTitle = normalise(entry.title);
  const normArtist = normalise(entry.artist);

  // 1. Fuzzy title + artist match against existing tracks
  if (normTitle && normArtist) {
    const titleToken = normTitle.split(' ')[0];
    const candidates = await db.track.findMany({
      where: { title: { contains: titleToken, mode: 'insensitive' } },
      include: { trackArtists: { include: { artist: true } } },
      take: 50,
    });

    for (const c of candidates) {
      if (normalise(c.title) !== normTitle) continue;
      const artistMatch = c.trackArtists.some((ta) => normalise(ta.artist.name) === normArtist);
      if (artistMatch) return { trackId: c.id, isNew: false };
    }
  }

  // 2. Create stub track + artist
  let artist = await db.artist.findFirst({
    where: { name: { equals: entry.artist, mode: 'insensitive' } },
  });
  if (!artist) {
    artist = await db.artist.create({ data: { name: entry.artist } });
  }

  const track = await db.track.create({
    data: {
      title: entry.title,
      trackArtists: { create: { artistId: artist.id, role: 'primary' } },
    },
  });

  console.log(`[billboard] Created stub track id=${track.id} "${entry.title}" by "${entry.artist}"`);
  return { trackId: track.id, isNew: true };
}

// ─── Chart ingestion ──────────────────────────────────────────────────────────

async function ingestChart(chart: typeof CHARTS[number], snapshotDate: Date): Promise<void> {
  console.log(`[billboard] Scraping ${chart.name}…`);

  const result = await scrapeUrl(chart.url, {
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: 2000,
  });

  if (!result.success || !result.data?.markdown) {
    console.warn(`[billboard] Scrape failed for ${chart.name}: ${result.error ?? 'no content'}`);
    return;
  }

  // Log first 1500 chars so we can inspect the actual structure
  console.log(`[billboard] Raw markdown sample (${chart.name}):\n---\n${result.data.markdown.slice(0, 1500)}\n---`);

  const entries = parseBillboardMarkdown(result.data.markdown);
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
      const { trackId } = await resolveBillboardTrack(entry);

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
  if (!process.env.FIRECRAWL_API_KEY) throw new Error('Missing required env var: FIRECRAWL_API_KEY');
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

main().catch((err) => {
  console.error('[billboard] Fatal error:', err);
  process.exit(1);
});
