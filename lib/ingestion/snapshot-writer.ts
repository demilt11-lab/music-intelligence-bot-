import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import type { ArtistMetrics } from "./types";

const SIGNAL_TTL_HOURS: Record<string, number> = {
  stream_velocity:   48,   // Spotify data: 48h max age
  tiktok_growth:     6,    // TikTok data: 6h max age (volatile)
  save_rate:         72,   // Save rate: 72h (changes slowly)
  follower_velocity: 24,   // Social: 24h
  chart_momentum:    168,  // Chart data: weekly refresh
  radio_spike:       168,  // Radio: weekly
  playlist_signal:   24,   // Playlist: daily
};

export interface FreshnessResult {
  signalType: string;
  lastUpdated: Date | null;
  ageHours: number;
  isStale: boolean;
  ttlHours: number;
}

export function checkSignalFreshness(
  signalType: string,
  lastUpdated: Date | null
): FreshnessResult {
  const ttlHours = SIGNAL_TTL_HOURS[signalType] ?? 24;
  if (!lastUpdated) {
    return { signalType, lastUpdated: null, ageHours: Infinity, isStale: true, ttlHours };
  }
  const ageHours = (Date.now() - lastUpdated.getTime()) / 3_600_000;
  return { signalType, lastUpdated, ageHours, isStale: ageHours > ttlHours, ttlHours };
}

export async function getNullifiedStaleSignals(
  artistId: number,
  prisma: PrismaClient
): Promise<Record<string, boolean>> {
  // Returns map of signalType → isStale for this artist's latest signals
  const signals = await prisma.predictionSignal.findMany({
    where: { entityType: "artist", entityId: artistId },
    orderBy: { recordedAt: "desc" },
    distinct: ["signalType"],
  });
  const result: Record<string, boolean> = {};
  for (const sig of signals) {
    const { isStale } = checkSignalFreshness(sig.signalType, sig.recordedAt);
    result[sig.signalType] = isStale;
  }
  return result;
}

const BATCH_SIZE = 500;

export async function writeSnapshots(
  metrics: ArtistMetrics[],
  source: string = "ingestion_cron"
): Promise<{ written: number; skipped: number; errors: number }> {
  let written = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map((m) => {
        const date = new Date(m.date);
        return prisma.artistDailySnapshot.upsert({
          where: { artistId_date: { artistId: m.artistId, date } },
          create: {
            artistId: m.artistId,
            date,
            streamVelocity: m.streamVelocity,
            playlistRate: m.playlistRate,
            ugcCount: m.ugcCount,
            followerGrowth: m.followerGrowth,
            saveRate: m.saveRate,
            skipRate: m.skipRate,
            tiktokUses7d: m.tiktokUses7d,
            preSaveCount: m.preSaveCount,
            radioSpins: m.radioSpins,
            chartRank: m.chartRank,
            source,
          },
          update: {
            streamVelocity: m.streamVelocity,
            playlistRate: m.playlistRate,
            ugcCount: m.ugcCount,
            followerGrowth: m.followerGrowth,
            saveRate: m.saveRate,
            skipRate: m.skipRate,
            tiktokUses7d: m.tiktokUses7d,
            preSaveCount: m.preSaveCount,
            radioSpins: m.radioSpins,
            chartRank: m.chartRank,
            source,
          },
        });
      })
    ).then(
      (results) => {
        written += results.length;
      },
      (err) => {
        // On batch transaction failure, count all as errors rather than skipped
        // (could be unique constraint or other DB error)
        const isUniqueConstraint =
          err?.code === "P2002" ||
          String(err).includes("Unique constraint");
        if (isUniqueConstraint) {
          skipped += batch.length;
        } else {
          errors += batch.length;
        }
      }
    );
  }

  return { written, skipped, errors };
}

export async function createIngestionJob(
  jobType: string,
  metadata?: Record<string, unknown>
): Promise<number> {
  const job = await prisma.ingestionJob.create({
    data: {
      jobType,
      status: "running",
      metadata: metadata ?? undefined,
    },
    select: { id: true },
  });
  return job.id;
}

export async function updateIngestionJob(
  jobId: number,
  update: Partial<{
    status: string;
    artistsDone: number;
    artistsFailed: number;
    errorLog: string;
    completedAt: Date;
    durationMs: number;
  }>
): Promise<void> {
  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: update,
  });
}
