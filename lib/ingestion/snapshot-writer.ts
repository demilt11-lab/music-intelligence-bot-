import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import type { ArtistMetrics } from "./types";
import { validateArtistMetrics } from "./validator";
import { logger } from "@/lib/monitoring/logger";
import metrics from "@/lib/monitoring/metrics";

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

// Tier 1 (<5 min), Tier 2 (<30 min), Tier 3 (<24 h) — SLA breach triggers metric
const SLA_TIER: Record<string, { tier: number; slaMinutes: number }> = {
  stream_velocity:   { tier: 1, slaMinutes: 5 },
  tiktok_growth:     { tier: 1, slaMinutes: 5 },
  save_rate:         { tier: 2, slaMinutes: 30 },
  follower_velocity: { tier: 2, slaMinutes: 30 },
  playlist_signal:   { tier: 2, slaMinutes: 30 },
  chart_momentum:    { tier: 3, slaMinutes: 1440 },
  radio_spike:       { tier: 3, slaMinutes: 1440 },
};

export function checkSignalFreshness(
  signalType: string,
  lastUpdated: Date | null
): FreshnessResult {
  const ttlHours = SIGNAL_TTL_HOURS[signalType] ?? 24;
  if (!lastUpdated) {
    return { signalType, lastUpdated: null, ageHours: Infinity, isStale: true, ttlHours };
  }
  const ageHours = (Date.now() - lastUpdated.getTime()) / 3_600_000;
  const result: FreshnessResult = { signalType, lastUpdated, ageHours, isStale: ageHours > ttlHours, ttlHours };

  // Emit SLA breach metric when data exceeds the per-tier freshness SLA
  const sla = SLA_TIER[signalType];
  if (sla && ageHours * 60 > sla.slaMinutes) {
    metrics.inc("pipeline_sla_breach_total", { signal: signalType, tier: String(sla.tier) });
    logger.warn("Signal freshness SLA breach", {
      signalType,
      ageMinutes: Math.round(ageHours * 60),
      slaMinutes: sla.slaMinutes,
      tier: sla.tier,
    });
  }

  return result;
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

function buildUpsert(m: ArtistMetrics, source: string) {
  const date = new Date(m.date);
  const fields = {
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
  };
  return prisma.artistDailySnapshot.upsert({
    where: { artistId_date: { artistId: m.artistId, date } },
    create: { artistId: m.artistId, date, ...fields },
    update: fields,
  });
}

export async function writeSnapshots(
  records: ArtistMetrics[],
  source: string = "ingestion_cron"
): Promise<{ written: number; skipped: number; errors: number; invalidated: number }> {
  let written = 0;
  let skipped = 0;
  let errors = 0;
  let invalidated = 0;

  // Validate before writing — reject records that fail range checks
  const valid: ArtistMetrics[] = [];
  for (const m of records) {
    const result = validateArtistMetrics(m);
    if (!result.valid) {
      invalidated++;
      metrics.inc("pipeline_validation_failures_total", { source });
      logger.warn("Artist metrics failed validation — skipping write", {
        artistId: m.artistId,
        violations: result.violations.map((v) => `${v.field}: ${v.rule}`),
      });
    } else {
      valid.push(m);
    }
  }

  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);

    let batchSucceeded = false;
    try {
      const results = await prisma.$transaction(batch.map((m) => buildUpsert(m, source)));
      written += results.length;
      batchSucceeded = true;
    } catch (batchErr) {
      // Batch failed — fall back to per-record upserts to isolate the bad row
      logger.warn("Batch write failed, falling back to per-record upserts", {
        batchSize: batch.length,
        error: String(batchErr),
      });
    }

    if (!batchSucceeded) {
      for (const m of batch) {
        try {
          await buildUpsert(m, source);
          written++;
        } catch (rowErr) {
          const isConflict =
            (rowErr as { code?: string })?.code === "P2002" ||
            String(rowErr).includes("Unique constraint");
          if (isConflict) {
            skipped++;
          } else {
            errors++;
            logger.debug("Row write failed", { artistId: m.artistId, error: String(rowErr) });
          }
        }
      }
    }
  }

  metrics.inc("pipeline_snapshots_written_total", { source }, written);
  if (errors > 0) metrics.inc("pipeline_snapshot_errors_total", { source }, errors);

  return { written, skipped, errors, invalidated };
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
