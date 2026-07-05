// lib/ml/versioning.ts
//
// Model version history + one-step rollback. `MlModel` is the single active
// pointer per modelType; `MlModelVersion` is the append-only archive of every
// version ever promoted. Promotion snapshots the new version here first, so a
// bad promotion can always be reverted to a prior version — the gap the
// readiness review flagged ("no previous-model store").
import { db } from '@/lib/db';
import type { TrainedModel } from './regression';

export type StoredModelFields = {
  weights: TrainedModel;
  accuracy: number;
  nSamples: number;
  trainedAt: Date;
};

/**
 * Choose which version to roll back to. Pure so the (only interesting) logic is
 * unit-tested. If `toVersion` is given it must exist; otherwise pick the highest
 * version strictly below the active one (the immediate predecessor).
 */
export function pickRollbackVersion(
  versions: { version: number }[],
  activeVersion: number,
  toVersion?: number,
): number {
  const available = new Set(versions.map((v) => v.version));
  if (toVersion != null) {
    if (!available.has(toVersion)) {
      throw Object.assign(new Error(`version ${toVersion} not found in history`), { status: 404 });
    }
    return toVersion;
  }
  const predecessors = versions.map((v) => v.version).filter((v) => v < activeVersion).sort((a, b) => b - a);
  if (predecessors.length === 0) {
    throw Object.assign(new Error('no prior version to roll back to'), { status: 409 });
  }
  return predecessors[0];
}

/** Next version number for a model type (max existing + 1). */
async function nextVersion(modelType: string): Promise<number> {
  const latest = await db.mlModelVersion.findFirst({
    where: { modelType },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/**
 * Archive a freshly-trained model as a new version AND set it active. Replaces
 * the old inline `mlModel.upsert` in the trainers so every promotion is
 * recorded and reversible.
 */
export async function archiveAndPromote(
  modelType: string,
  fields: StoredModelFields,
  note = 'promoted',
): Promise<{ version: number }> {
  const version = await nextVersion(modelType);

  await db.mlModelVersion.create({
    data: {
      modelType,
      version,
      weights: fields.weights as any,
      accuracy: fields.accuracy,
      nSamples: fields.nSamples,
      trainedAt: fields.trainedAt,
      note,
    },
  });

  await db.mlModel.upsert({
    where: { modelType },
    update: { version, weights: fields.weights as any, accuracy: fields.accuracy, nSamples: fields.nSamples, trainedAt: fields.trainedAt },
    create: { modelType, version, weights: fields.weights as any, accuracy: fields.accuracy, nSamples: fields.nSamples, trainedAt: fields.trainedAt },
  });

  return { version };
}

export type RollbackResult = {
  modelType: string;
  restoredVersion: number;
  previousActiveVersion: number;
  accuracy: number;
};

/**
 * Roll the active model back to a prior version (defaults to the immediate
 * predecessor). The restored weights become active immediately; the event is
 * itself recorded as a new version so the history stays append-only and the
 * rollback is auditable.
 */
export async function rollbackModel(modelType: string, toVersion?: number): Promise<RollbackResult> {
  const active = await db.mlModel.findUnique({ where: { modelType } });
  if (!active) {
    throw Object.assign(new Error(`no active model for ${modelType}`), { status: 404 });
  }
  const versions = await db.mlModelVersion.findMany({ where: { modelType }, select: { version: true } });
  const target = pickRollbackVersion(versions, active.version, toVersion);

  const snapshot = await db.mlModelVersion.findUnique({
    where: { modelType_version: { modelType, version: target } },
  });
  if (!snapshot) {
    throw Object.assign(new Error(`version ${target} snapshot missing`), { status: 404 });
  }

  // Record the rollback as a new version so history is never rewritten.
  const newVersion = (await nextVersion(modelType));
  await db.mlModelVersion.create({
    data: {
      modelType, version: newVersion, weights: snapshot.weights as any,
      accuracy: snapshot.accuracy, nSamples: snapshot.nSamples, trainedAt: snapshot.trainedAt,
      note: `rollback to v${target}`,
    },
  });
  await db.mlModel.update({
    where: { modelType },
    data: { version: newVersion, weights: snapshot.weights as any, accuracy: snapshot.accuracy, nSamples: snapshot.nSamples, trainedAt: snapshot.trainedAt },
  });

  return {
    modelType,
    restoredVersion: target,
    previousActiveVersion: active.version,
    accuracy: snapshot.accuracy,
  };
}

export async function listModelVersions(modelType: string, limit = 20) {
  return db.mlModelVersion.findMany({
    where: { modelType },
    orderBy: { version: 'desc' },
    take: limit,
    select: { version: true, accuracy: true, nSamples: true, trainedAt: true, note: true, createdAt: true },
  });
}
