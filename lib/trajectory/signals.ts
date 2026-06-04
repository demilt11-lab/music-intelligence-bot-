// Signal ingestion and retrieval
import { z } from 'zod';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/shared/errors';
import { TrajectorySignal } from './types';
import { invalidateCache } from './model';

const VALID_ENTITY_TYPES = ['track', 'artist'] as const;
const VALID_SIGNAL_TYPES = [
  'stream_velocity',
  'tiktok_growth',
  'chart_entry',
  'playlist_add',
  'radio_spike',
] as const;

const TrajectorySignalInputSchema = z.object({
  entityType: z.enum(VALID_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  signalType: z.enum(VALID_SIGNAL_TYPES),
  value: z.number().finite(),
  recordedAt: z.coerce.date(),
  source: z.string().optional(),
});

export type TrajectorySignalInput = z.infer<typeof TrajectorySignalInputSchema>;

export function validateSignal(s: unknown): asserts s is TrajectorySignalInput {
  TrajectorySignalInputSchema.parse(s);
}

/**
 * Bulk upserts signals to prediction_signals table.
 * Returns count inserted.
 * After insert, invalidates trajectory cache for affected entities.
 */
export async function ingestSignals(
  signals: Omit<TrajectorySignal, 'id'>[],
): Promise<number> {
  if (signals.length === 0) return 0;

  // Validate all signals
  for (const signal of signals) {
    validateSignal(signal);
  }

  // Deduplicate affected entities
  const affectedEntities = new Map<string, { entityType: 'track' | 'artist'; entityId: number }>();
  for (const signal of signals) {
    const key = `${signal.entityType}:${signal.entityId}`;
    affectedEntities.set(key, {
      entityType: signal.entityType as 'track' | 'artist',
      entityId: signal.entityId,
    });
  }

  let count = 0;
  try {
    const result = await db.predictionSignal.createMany({
      data: signals.map((s) => ({
        entityType: s.entityType,
        entityId: s.entityId,
        signalType: s.signalType,
        value: s.value,
        source: s.source ?? null,
        recordedAt: s.recordedAt,
      })),
      skipDuplicates: true,
    });
    count = result.count;
  } catch (err) {
    throw new ApiError('Failed to ingest signals', 500, 'INTERNAL_ERROR');
  }

  // Invalidate caches for affected entities (fire-and-forget)
  Promise.allSettled(
    Array.from(affectedEntities.values()).map(({ entityType, entityId }) =>
      invalidateCache(entityType, entityId),
    ),
  ).catch(() => {});

  return count;
}

/**
 * Fetches signals for an entity, optionally filtered by date.
 */
export async function getSignals(
  entityType: string,
  entityId: number,
  since?: Date,
): Promise<TrajectorySignal[]> {
  try {
    const rows = await db.predictionSignal.findMany({
      where: {
        entityType,
        entityId,
        ...(since ? { recordedAt: { gte: since } } : {}),
      },
      orderBy: { recordedAt: 'desc' },
    });

    return rows.map((row) => ({
      entityType: row.entityType as TrajectorySignal['entityType'],
      entityId: row.entityId,
      signalType: row.signalType as TrajectorySignal['signalType'],
      value: row.value,
      recordedAt: row.recordedAt,
      source: row.source ?? undefined,
    }));
  } catch (err) {
    throw new ApiError('Failed to fetch signals', 500, 'INTERNAL_ERROR');
  }
}
