import { db } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from the `external_ids` table, representing the mapping between
 * an internal canonical entity and its platform-specific identifier.
 */
export interface ExternalIdRecord {
  /** The platform that owns this identifier (e.g. `"spotify"`, `"apple_music"`). */
  platform: string;
  /** The platform-specific identifier string for this entity. */
  externalId: string;
  /** The entity type this identifier belongs to (e.g. `"track"`, `"artist"`, `"album"`). */
  entityType: string;
  /** The internal canonical ID for the entity. */
  canonicalId: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw-row shape returned directly from the DB driver
// ─────────────────────────────────────────────────────────────────────────────

interface ExternalIdRow {
  platform: string;
  external_id: string;
  entity_type: string;
  canonical_id: bigint | number;
}

function rowToRecord(row: ExternalIdRow): ExternalIdRecord {
  return {
    platform: row.platform,
    externalId: row.external_id,
    entityType: row.entity_type,
    canonicalId: Number(row.canonical_id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all external-ID mappings for a canonical entity, optionally filtered
 * to a single platform.
 *
 * @param canonicalId - The internal canonical ID of the entity.
 * @param entityType  - The entity type (e.g. `"track"`, `"artist"`, `"album"`).
 * @param platform    - Optional platform filter. When omitted, all platforms are returned.
 * @returns An array of {@link ExternalIdRecord} objects (empty array if none found).
 */
export async function resolveExternalIds(
  canonicalId: number,
  entityType: string,
  platform?: string,
): Promise<ExternalIdRecord[]> {
  let rows: ExternalIdRow[];

  if (platform !== undefined) {
    rows = await db.$queryRaw<ExternalIdRow[]>`
      SELECT platform, external_id, entity_type, canonical_id
      FROM external_ids
      WHERE canonical_id  = ${canonicalId}
        AND entity_type   = ${entityType}
        AND platform      = ${platform}
    `;
  } else {
    rows = await db.$queryRaw<ExternalIdRow[]>`
      SELECT platform, external_id, entity_type, canonical_id
      FROM external_ids
      WHERE canonical_id = ${canonicalId}
        AND entity_type  = ${entityType}
    `;
  }

  return rows.map(rowToRecord);
}

/**
 * Resolves a platform-specific external ID to its internal canonical ID.
 *
 * @param externalId - The platform-specific identifier.
 * @param platform   - The platform that owns this identifier.
 * @param entityType - The entity type (e.g. `"track"`, `"artist"`, `"album"`).
 * @returns The canonical ID as a `number`, or `null` if no mapping is found.
 */
export async function resolveCanonicalId(
  externalId: string,
  platform: string,
  entityType: string,
): Promise<number | null> {
  const rows = await db.$queryRaw<Pick<ExternalIdRow, 'canonical_id'>[]>`
    SELECT canonical_id
    FROM external_ids
    WHERE external_id = ${externalId}
      AND platform    = ${platform}
      AND entity_type = ${entityType}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  return Number(rows[0].canonical_id);
}

/**
 * Groups an array of {@link ExternalIdRecord} objects by their `platform` field,
 * collecting the associated `externalId` values into arrays.
 *
 * @param records - The records to group.
 * @returns An object mapping each platform name to its list of external IDs.
 *
 * @example
 * ```ts
 * const grouped = groupExternalIdsByPlatform(records);
 * // { spotify: ['4uLU6hMCjMI75M1A2tKUQC'], apple_music: ['123456'] }
 * ```
 */
export function groupExternalIdsByPlatform(
  records: ExternalIdRecord[],
): Record<string, string[]> {
  return records.reduce<Record<string, string[]>>((acc, record) => {
    if (!acc[record.platform]) {
      acc[record.platform] = [];
    }
    acc[record.platform].push(record.externalId);
    return acc;
  }, {});
}
