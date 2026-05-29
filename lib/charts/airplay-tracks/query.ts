/**
 * @module lib/charts/airplay-tracks/query
 *
 * Raw database query functions for the airplay track chart.
 * All queries run against the `airplay_track_chart_snapshots`,
 * `airplay_track_chart_rows`, and `airplay_track_chart_rank_stats` tables.
 */

import { db } from '@/lib/db';
import { AirplayDuration, AirplayTrackChartParams } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the most recent snapshot date for a given duration + country combo.
 *
 * @param duration    - Chart duration key.
 * @param countryCode - ISO alpha-2 or "GLOBAL".
 * @returns The latest snapshot date string, or `null` when none exist.
 */
async function resolveLatestDate(
  duration: AirplayDuration,
  countryCode: string,
): Promise<string | null> {
  const result = await db.$queryRawUnsafe<Array<{ snapshot_date: string }>>(
    `SELECT snapshot_date
       FROM airplay_track_chart_snapshots
      WHERE duration     = $1
        AND country_code = $2
      ORDER BY snapshot_date DESC
      LIMIT 1`,
    duration,
    countryCode,
  );
  return result[0]?.snapshot_date ?? null;
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

/**
 * Fetches airplay track chart rows for the supplied validated parameters.
 *
 * Joins:
 *   `airplay_track_chart_snapshots`
 *   → `airplay_track_chart_rows`
 *   → `airplay_track_chart_rank_stats` (aggregated as JSON array)
 *
 * @param params - Validated chart parameters.
 * @returns Raw database rows (un-normalized).
 */
export async function queryAirplayTrackChart(
  params: AirplayTrackChartParams,
): Promise<any[]> {
  const { duration, date, since, limit, countryCode, cityId, latest } = params;

  // Determine the effective snapshot date.
  let effectiveDate: string | null = null;
  if (latest || date === null) {
    effectiveDate = await resolveLatestDate(duration, countryCode);
  } else {
    effectiveDate = date;
  }

  if (effectiveDate === null) {
    return [];
  }

  const args: unknown[] = [duration, countryCode, effectiveDate, limit];
  let argIdx = 5;

  let sinceClause = '';
  if (since !== null) {
    sinceClause = `AND s.snapshot_date >= $${argIdx}`;
    args.push(since);
    argIdx++;
  }

  let cityClause = '';
  if (cityId !== undefined) {
    cityClause = `AND r.city_id = $${argIdx}`;
    args.push(cityId);
    argIdx++;
  }

  const sql = `
    SELECT
      r.track_id,
      r.name,
      r.isrc,
      r.image_url,
      r.description,
      r.tags,
      r.artist_ids,
      r.artist_names,
      r.artist_code2s,
      r.artist_images,
      r.spotify_track_ids,
      r.spotify_album_ids,
      r.spotify_duration_ms,
      r.itunes_track_ids,
      r.itunes_album_ids,
      r.itunes_artist_ids,
      r.itunes_artist_names,
      r.storefronts,
      r.deezer_track_ids,
      r.deezer_album_ids,
      r.deezer_duration,
      r.amazon_track_ids,
      r.amazon_album_ids,
      r.album_ids,
      r.album_names,
      r.album_upc,
      r.album_label,
      r.release_dates,
      r.rank,
      r.pre_rank,
      r.peak_rank,
      r.peak_date,
      r.added_at,
      r.velocity,
      r.time_on_chart,
      r.code2,
      r.city_id,
      r.plays,
      r.count,
      r.weekly_count,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'rank',   rs.rank,
              'plays',  rs.plays::text,
              'timestp', rs.timestp
            )
            ORDER BY rs.timestp ASC
          )
          FROM airplay_track_chart_rank_stats rs
          WHERE rs.chart_row_id = r.id
        ),
        '[]'::json
      ) AS rank_stats
    FROM airplay_track_chart_snapshots s
    JOIN airplay_track_chart_rows r
      ON r.snapshot_id = s.id
    WHERE s.duration     = $1
      AND s.country_code = $2
      AND s.snapshot_date = $3
      ${sinceClause}
      ${cityClause}
    ORDER BY r.rank ASC
    LIMIT $4
  `;

  return db.$queryRawUnsafe<any[]>(sql, ...args);
}

/**
 * Returns all available snapshot dates for a given duration and country,
 * sorted descending (most recent first).
 *
 * @param duration    - Chart duration key.
 * @param countryCode - ISO alpha-2 or "GLOBAL".
 * @returns Sorted array of YYYY-MM-DD date strings.
 */
export async function queryAvailableAirplayDates(
  duration: AirplayDuration,
  countryCode: string,
): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ snapshot_date: string }>>(
    `SELECT DISTINCT snapshot_date
       FROM airplay_track_chart_snapshots
      WHERE duration     = $1
        AND country_code = $2
      ORDER BY snapshot_date DESC`,
    duration,
    countryCode,
  );
  return rows.map((r) => r.snapshot_date);
}

/**
 * Returns every country (code + name) that has at least one airplay snapshot.
 *
 * @returns Array of `{ code2, name }` objects sorted by name.
 */
export async function queryAirplayCountries(): Promise<
  Array<{ code2: string; name: string }>
> {
  return db.$queryRawUnsafe<Array<{ code2: string; name: string }>>(
    `SELECT DISTINCT s.country_code AS code2,
            COALESCE(c.name, s.country_code) AS name
       FROM airplay_track_chart_snapshots s
  LEFT JOIN countries c ON c.code2 = s.country_code
      ORDER BY name ASC`,
  );
}

/**
 * Returns all cities that have airplay chart coverage for the given country.
 *
 * @param countryCode - ISO alpha-2 country code or "GLOBAL".
 * @returns Array of `{ id, name, code2 }` objects sorted by name.
 */
export async function queryAirplayCities(
  countryCode: string,
): Promise<Array<{ id: number; name: string; code2: string }>> {
  return db.$queryRawUnsafe<Array<{ id: number; name: string; code2: string }>>(
    `SELECT DISTINCT ci.id,
            ci.name,
            ci.code2
       FROM airplay_track_chart_rows r
       JOIN airplay_track_chart_snapshots s ON s.id = r.snapshot_id
       JOIN cities ci ON ci.id = r.city_id
      WHERE s.country_code = $1
        AND r.city_id IS NOT NULL
      ORDER BY ci.name ASC`,
    countryCode,
  );
}
