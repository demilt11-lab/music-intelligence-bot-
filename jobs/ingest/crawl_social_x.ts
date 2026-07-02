/**
 * X (Twitter) artist follower ingestion job
 *
 * There is no official public API for follower counts without an approved
 * developer app, and X blocks plain HTTP fetches for logged-out profile
 * pages, so this uses the crawl4ai crawler service (services/crawler-api)
 * with stealth mode (`magic: true`) to render the profile with a real
 * headless browser and pull the follower count out of the rendered
 * markdown.
 *
 * Scope: follower counts only. X's timeline is largely gated behind a login
 * wall for logged-out requests, so post-level UGC (mentions/hashtags) is not
 * reliably scrapable this way — fabricating that signal from an empty or
 * truncated timeline would be worse than not shipping it (see
 * services/ar-api/main.py's playlists_to_pitch for the same call on
 * unimplemented-vs-fabricated). A follow-up job (e.g. crawl_social_x_ugc.ts)
 * can add UGC once there's an authenticated crawl path.
 *
 * Facebook follows the same pattern (profile-page follower count, gated
 * timeline) — add a FACEBOOK case the same way once there's a target list
 * of artist Facebook Page URLs (ExternalId platform='facebook').
 *
 * Artist resolution: ExternalId(platform='x'|'twitter', entityType='artist')
 * Output: ArtistDailyStats.platformFollowers.x (JSON merge — other
 * platforms' entries are read-modify-written, never clobbered) and
 * totalFollowers (sum across platformFollowers), consumed by
 * jobs/etl/artist_trajectory_snapshots.ts's followersDelta28d.
 */

import { db } from '@/lib/db';
import { crawlUrl } from '@/lib/crawler/client';
import { runTrackedJob } from '@/lib/jobs/tracker';

const DELAY_MS = 1500;
const BATCH_LIMIT = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Follower count parsing ─────────────────────────────────────────────────

/** Parse shorthand counts like "12.3K", "1.2M", "4,502" into a plain number. */
function parseCount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  const m = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const base = parseFloat(m[1]);
  if (isNaN(base)) return null;
  const mult = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[m[2]?.toUpperCase() ?? ''] ?? 1;
  return Math.round(base * mult);
}

/** Pull a "N Followers" count out of an X profile markdown render. */
function parseFollowerCount(markdown: string): number | null {
  const patterns = [
    /([\d.,]+\s*[KMB]?)\s*Followers/i,
    /Followers\s*[\n:]\s*([\d.,]+\s*[KMB]?)/i,
  ];
  for (const re of patterns) {
    const m = markdown.match(re);
    if (m) {
      const count = parseCount(m[1]);
      if (count !== null) return count;
    }
  }
  return null;
}

// ─── Per-artist crawl ────────────────────────────────────────────────────────

interface XTarget {
  artistId: number;
  artistName: string;
  handle: string;
}

async function crawlFollowerCount(target: XTarget): Promise<number | null> {
  const handle = target.handle.replace(/^@/, '');
  const url = `https://x.com/${encodeURIComponent(handle)}`;

  const result = await crawlUrl(url, {
    magic: true,
    delayBeforeReturnHtmlSeconds: 3,
    pageTimeoutMs: 30000,
  });

  if (!result.success || !result.markdown) {
    console.warn(`[crawl-social-x] Crawl failed for @${handle} (artist ${target.artistId}): ${result.error ?? 'no content'}`);
    return null;
  }

  const followers = parseFollowerCount(result.markdown);
  if (followers === null) {
    console.warn(`[crawl-social-x] Could not parse follower count for @${handle} — profile may be gated or layout changed`);
  }
  return followers;
}

async function upsertFollowerCount(artistId: number, date: Date, followers: number): Promise<void> {
  const existing = await db.artistDailyStats.findUnique({
    where: { artistId_date: { artistId: BigInt(artistId), date } },
    select: { platformFollowers: true },
  });

  const priorFollowers = (existing?.platformFollowers as Record<string, number> | null) ?? {};
  const mergedFollowers = { ...priorFollowers, x: followers };
  const totalFollowers = Object.values(mergedFollowers).reduce(
    (sum, v) => sum + (typeof v === 'number' ? v : 0),
    0,
  );

  await db.artistDailyStats.upsert({
    where: { artistId_date: { artistId: BigInt(artistId), date } },
    create: {
      artistId: BigInt(artistId),
      date,
      totalStreams: BigInt(0),
      platformFollowers: mergedFollowers,
      totalFollowers: BigInt(totalFollowers),
    },
    update: {
      platformFollowers: mergedFollowers,
      totalFollowers: BigInt(totalFollowers),
    },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.CRAWLER_API_URL) throw new Error('Missing required env var: CRAWLER_API_URL');
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  console.log('[crawl-social-x] Starting X follower ingestion…');

  const externalIds = await db.externalId.findMany({
    where: { entityType: 'artist', platform: { in: ['x', 'twitter'] } },
    take: BATCH_LIMIT,
  });

  if (externalIds.length === 0) {
    console.warn('[crawl-social-x] No artists have an X/Twitter ExternalId — nothing to crawl. Populate ExternalId(platform="x", entityType="artist") to enable this job.');
    await db.$disconnect();
    return;
  }

  const artists = await db.artist.findMany({
    where: { id: { in: externalIds.map((e) => e.entityId) } },
    select: { id: true, name: true },
  });
  const artistById = new Map(artists.map((a) => [a.id, a.name]));

  const targets: XTarget[] = externalIds
    .filter((e) => artistById.has(e.entityId))
    .map((e) => ({ artistId: e.entityId, artistName: artistById.get(e.entityId)!, handle: e.externalId }));

  console.log(`[crawl-social-x] Crawling ${targets.length} artist profiles…`);

  const today = toDateOnly(new Date());
  let written = 0;

  for (const target of targets) {
    try {
      const followers = await crawlFollowerCount(target);
      if (followers !== null) {
        await upsertFollowerCount(target.artistId, today, followers);
        written++;
        console.log(`[crawl-social-x] ${target.artistName}: ${followers.toLocaleString()} X followers`);
      }
    } catch (err) {
      console.warn(`[crawl-social-x] Failed for ${target.artistName}:`, (err as Error).message);
    }
    await sleep(DELAY_MS);
  }

  console.log(`[crawl-social-x] Wrote follower counts for ${written}/${targets.length} artists.`);
  await db.$disconnect();
}

runTrackedJob('ingest:crawl-social-x', main).catch((err) => {
  console.error('[crawl-social-x] Fatal error:', err);
  process.exit(1);
});
