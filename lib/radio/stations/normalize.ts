/**
 * Normalizer for Radio Station database rows.
 */

import type { RadioStation } from './types';

/**
 * Converts a potentially-null numeric-ish value to a decimal string or null.
 * Handles BigInt, number, and string inputs.
 *
 * @param v - Raw value from the database.
 * @returns String representation or null.
 */
function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Converts a raw database row into a {@link RadioStation} shape.
 * Large social counts are serialized as strings to avoid JS precision loss.
 *
 * @param row - Raw database row from {@link queryRadioStations}.
 * @returns Normalized {@link RadioStation}.
 */
export function normalizeRadioStation(row: any): RadioStation {
  return {
    id: Number(row.id),
    name: row.name ?? '',
    genre: row.genre ?? null,
    frequency: row.frequency ?? null,
    market: row.market ?? null,
    broadcastArea: row.broadcastArea ?? null,
    country: row.country ?? null,
    stationState: row.stationState ?? null,
    imageUrl: row.imageUrl ?? null,
    aqh: row.aqh != null ? Number(row.aqh) : null,
    platform: row.platform ?? null,
    facebookFollowers: toStringOrNull(row.facebookFollowers),
    facebookLikes: toStringOrNull(row.facebookLikes),
    instagramFollowers: toStringOrNull(row.instagramFollowers),
    twitterFollowers: toStringOrNull(row.twitterFollowers),
    wikipediaViews: toStringOrNull(row.wikipediaViews),
  };
}
