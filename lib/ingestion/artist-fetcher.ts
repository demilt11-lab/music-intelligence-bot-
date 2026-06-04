import { prisma } from "@/lib/prisma";
import type { ArtistMetrics } from "./types";
import { logger } from "@/lib/monitoring/logger";

/**
 * Fetch the latest value for a given signalType from PredictionSignal
 * for the specified artistId within the last 30 days.
 */
async function getLatestSignalValue(
  artistId: number,
  signalType: string,
  since: Date
): Promise<number | null> {
  const signal = await prisma.predictionSignal.findFirst({
    where: {
      entityType: "artist",
      entityId: artistId,
      signalType,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: "desc" },
    select: { value: true },
  });
  return signal?.value ?? null;
}

export async function fetchArtistMetrics(
  artistId: number,
  date: Date = new Date()
): Promise<ArtistMetrics> {
  const since = new Date(date);
  since.setDate(since.getDate() - 30);

  // Fetch all relevant signal types in parallel
  const [
    streamVelocityRaw,
    playlistRateRaw,
    tiktokGrowthRaw,
    followerVelocityRaw,
    saveRateRaw,
    skipRateRaw,
    radioSpikeRaw,
  ] = await Promise.all([
    getLatestSignalValue(artistId, "stream_velocity", since),
    getLatestSignalValue(artistId, "playlist_add", since),
    getLatestSignalValue(artistId, "tiktok_growth", since),
    getLatestSignalValue(artistId, "follower_velocity", since),
    getLatestSignalValue(artistId, "save_rate", since),
    getLatestSignalValue(artistId, "skip_rate", since),
    getLatestSignalValue(artistId, "radio_spike", since),
  ]);

  // Log missing signals at debug level
  const missing: string[] = [];
  if (streamVelocityRaw === null) missing.push("stream_velocity");
  if (playlistRateRaw === null) missing.push("playlist_add");
  if (tiktokGrowthRaw === null) missing.push("tiktok_growth");
  if (followerVelocityRaw === null) missing.push("follower_velocity");
  if (saveRateRaw === null) missing.push("save_rate");
  if (skipRateRaw === null) missing.push("skip_rate");
  if (radioSpikeRaw === null) missing.push("radio_spike");
  if (missing.length > 0) {
    logger.debug("Missing signals for artist", { artistId, missing });
  }

  // Derive best chart rank from ChartRow within last 14 days
  const fourteenDaysAgo = new Date(date);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  let chartRank: number | null = null;
  try {
    // Find all tracks for this artist, then best chart rank in last 14d
    const trackIds = await prisma.trackArtist.findMany({
      where: { artistId },
      select: { trackId: true },
    });
    if (trackIds.length > 0) {
      const ids = trackIds.map((t) => t.trackId);
      const bestRow = await prisma.chartRow.findFirst({
        where: {
          trackId: { in: ids },
          snapshot: {
            snapshotDate: { gte: fourteenDaysAgo },
          },
        },
        orderBy: { rank: "asc" },
        select: { rank: true },
      });
      chartRank = bestRow?.rank ?? null;
    }
  } catch (err) {
    logger.debug("Failed to fetch chart rank for artist", { artistId, error: String(err) });
  }

  const isoDate = date.toISOString().slice(0, 10);

  return {
    artistId,
    date: isoDate,
    streamVelocity: streamVelocityRaw,
    playlistRate: playlistRateRaw,
    ugcCount: tiktokGrowthRaw !== null ? Math.round(tiktokGrowthRaw * 10000) : null,
    followerGrowth: followerVelocityRaw,
    saveRate: saveRateRaw,
    skipRate: skipRateRaw !== null ? 1 - skipRateRaw : null,
    tiktokUses7d: tiktokGrowthRaw !== null ? Math.round(tiktokGrowthRaw) : null,
    preSaveCount: null,  // not available from PredictionSignal
    radioSpins: radioSpikeRaw !== null ? Math.round(radioSpikeRaw * 100) : null,
    chartRank,
  };
}

export async function fetchArtistMetricsBatch(
  artistIds: number[],
  date: Date,
  concurrency: number = 20
): Promise<Map<number, ArtistMetrics | Error>> {
  const results = new Map<number, ArtistMetrics | Error>();

  // Process in chunks of `concurrency`
  for (let i = 0; i < artistIds.length; i += concurrency) {
    const chunk = artistIds.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      chunk.map((id) => fetchArtistMetrics(id, date))
    );
    for (let j = 0; j < chunk.length; j++) {
      const artistId = chunk[j];
      const result = settled[j];
      if (result.status === "fulfilled") {
        results.set(artistId, result.value);
      } else {
        results.set(artistId, result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
      }
    }
  }

  return results;
}
