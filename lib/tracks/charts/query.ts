import { db } from '@/lib/db'

/**
 * Raw DB row shape returned by the chart-appearances join query.
 * All numeric fields that may come from a BigInt column are typed as
 * `bigint | number | null` and coerced to number/string during normalisation.
 */
export interface RawChartRow {
  rank: number | null
  pre_rank: number | null
  peak_rank: number | null
  peak_date: Date | string | null
  peak_plays: bigint | string | null
  total_plays: bigint | string | null
  plays: bigint | string | null
  duration: number | null
  added_at: Date | string | null
  code2: string | null
  chart_type: string
  track_id: bigint | number
  track_name: string
  isrc: string | null
  track_image_url: string | null
  artists_json: string | null
  album_id: bigint | number | null
  album_name: string | null
  album_upc: string | null
  album_release_date: Date | string | null
  album_label: string | null
  album_image_url: string | null
  external_ids_json: string | null
}

/**
 * Queries chart appearances for a specific track on a specific chart within a
 * date window.
 *
 * @param trackId - Internal track ID to filter by.
 * @param chartType - Chart type identifier to filter by.
 * @param since - ISO date string; inclusive lower bound on snapshot date.
 * @param until - ISO date string; inclusive upper bound on snapshot date.
 * @returns Array of raw DB rows.
 */
export async function queryTrackChartAppearances(
  trackId: number,
  chartType: string,
  since: string,
  until: string,
): Promise<RawChartRow[]> {
  return db.$queryRaw<RawChartRow[]>`
    SELECT
      cr.rank,
      cr.pre_rank,
      cr.peak_rank,
      cr.peak_date,
      cr.peak_plays::text AS peak_plays,
      cr.total_plays::text AS total_plays,
      cr.plays::text AS plays,
      cr.duration,
      cs.date::text AS added_at,
      cs.code2,
      cs.chart_type,
      t.id AS track_id,
      t.title AS track_name,
      t.isrc,
      t.image_url AS track_image_url,

      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'name', a.name,
            'imageUrl', a.image_url,
            'code2', a.code2
          )
          ORDER BY ta.position ASC
        )
        FROM track_artists ta
        JOIN artists a ON a.id = ta.artist_id
        WHERE ta.track_id = t.id
      )::text AS artists_json,

      al.id AS album_id,
      al.title AS album_name,
      al.upc AS album_upc,
      al.release_date::text AS album_release_date,
      al.label AS album_label,
      al.image_url AS album_image_url,

      (
        SELECT json_object_agg(ei.platform, ei.external_id)
        FROM external_ids ei
        WHERE ei.canonical_id = t.id
          AND ei.entity_type = 'track'
      )::text AS external_ids_json

    FROM chart_rows cr
    JOIN chart_snapshots cs ON cs.id = cr.snapshot_id
    JOIN tracks t ON t.id = cr.track_id
    LEFT JOIN track_albums tal
      ON tal.track_id = t.id
     AND tal.is_primary = TRUE
    LEFT JOIN albums al ON al.id = tal.album_id
    WHERE cr.track_id = ${trackId}
      AND cs.chart_type = ${chartType}
      AND cs.date >= ${since}::date
      AND cs.date <= ${until}::date
    ORDER BY cs.date ASC
  `
}
