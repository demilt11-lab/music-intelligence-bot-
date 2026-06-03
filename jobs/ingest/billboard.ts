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

/**
 * Parse Billboard chart markdown into structured entries.
 * Billboard pages render chart entries with a consistent pattern:
 * "#1\nSong Title\nArtist Name" or similar markdown structures.
 */
function parseBillboardMarkdown(markdown: string): BillboardEntry[] {
  const entries: BillboardEntry[] = [];

  // Pattern 1: lines like "1. Song Title\nArtist Name" or rank blocks
  // Billboard markdown typically has chart entries as numbered lists or
  // structured sections. We look for number + title + artist groupings.

  // Split into lines and scan for rank patterns
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);

  let i = 0;
  while (i < lines.length && entries.length < 100) {
    const line = lines[i];

    // Match lines starting with a rank number (1-100)
    const rankMatch = line.match(/^#?(\d{1,3})[\.\):\s]/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1], 10);
      if (rank >= 1 && rank <= 100) {
        // Next non-empty lines should be title and artist
        const rest = line.slice(rankMatch[0].length).trim();
        let title = rest;
        let artist = '';

        if (!title && i + 1 < lines.length) {
          title = lines[i + 1];
          i++;
        }
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          // Artist lines tend not to start with # or be very short rank indicators
          if (!nextLine.match(/^#?\d{1,3}[\.\):\s]/) && nextLine.length > 1) {
            artist = nextLine;
            i++;
          }
        }

        if (title && artist && rank) {
          entries.push({ rank, title: title.replace(/\*+/g, '').trim(), artist: artist.replace(/\*+/g, '').trim() });
        }
      }
    }
    i++;
  }

  // Pattern 2: if pattern 1 found nothing, try "**#1** Title - Artist" style
  if (entries.length === 0) {
    const blockPattern = /\*{0,2}#?(\d{1,3})\*{0,2}[^\n]*?\n+([^\n]+)\n+([^\n]+)/g;
    let m: RegExpExecArray | null;
    while ((m = blockPattern.exec(markdown)) !== null && entries.length < 100) {
      const rank = parseInt(m[1], 10);
      const title = m[2].replace(/\*+/g, '').trim();
      const artist = m[3].replace(/\*+/g, '').trim();
      if (rank >= 1 && rank <= 100 && title && artist) {
        entries.push({ rank, title, artist });
      }
    }
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
  const snapshotDate = toDateOnly(new Date());
  let totalWritten = 0;

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
