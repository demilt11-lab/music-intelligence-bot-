import { prisma } from "@/lib/prisma";
import type { ArtistMetrics } from "./types";
import { logger } from "@/lib/monitoring/logger";

function classifySignalSource(dbSource: string | null): string {
  if (!dbSource) return "unknown";
  const s = dbSource.toLowerCase();
  if (s.includes("tiktok") && s.includes("official")) return "tiktok_business";
  if (s.includes("unofficial") || s.includes("har") || s.includes("scrape")) return "unofficial";
  if (s.includes("spotify") || s.includes("official")) return "official";
  if (s.includes("distrokid") || s.includes("tunecore") || s.includes("distributor")) return "distributor";
  return "unknown";
}

export interface ArtistMetricsWithSources extends ArtistMetrics {
  signalSources: Record<string, string>;  // signalType → source classification
  sourceCompleteness: number;             // 0-1: fraction of expected signals present
}

const EXPECTED_SIGNALS = [
  "stream_velocity", "tiktok_growth", "save_rate", "follower_velocity",
  "chart_momentum", "playlist_add", "radio_spike", "skip_rate_inv",
];

/**
 * Fetch the latest value and source for a given signalType from PredictionSignal
 * for the specified artistId within the last 30 days.
 */
async function getLatestSignalRecord(
  artistId: number,
  signalType: string,
  since: Date
): Promise<{ value: number; source: string | null } | null> {
  const signal = await prisma.predictionSignal.findFirst({
    where: {
      entityType: "artist",
      entityId: artistId,
      signalType,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: "desc" },
    select: { value: true, source: true },
  });
  if (!signal) return null;
  return { value: signal.value, source: signal.source ?? null };
}

export async function fetchArtistMetrics(
  artistId: number,
  date: Date = new Date()
): Promise<ArtistMetricsWithSources> {
  const since = new Date(date);
  since.setDate(since.getDate() - 30);

  // Fetch all relevant signal types in parallel
  const [
    streamVelocityRec,
    playlistRateRec,
    tiktokGrowthRec,
    followerVelocityRec,
    saveRateRec,
    skipRateRec,
    radioSpikeRec,
  ] = await Promise.all([
    getLatestSignalRecord(artistId, "stream_velocity", since),
    getLatestSignalRecord(artistId, "playlist_add", since),
    getLatestSignalRecord(artistId, "tiktok_growth", since),
    getLatestSignalRecord(artistId, "follower_velocity", since),
    getLatestSignalRecord(artistId, "save_rate", since),
    getLatestSignalRecord(artistId, "skip_rate", since),
    getLatestSignalRecord(artistId, "radio_spike", since),
  ]);

  const streamVelocityRaw = streamVelocityRec?.value ?? null;
  const playlistRateRaw = playlistRateRec?.value ?? null;
  const tiktokGrowthRaw = tiktokGrowthRec?.value ?? null;
  const followerVelocityRaw = followerVelocityRec?.value ?? null;
  const saveRateRaw = saveRateRec?.value ?? null;
  const skipRateRaw = skipRateRec?.value ?? null;
  const radioSpikeRaw = radioSpikeRec?.value ?? null;

  // Build signalSources map from DB source fields
  const signalSources: Record<string, string> = {};
  if (streamVelocityRec) signalSources["stream_velocity"] = classifySignalSource(streamVelocityRec.source);
  if (playlistRateRec) signalSources["playlist_add"] = classifySignalSource(playlistRateRec.source);
  if (tiktokGrowthRec) signalSources["tiktok_growth"] = classifySignalSource(tiktokGrowthRec.source);
  if (followerVelocityRec) signalSources["follower_velocity"] = classifySignalSource(followerVelocityRec.source);
  if (saveRateRec) signalSources["save_rate"] = classifySignalSource(saveRateRec.source);
  if (skipRateRec) signalSources["skip_rate_inv"] = classifySignalSource(skipRateRec.source);
  if (radioSpikeRec) signalSources["radio_spike"] = classifySignalSource(radioSpikeRec.source);

  const available = EXPECTED_SIGNALS.filter(s => signalSources[s] !== undefined);
  const sourceCompleteness = available.length / EXPECTED_SIGNALS.length;

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
    signalSources,
    sourceCompleteness,
  };
}

export async function fetchArtistMetricsBatch(
  artistIds: number[],
  date: Date,
  concurrency: number = 20
): Promise<Map<number, ArtistMetricsWithSources | Error>> {
  const results = new Map<number, ArtistMetricsWithSources | Error>();

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
