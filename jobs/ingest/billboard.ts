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

// Metadata field labels that appear between rank heading and actual title/artist
const METADATA_LABELS = new Set([
  'peak chart date', 'award', 'weeks on chart', 'last week', 'peak position',
  'peak', 'weeks', 'new', 're-entry', 'rising', 'steady', 'falling',
]);

function isMetadataLine(line: string): boolean {
  const clean = line.replace(/\*+/g, '').replace(/#+/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim().toLowerCase();
  if (!clean) return true;
  if (clean.match(/^\d{1,3}$/)) return true; // bare number
  if (clean.match(/^\[?\d{2}\/\d{2}\/\d{2,4}\]?/)) return true; // date
  if (clean.match(/^https?:\/\//)) return true; // URL
  if (clean.match(/^\[.*\]\(https?:/)) return true; // markdown link
  for (const label of METADATA_LABELS) {
    if (clean.includes(label)) return true;
  }
  return false;
}

/**
 * Parse Billboard chart markdown.
 *
 * Billboard pages from Firecrawl markdown have the structure:
 *   ### 1
 *   #### Peak Chart Date
 *   [02/14/26](link)
 *   **Song Title**
 *   Artist Name
 *   ...
 *   ### 2
 *   ...
 */
function parseBillboardMarkdown(markdown: string): BillboardEntry[] {
  const entries: BillboardEntry[] = [];
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentRank: number | null = null;
  let candidateLines: string[] = [];

  const flush = () => {
    if (currentRank === null) return;
    // candidateLines contains everything between this rank heading and the next
    // Filter out metadata, then first non-metadata line = title, second = artist
    const content = candidateLines.filter((l) => !isMetadataLine(l));
    const title = content[0]?.replace(/\*+/g, '').replace(/#+/g, '').trim();
    const artist = content[1]?.replace(/\*+/g, '').replace(/#+/g, '').trim();
    if (title && artist && title.length > 0 && artist.length > 0) {
      entries.push({ rank: currentRank, title, artist });
    }
    candidateLines = [];
  };

  for (const line of lines) {
    // Rank heading: ### 1 or ## 1 or # 1 (standalone rank lines)
    const rankHeading = line.match(/^#{1,4}\s+(\d{1,3})\s*$/);
    if (rankHeading) {
      flush();
      const rank = parseInt(rankHeading[1], 10);
      currentRank = rank >= 1 && rank <= 100 ? rank : null;
      continue;
    }

    if (currentRank !== null) {
      candidateLines.push(line);
    }
  }
  flush();

  // Fallback: if heading-based parse found nothing, try inline pattern
  // e.g. "**1. Song Title** by Artist"
  if (entries.length === 0) {
    const inlinePattern = /^\*{0,2}(\d{1,3})[.)]\s*\*{0,2}([^*\n]+?)\*{0,2}(?:\s+[Bb]y\s+|\s*[-–]\s*)(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = inlinePattern.exec(markdown)) !== null && entries.length < 100) {
      const rank = parseInt(m[1], 10);
      if (rank >= 1 && rank <= 100) {
        entries.push({ rank, title: m[2].trim(), artist: m[3].trim() });
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

  // Clean up any stub tracks written by a previous broken parse run
  const deleted = await db.track.deleteMany({
    where: {
      OR: [
        { title: { startsWith: '####' } },
        { title: { startsWith: '###' } },
        { title: { contains: 'Peak Chart Date' } },
        { title: { contains: 'billboard.com' } },
      ],
      // Only delete stubs (no external IDs from other platforms)
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
