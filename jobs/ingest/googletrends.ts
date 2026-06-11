/**
 * Google Trends ingestion job
 *
 * - Fetches tracks updated in the last 14 days (max 50) from the DB
 * - For each track, calls getInterestOverTime("${title} ${artistName}", '', 7)
 * - Upserts track_platform_stats_daily with platform='google_trends',
 *   streams=averageInterest (as proxy metric)
 * - Flags rising tracks (trend='rising' AND averageInterest > 40)
 * - Fetches rising music queries globally via getRisingQueries('35')
 *   and logs the top 20
 * - 2000ms delay between Google Trends calls to avoid rate limiting
 */

import { PrismaClient } from "@prisma/client";
import { getInterestOverTime, getRisingQueries } from "@/lib/googletrends/client";
import { googleTrends as searchApiTrends } from "@/lib/searchapi/client";
import { runTrackedJob } from '@/lib/jobs/tracker';

const db = new PrismaClient();

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_TRACKS_PER_RUN = 50;
const DELAY_MS = 2000;
const TRENDING_INTEREST_THRESHOLD = 40;
const STALE_DAYS = 14;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Fetch candidate tracks ────────────────────────────────────────────────────

interface TrackRow {
  id: number;
  title: string;
  artistName: string;
}

async function fetchCandidateTracks(): Promise<TrackRow[]> {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000);

  const tracks = await db.track.findMany({
    where: {
      updatedAt: { gte: cutoff },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_TRACKS_PER_RUN,
    select: {
      id: true,
      title: true,
      trackArtists: {
        orderBy: { position: "asc" },
        take: 1,
        select: {
          artist: { select: { name: true } },
        },
      },
    },
  });

  const results: TrackRow[] = [];
  for (const t of tracks) {
    const artistName = t.trackArtists[0]?.artist.name;
    if (!artistName) continue; // skip tracks with no artist
    results.push({ id: t.id, title: t.title, artistName });
  }

  return results;
}

// ─── Ingest single track ───────────────────────────────────────────────────────

async function ingestTrack(track: TrackRow, snapshotDate: Date): Promise<boolean> {
  const query = `${track.title} ${track.artistName}`;

  let result;
  try {
    result = await getInterestOverTime(query, "", 7);
  } catch {
    console.warn(`[googletrends] Unofficial API failed for "${query}", trying SearchAPI fallback…`);
    try {
      if (!process.env.SEARCHAPI_KEY) throw new Error('no SEARCHAPI_KEY');
      const raw = await searchApiTrends(query, '', 'now 7-d');
      const timeline = raw.interest_over_time?.timeline_data ?? [];
      const values = timeline.flatMap((d) => d.values.map((v) => v.extracted_value)).filter((v) => v > 0);
      const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      result = { averageInterest: avg, trend: avg > TRENDING_INTEREST_THRESHOLD ? 'rising' : 'stable' };
    } catch (fallbackErr) {
      console.warn(`[googletrends] SearchAPI fallback also failed for trackId=${track.id}:`, (fallbackErr as Error).message);
      return false;
    }
  }

  // Store as a platform stats row — averageInterest as streams proxy (0-100 scale)
  try {
    await db.trackPlatformStatsDaily.upsert({
      where: {
        trackId_platform_date: {
          trackId: track.id,
          platform: "google_trends",
          date: snapshotDate,
        },
      },
      create: {
        trackId: track.id,
        platform: "google_trends",
        date: snapshotDate,
        streams: BigInt(result.averageInterest),
      },
      update: {
        streams: BigInt(result.averageInterest),
      },
    });
  } catch (err) {
    console.warn(
      `[googletrends] Failed to upsert stats for trackId=${track.id}:`,
      (err as Error).message
    );
    return false;
  }

  // Flag rising tracks
  if (result.trend === "rising" && result.averageInterest > TRENDING_INTEREST_THRESHOLD) {
    console.log(
      `[googletrends] RISING TRACK — trackId=${track.id} ` +
        `"${track.title}" by ${track.artistName} | ` +
        `avg=${result.averageInterest} peak=${result.peakInterest} ` +
        `related=[${(result.relatedQueries ?? []).slice(0, 3).join(", ")}]`
    );
  }

  return true;
}

// ─── Rising music queries ──────────────────────────────────────────────────────

async function ingestRisingMusicQueries(): Promise<void> {
  console.log("[googletrends] Fetching rising music queries (category=35)…");

  let rising: string[];
  try {
    rising = await getRisingQueries("35");
  } catch (err) {
    console.warn(
      "[googletrends] Failed to fetch rising music queries:",
      (err as Error).message
    );
    return;
  }

  const top20 = rising.slice(0, 20);
  if (top20.length === 0) {
    console.log("[googletrends] No rising music queries returned");
    return;
  }

  console.log("[googletrends] Top 20 rising music search terms:");
  top20.forEach((q, i) => console.log(`  ${String(i + 1).padStart(2)}. ${q}`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Google Trends Ingestion Job ===");
  console.log(`Started at: ${new Date().toISOString()}`);

  const snapshotDate = toDateOnly(new Date());

  // 1. Fetch candidate tracks
  const tracks = await fetchCandidateTracks();
  console.log(
    `[googletrends] Processing ${tracks.length} tracks ` +
      `(updated in last ${STALE_DAYS} days, max ${MAX_TRACKS_PER_RUN})`
  );

  // 2. Ingest per-track interest data
  let processed = 0;
  let skipped = 0;

  for (const track of tracks) {
    console.log(
      `[googletrends] [${processed + skipped + 1}/${tracks.length}] ` +
        `trackId=${track.id} "${track.title}" by ${track.artistName}`
    );

    const ok = await ingestTrack(track, snapshotDate);
    if (ok) {
      processed++;
    } else {
      skipped++;
    }

    // Rate-limit: always sleep between calls
    await sleep(DELAY_MS);
  }

  console.log(
    `[googletrends] Per-track ingestion done — processed=${processed} skipped=${skipped}`
  );

  // 3. Fetch rising music queries (add an extra delay after the last track call)
  await sleep(DELAY_MS);
  await ingestRisingMusicQueries();

  console.log("\n=== Google Trends Ingestion Complete ===");
  console.log(`Completed at: ${new Date().toISOString()}`);

  await db.$disconnect();
}

runTrackedJob('ingest:googletrends', main).catch((err) => {
  console.error("[googletrends] Fatal error:", err);
  process.exit(1);
});
