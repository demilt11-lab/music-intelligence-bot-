/**
 * Luminate ingestion job
 *
 * Fetches 7-day stream, sales, and airplay data from Luminate for every
 * track that has a platform='luminate' ExternalId entry, then:
 *   - Stores daily rows in luminate_streams / luminate_sales / luminate_airplay
 *   - Aggregates 7-day stream total and upserts TrackStatisticsLatest.totalStreams
 *
 * Required env vars:
 *   LUMINATE_BASE_URL  — e.g. https://api.luminatedata.com/v1
 *   LUMINATE_API_KEY   — Bearer token
 *   DATABASE_URL
 */

import { db } from '@/lib/db';
import {
  ingestStreamsForEntity,
  ingestSalesForEntity,
  ingestAirplayForEntity,
} from '@/lib/luminate/ingest';
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Config ───────────────────────────────────────────────────────────────────

const DELAY_MS = 300;
const LOOKBACK_DAYS = 7;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<{ rowsWritten: number }> {
  if (!process.env.LUMINATE_BASE_URL) {
    throw new Error('Required env var LUMINATE_BASE_URL is not set');
  }
  if (!process.env.LUMINATE_API_KEY) {
    throw new Error('Required env var LUMINATE_API_KEY is not set');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Required env var DATABASE_URL is not set');
  }

  const today = toDateOnly(new Date());
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - LOOKBACK_DAYS);

  const params = {
    start_date: dateString(startDate),
    end_date: dateString(today),
  };

  console.log(`[luminate] Fetching data ${params.start_date} → ${params.end_date}`);

  // All tracks with a Luminate entity ID
  const externalIds = await db.externalId.findMany({
    where: { platform: 'luminate', entityType: 'track' },
    select: { externalId: true, entityId: true },
  });

  if (externalIds.length === 0) {
    console.log('[luminate] No tracks with Luminate external IDs found — nothing to ingest');
    return { rowsWritten: 0 };
  }

  console.log(`[luminate] Processing ${externalIds.length} tracks`);

  let streamsWritten = 0;
  let salesWritten = 0;
  let airplayWritten = 0;
  let errors = 0;

  for (const entry of externalIds) {
    const luminateId = entry.externalId;
    const trackId = entry.entityId;
    const songPath = `/song/${luminateId}/streams`;

    // ── Streams ──────────────────────────────────────────────────────────────
    try {
      const records = await ingestStreamsForEntity({
        luminatePath: songPath,
        params,
        entityType: 'song',
        entityId: trackId,
      });

      // Aggregate to update TrackStatisticsLatest
      if (records.length > 0) {
        const totalStreams = records.reduce(
          (sum, r) => sum + BigInt(r.streams || '0'),
          BigInt(0),
        );

        if (totalStreams > BigInt(0)) {
          await db.trackStatisticsLatest.upsert({
            where: { trackId },
            create: { trackId, totalStreams },
            update: { totalStreams },
          });
        }

        streamsWritten += records.length;
      }
    } catch (err) {
      console.warn(
        `[luminate] streams failed for luminateId=${luminateId} trackId=${trackId}:`,
        (err as Error).message,
      );
      errors++;
    }

    await sleep(DELAY_MS);

    // ── Sales ────────────────────────────────────────────────────────────────
    try {
      const records = await ingestSalesForEntity({
        luminatePath: `/song/${luminateId}/sales`,
        params,
        entityType: 'song',
        entityId: trackId,
      });
      salesWritten += records.length;
    } catch (err) {
      console.warn(
        `[luminate] sales failed for luminateId=${luminateId} trackId=${trackId}:`,
        (err as Error).message,
      );
      errors++;
    }

    await sleep(DELAY_MS);

    // ── Airplay ──────────────────────────────────────────────────────────────
    try {
      const records = await ingestAirplayForEntity({
        luminatePath: `/song/${luminateId}/airplay`,
        params,
        entityType: 'song',
        entityId: trackId,
      });
      airplayWritten += records.length;
    } catch (err) {
      console.warn(
        `[luminate] airplay failed for luminateId=${luminateId} trackId=${trackId}:`,
        (err as Error).message,
      );
      errors++;
    }

    await sleep(DELAY_MS);
  }

  const rowsWritten = streamsWritten + salesWritten + airplayWritten;

  console.log(
    `[luminate] Done — streams=${streamsWritten} sales=${salesWritten} ` +
      `airplay=${airplayWritten} errors=${errors}`,
  );

  if (errors > 0) {
    console.warn(`[luminate] Completed with ${errors} error(s)`);
  }

  await db.$disconnect();

  return { rowsWritten };
}

runTrackedJob('ingest:luminate', main).catch((err) => {
  console.error('[luminate] Fatal error:', err);
  process.exit(1);
});
