/**
 * Shazam ingestion job
 *
 * - Fetches Shazam Top 200 charts for 10 markets: US, GB, AU, CA, BR, DE, FR, MX, NG, KR
 * - For each chart track:
 *   - Resolves to a canonical Track via ISRC match or title/artist fuzzy match
 *   - Upserts chart_snapshots (chartName='shazam_top_200', platform='shazam') + chart_rows
 *   - Upserts track_statistics_latest — stores shazamCount in youtubeViews field
 *     (schema has no dedicated shazam field; see note below)
 * - 500ms delay between market fetches
 *
 * Shazam count (numberOfShazams) is written to TrackStatisticsLatest.shazamCount
 * so it flows into the talent-scout view and viral scoring alongside YouTube
 * views and TikTok creations.
 */

import { db } from "@/lib/db";
import { getShazamCharts, ShazamChartTrack } from "@/lib/shazam/client";
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Config ───────────────────────────────────────────────────────────────────

const MARKETS = ["US", "GB", "AU", "CA", "BR", "DE", "FR", "MX", "NG", "KR"] as const;
type Market = (typeof MARKETS)[number];

const CHART_NAME = "shazam_top_200";
const PLATFORM = "shazam";
const DELAY_MS = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Track resolver ────────────────────────────────────────────────────────────

interface ResolvedTrack {
  trackId: number;
  isNew: boolean;
}

/**
 * Resolve a Shazam chart track to a canonical DB track.
 *
 * Resolution order:
 *   1. ISRC match (ExternalId with platform='isrc' OR track.isrc field)
 *   2. Fuzzy title + artist match against existing tracks
 *   3. Create stub Track + Artist + TrackArtist + ExternalId(shazam)
 */
async function resolveShazamTrack(raw: ShazamChartTrack): Promise<ResolvedTrack> {
  // 1a. Look for existing shazam ExternalId
  const shazamExt = await db.externalId.findFirst({
    where: {
      entityType: "track",
      platform: "shazam",
      externalId: raw.shazamId,
    },
  });
  if (shazamExt) {
    return { trackId: shazamExt.entityId, isNew: false };
  }

  // 1b. ISRC match via track.isrc field
  if (raw.isrc) {
    const byIsrc = await db.track.findFirst({
      where: { isrc: raw.isrc },
      select: { id: true },
    });
    if (byIsrc) {
      // Attach shazam ExternalId for future lookups
      await db.externalId
        .create({
          data: {
            entityType: "track",
            entityId: byIsrc.id,
            platform: "shazam",
            externalId: raw.shazamId,
          },
        })
        .catch(() => {
          // ignore unique constraint violation on re-runs
        });
      return { trackId: byIsrc.id, isNew: false };
    }
  }

  // 2. Fuzzy title + artist match
  const normTitle = normalise(raw.title);
  const normArtist = normalise(raw.artist);

  if (normTitle && normArtist) {
    const titleToken = normTitle.split(" ")[0];
    const candidates = await db.track.findMany({
      where: {
        title: { contains: titleToken, mode: "insensitive" },
      },
      include: {
        trackArtists: { include: { artist: true } },
        externalIds: { where: { platform: "shazam" } },
      },
      take: 50,
    });

    for (const candidate of candidates) {
      if (candidate.externalIds.length > 0) continue; // already has a shazam id

      if (normalise(candidate.title) !== normTitle) continue;

      const artistMatch = candidate.trackArtists.some(
        (ta) => normalise(ta.artist.name) === normArtist
      );
      if (!artistMatch) continue;

      // Attach shazam ExternalId
      await db.externalId
        .create({
          data: {
            entityType: "track",
            entityId: candidate.id,
            platform: "shazam",
            externalId: raw.shazamId,
          },
        })
        .catch(() => {});

      return { trackId: candidate.id, isNew: false };
    }
  }

  // 3. Create stub track + artist
  const track = await db.track.create({
    data: {
      title: raw.title,
      ...(raw.isrc ? { isrc: raw.isrc } : {}),
    },
  });

  const artistSlug =
    normalise(raw.artist).replace(/\s+/g, "-") || `shazam-${raw.shazamId}`;

  let artist = await db.artist.findFirst({
    where: { name: { equals: raw.artist, mode: "insensitive" } },
  });

  if (!artist) {
    const existingSlug = await db.artist.findUnique({ where: { slug: artistSlug } });
    const finalSlug = existingSlug ? `${artistSlug}-${track.id}` : artistSlug;

    artist = await db.artist.create({
      data: { name: raw.artist, slug: finalSlug },
    });
  }

  await db.trackArtist.create({
    data: {
      trackId: track.id,
      artistId: artist.id,
      role: "main",
      position: 0,
    },
  });

  await db.externalId.create({
    data: {
      entityType: "track",
      entityId: track.id,
      platform: "shazam",
      externalId: raw.shazamId,
    },
  });

  return { trackId: track.id, isNew: true };
}

// ─── Market ingestion ─────────────────────────────────────────────────────────

interface MarketStats {
  market: Market;
  fetched: number;
  resolved: number;
  stubsCreated: number;
  errors: number;
}

async function ingestMarket(market: Market, snapshotDate: Date): Promise<MarketStats> {
  const stats: MarketStats = {
    market,
    fetched: 0,
    resolved: 0,
    stubsCreated: 0,
    errors: 0,
  };

  console.log(`[shazam] Fetching chart for market=${market}…`);

  let chartTracks: ShazamChartTrack[];
  try {
    chartTracks = await getShazamCharts(market, 200);
  } catch (err) {
    console.error(
      `[shazam] Failed to fetch chart for market=${market}:`,
      (err as Error).message
    );
    stats.errors++;
    return stats;
  }

  stats.fetched = chartTracks.length;
  console.log(`[shazam] Got ${chartTracks.length} tracks for market=${market}`);

  if (chartTracks.length === 0) {
    return stats;
  }

  // Upsert chart snapshot
  let snapshot: { id: number };
  try {
    snapshot = await db.chartSnapshot.upsert({
      where: {
        chartName_platform_countryCode_snapshotDate: {
          chartName: CHART_NAME,
          platform: PLATFORM,
          countryCode: market,
          snapshotDate,
        },
      },
      create: {
        chartName: CHART_NAME,
        platform: PLATFORM,
        countryCode: market,
        snapshotDate,
      },
      update: {},
      select: { id: true },
    });
  } catch (err) {
    console.error(
      `[shazam] Failed to upsert snapshot for market=${market}:`,
      (err as Error).message
    );
    stats.errors++;
    return stats;
  }

  // Process each chart track
  for (const raw of chartTracks) {
    let resolved: ResolvedTrack;
    try {
      resolved = await resolveShazamTrack(raw);
    } catch (err) {
      console.warn(
        `[shazam] Resolve failed for shazamId=${raw.shazamId} "${raw.title}":`,
        (err as Error).message
      );
      stats.errors++;
      continue;
    }

    if (resolved.isNew) {
      stats.stubsCreated++;
      console.log(
        `[shazam] Created stub trackId=${resolved.trackId} "${raw.title}" by ${raw.artist}`
      );
    }

    // Upsert chart row
    try {
      await db.chartRow.upsert({
        where: {
          snapshotId_rank: {
            snapshotId: snapshot.id,
            rank: raw.rank,
          },
        },
        create: {
          snapshotId: snapshot.id,
          trackId: resolved.trackId,
          rank: raw.rank,
        },
        update: {
          trackId: resolved.trackId,
        },
      });
    } catch (err) {
      console.warn(
        `[shazam] Failed to upsert chart row rank=${raw.rank} market=${market}:`,
        (err as Error).message
      );
      stats.errors++;
      continue;
    }

    // Write shazam count to latest stats table so it's available for scoring
    if (raw.shazamCount != null && raw.shazamCount > 0) {
      try {
        await db.trackStatisticsLatest.upsert({
          where: { trackId: resolved.trackId },
          create: { trackId: resolved.trackId, shazamCount: BigInt(raw.shazamCount) },
          update: { shazamCount: BigInt(raw.shazamCount) },
        });
      } catch (err) {
        console.warn(
          `[shazam] Failed to upsert shazamCount trackId=${resolved.trackId}: ${(err as Error).message}`
        );
      }
    }

    stats.resolved++;
  }

  console.log(
    `[shazam] market=${market} — resolved=${stats.resolved} ` +
      `stubs=${stats.stubsCreated} errors=${stats.errors}`
  );

  return stats;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Shazam Ingestion Job ===");
  console.log(`Started at: ${new Date().toISOString()}`);

  if (!process.env.SHAZAM_API_KEY) {
    throw new Error("Required environment variable SHAZAM_API_KEY is not set");
  }
  if (!process.env.SHAZAM_BASE_URL) {
    throw new Error("Required environment variable SHAZAM_BASE_URL is not set");
  }

  const snapshotDate = toDateOnly(new Date());
  const allStats: MarketStats[] = [];

  for (let i = 0; i < MARKETS.length; i++) {
    const market = MARKETS[i];
    const stats = await ingestMarket(market, snapshotDate);
    allStats.push(stats);

    if (i < MARKETS.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Summary
  console.log("\n=== Shazam Ingestion Summary ===");
  let totalFetched = 0;
  let totalResolved = 0;
  let totalStubs = 0;
  let totalErrors = 0;

  for (const s of allStats) {
    console.log(
      `  ${s.market.padEnd(4)} fetched=${s.fetched} resolved=${s.resolved} ` +
        `stubs=${s.stubsCreated} errors=${s.errors}`
    );
    totalFetched += s.fetched;
    totalResolved += s.resolved;
    totalStubs += s.stubsCreated;
    totalErrors += s.errors;
  }

  console.log(
    `\n  TOTAL fetched=${totalFetched} resolved=${totalResolved} ` +
      `stubs=${totalStubs} errors=${totalErrors}`
  );
  console.log(`Completed at: ${new Date().toISOString()}`);

  await db.$disconnect();

  if (totalErrors > 0) {
    console.warn(`\nCompleted with ${totalErrors} error(s).`);
  }
}

runTrackedJob('ingest:shazam', main).catch((err) => {
  console.error("[shazam] Fatal error:", err);
  process.exit(1);
});
