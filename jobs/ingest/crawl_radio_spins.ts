/**
 * Radio station spins ingestion job
 *
 * Station "recently played" / "on-air" pages are entirely unstandardized —
 * every station runs a different CMS — so there is no single API to call.
 * This job uses the crawl4ai crawler service (services/crawler-api) to:
 *   1. Crawl each station's homepage (Station.websiteUrl) and read its link
 *      list for something that looks like a recently-played/playlist page.
 *   2. Crawl that page (or the homepage itself, if no such link exists —
 *      many stations embed a "now playing" widget directly on the homepage)
 *      and heuristically parse artist/title rows out of the markdown.
 *   3. Resolve each row to a canonical Track and write a RadioAirplayFact
 *      spin, which feeds /api/radio/:type/:id/airplay-totals (ranking) and
 *      jobs/etl/artist_daily_stats.ts's airplayPlays rollup.
 *
 * Because most station pages don't expose an exact per-song timestamp, rows
 * without a parsed clock time are stacked backwards from "now" at a rough
 * average-song-length spacing — good enough for ranking/spin-count purposes,
 * not a precise play log. A lookback dedup window prevents re-crawling the
 * same "last 10 played" list from creating duplicate spins on every run.
 *
 * Station selection: Station.websiteUrl IS NOT NULL (set this per station to
 * opt it into crawling — there is no reliable "has a recently-played page"
 * flag to filter on upfront).
 */

import { db } from '@/lib/db';
import { crawlUrl } from '@/lib/crawler/client';
import { cleanLine } from '@/lib/crawler/textParsing';
import { resolveTrackByTitleArtist } from '@/lib/crawler/resolveTrack';
import { runTrackedJob } from '@/lib/jobs/tracker';

const STATION_LIMIT = 25;
const DELAY_MS = 1500;
const AVG_SONG_LENGTH_MS = 3 * 60 * 1000;
const DEDUP_WINDOW_MS = 90 * 60 * 1000; // don't re-log the same station/track spin within 90m

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Recently-played link discovery ─────────────────────────────────────────

const RECENTLY_PLAYED_RE = /recently.?played|now.?playing|playlist|on.?air|song.?history|last.?played/i;

function findRecentlyPlayedUrl(links: { href: string; text?: string }[] | undefined, baseUrl: string): string | null {
  if (!links) return null;
  const match = links.find(
    (l) => RECENTLY_PLAYED_RE.test(l.text ?? '') || RECENTLY_PLAYED_RE.test(l.href),
  );
  if (!match) return null;
  try {
    return new URL(match.href, baseUrl).toString();
  } catch {
    return null;
  }
}

// ─── Spin parsing ────────────────────────────────────────────────────────────

interface SpinEntry {
  artist: string;
  title: string;
  playedAt?: Date; // parsed clock time, if the page showed one
}

const NOISE_RE = /^(Home|About|Contact|Menu|Search|Subscribe|Listen Live|Schedule|Podcasts|News|Sports|Weather|Advertise|Privacy|Terms|Login|Sign ?Up|Follow|Share|[|#\-–—]+)$/i;

function isUsableSegment(s: string): boolean {
  return s.length > 1 && s.length < 100 && !NOISE_RE.test(s) && !/^https?:\/\//.test(s);
}

/**
 * Heuristically parse "recently played" rows out of markdown. Two shapes
 * are common across station CMSes:
 *   "3:45 PM - Artist Name - Song Title"   (clock time present)
 *   "Artist Name - Song Title"             (no clock time; playlist widget)
 */
function parseSpinsMarkdown(markdown: string, today: Date): SpinEntry[] {
  const entries: SpinEntry[] = [];
  const lines = markdown.split('\n').map(cleanLine).filter((l) => l.length > 0);

  const timedRe = /^(\d{1,2}:\d{2}\s*(?:[AP]M)?)\s*[-–|]\s*(.+?)\s*[-–]\s*(.+)$/i;
  const plainRe = /^(.+?)\s*[-–]\s*(.+)$/;

  for (const line of lines) {
    if (entries.length >= 30) break;

    const timedMatch = line.match(timedRe);
    if (timedMatch) {
      const [, timeStr, artist, title] = timedMatch;
      if (!isUsableSegment(artist) || !isUsableSegment(title)) continue;
      entries.push({ artist: artist.trim(), title: title.trim(), playedAt: parseClockTime(timeStr, today) ?? undefined });
      continue;
    }

    const plainMatch = line.match(plainRe);
    if (plainMatch) {
      const [, left, right] = plainMatch;
      if (!isUsableSegment(left) || !isUsableSegment(right)) continue;
      // Ambiguous which side is artist vs title on a plain "A - B" line;
      // most station widgets render "Artist - Title".
      entries.push({ artist: left.trim(), title: right.trim() });
    }
  }

  return entries;
}

function parseClockTime(timeStr: string, today: Date): Date | null {
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const d = new Date(today);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

// ─── Station crawl ───────────────────────────────────────────────────────────

async function crawlStationSpins(station: { id: number; name: string; websiteUrl: string }): Promise<SpinEntry[]> {
  const homepage = await crawlUrl(station.websiteUrl, {
    magic: true,
    delayBeforeReturnHtmlSeconds: 1.5,
    pageTimeoutMs: 25000,
  });

  if (!homepage.success) {
    console.warn(`[crawl-radio-spins] Crawl failed for ${station.name}: ${homepage.error ?? 'no content'}`);
    return [];
  }

  const now = new Date();
  const homepageEntries = homepage.markdown ? parseSpinsMarkdown(homepage.markdown, now) : [];

  const spinsUrl = findRecentlyPlayedUrl(homepage.links, station.websiteUrl);
  if (!spinsUrl || spinsUrl === station.websiteUrl) {
    return homepageEntries;
  }

  const spinsPage = await crawlUrl(spinsUrl, {
    magic: true,
    delayBeforeReturnHtmlSeconds: 1.5,
    pageTimeoutMs: 25000,
  });

  if (!spinsPage.success || !spinsPage.markdown) {
    return homepageEntries;
  }

  const spinsPageEntries = parseSpinsMarkdown(spinsPage.markdown, now);
  return spinsPageEntries.length > 0 ? spinsPageEntries : homepageEntries;
}

async function writeSpins(
  station: { id: number; countryCode: string | null; cityId: number | null },
  entries: SpinEntry[],
): Promise<number> {
  let written = 0;
  const now = new Date();

  for (const [index, entry] of entries.entries()) {
    const playedAt = entry.playedAt ?? new Date(now.getTime() - index * AVG_SONG_LENGTH_MS);

    try {
      const { trackId } = await resolveTrackByTitleArtist(entry.title, entry.artist, 'crawl-radio-spins');

      const dupe = await db.radioAirplayFact.findFirst({
        where: {
          trackId,
          stationId: station.id,
          playedAt: {
            gte: new Date(playedAt.getTime() - DEDUP_WINDOW_MS),
            lte: new Date(playedAt.getTime() + DEDUP_WINDOW_MS),
          },
        },
        select: { id: true },
      });
      if (dupe) continue;

      await db.radioAirplayFact.create({
        data: {
          trackId,
          stationId: station.id,
          playedAt,
          countryCode: station.countryCode,
          cityId: station.cityId,
        },
      });
      written++;
    } catch (err) {
      console.warn(`[crawl-radio-spins] Failed to write spin "${entry.title}" by "${entry.artist}":`, (err as Error).message);
    }
  }

  return written;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.CRAWLER_API_URL) throw new Error('Missing required env var: CRAWLER_API_URL');
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  console.log('[crawl-radio-spins] Starting radio spins ingestion…');

  const stations = await db.station.findMany({
    where: { websiteUrl: { not: null } },
    take: STATION_LIMIT,
    select: { id: true, name: true, websiteUrl: true, countryCode: true, cityId: true },
  });

  if (stations.length === 0) {
    console.warn('[crawl-radio-spins] No stations have a websiteUrl set — nothing to crawl. Set Station.websiteUrl to opt a station into crawling.');
    await db.$disconnect();
    return;
  }

  console.log(`[crawl-radio-spins] Crawling ${stations.length} stations…`);

  let totalWritten = 0;

  for (const station of stations) {
    try {
      const entries = await crawlStationSpins({ id: station.id, name: station.name, websiteUrl: station.websiteUrl! });
      if (entries.length === 0) {
        console.warn(`[crawl-radio-spins] No spins parsed for ${station.name} — page layout may not match a supported pattern`);
      } else {
        const written = await writeSpins(station, entries);
        totalWritten += written;
        console.log(`[crawl-radio-spins] ${station.name}: wrote ${written}/${entries.length} spins`);
      }
    } catch (err) {
      console.error(`[crawl-radio-spins] Station ${station.name} failed:`, (err as Error).message);
    }
    await sleep(DELAY_MS);
  }

  console.log(`[crawl-radio-spins] Ingestion complete — ${totalWritten} spins written.`);
  await db.$disconnect();
}

runTrackedJob('ingest:crawl-radio-spins', main).catch((err) => {
  console.error('[crawl-radio-spins] Fatal error:', err);
  process.exit(1);
});
