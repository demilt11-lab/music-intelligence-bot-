/**
 * YouTube Shorts Chart – database queries.
 * @module lib/charts/youtube-shorts/query
 */

import { db } from '@/lib/db';
import { YouTubeShortsChartParams, YouTubeShortsChartType } from './types';

/**
 * Queries the YouTube Shorts chart from the database.
 *
 * Joins:
 * - `youtube_shorts_chart_snapshots` – one row per chart type × country × date.
 * - `youtube_shorts_chart_rows`      – one row per track × snapshot.
 * - Artist and album data via subqueries.
 *
 * When `params.latest` is true the most recent snapshot matching the chart type
 * and country is used automatically.
 *
 * @param params - Validated chart parameters.
 * @returns Array of raw database rows.
 */
export async function queryYouTubeShortsChart(
  params: YouTubeShortsChartParams,
): Promise<any[]> {
  if (params.latest) {
    return db.$queryRaw<any[]>`
      WITH latest_snap AS (
        SELECT id, date::text AS charted_date, country
        FROM   youtube_shorts_chart_snapshots
        WHERE  chart_type = ${params.chartType}
          AND  country    = ${params.code2}
        ORDER  BY date DESC
        LIMIT  1
      )
      SELECT
        r.track_id,
        r.name,
        r.rank,
        r.rank_diff,
        r.image_url,
        r.isrc,
        r.genre,
        r.is_chart_genre,
        r.youtube_views::text  AS youtube_views,
        s.country,
        s.charted_date,
        -- External YouTube ID (first match)
        (
          SELECT e.external_id
          FROM   external_ids e
          WHERE  e.canonical_id = r.track_id
            AND  e.entity_type  = 'youtube_track'
          LIMIT  1
        )                      AS external_youtube_id,
        -- Artists as JSON array
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'artistId', a.id,
              'name',     a.name,
              'code2',    a.code2,
              'imageUrl', a.image_url
            ) ORDER BY ta.position
          ), '[]'::json)
          FROM   track_artists ta
          JOIN   artists       a ON a.id = ta.artist_id
          WHERE  ta.track_id = r.track_id
        )::text                AS artists_json,
        -- Album as JSON object (first/primary album)
        (
          SELECT json_build_object(
            'albumId',     al.id,
            'name',        al.name,
            'label',       al.label,
            'releaseDate', al.release_date::text
          )
          FROM   track_albums ta2
          JOIN   albums       al ON al.id = ta2.album_id
          WHERE  ta2.track_id = r.track_id
          ORDER  BY ta2.is_primary DESC, al.id ASC
          LIMIT  1
        )::text                AS album_json
      FROM   youtube_shorts_chart_rows r
      JOIN   latest_snap               s ON s.id = r.snapshot_id
      ORDER  BY r.rank ASC
      LIMIT  ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  return db.$queryRaw<any[]>`
    SELECT
      r.track_id,
      r.name,
      r.rank,
      r.rank_diff,
      r.image_url,
      r.isrc,
      r.genre,
      r.is_chart_genre,
      r.youtube_views::text  AS youtube_views,
      s.country,
      s.date::text           AS charted_date,
      -- External YouTube ID (first match)
      (
        SELECT e.external_id
        FROM   external_ids e
        WHERE  e.canonical_id = r.track_id
          AND  e.entity_type  = 'youtube_track'
        LIMIT  1
      )                      AS external_youtube_id,
      -- Artists as JSON array
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'artistId', a.id,
            'name',     a.name,
            'code2',    a.code2,
            'imageUrl', a.image_url
          ) ORDER BY ta.position
        ), '[]'::json)
        FROM   track_artists ta
        JOIN   artists       a ON a.id = ta.artist_id
        WHERE  ta.track_id = r.track_id
      )::text                AS artists_json,
      -- Album as JSON object (first/primary album)
      (
        SELECT json_build_object(
          'albumId',     al.id,
          'name',        al.name,
          'label',       al.label,
          'releaseDate', al.release_date::text
        )
        FROM   track_albums ta2
        JOIN   albums       al ON al.id = ta2.album_id
        WHERE  ta2.track_id = r.track_id
        ORDER  BY ta2.is_primary DESC, al.id ASC
        LIMIT  1
      )::text                AS album_json
    FROM   youtube_shorts_chart_rows      r
    JOIN   youtube_shorts_chart_snapshots s ON s.id = r.snapshot_id
    WHERE  s.chart_type = ${params.chartType}
      AND  s.country    = ${params.code2}
      AND  s.date       = ${params.date!}::date
    ORDER  BY r.rank ASC
    LIMIT  ${params.limit}
    OFFSET ${params.offset}
  `;
}

/**
 * Returns all distinct chart dates available for a given chart type and country
 * in `youtube_shorts_chart_snapshots`, sorted newest-first.
 *
 * @param chartType - The chart granularity.
 * @param code2     - ISO alpha-2 country code or 'GLOBAL'.
 * @returns ISO date strings (YYYY-MM-DD).
 */
export async function queryAvailableYouTubeShortsDates(
  chartType: YouTubeShortsChartType,
  code2: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ date: string }>>`
    SELECT DISTINCT date::text AS date
    FROM   youtube_shorts_chart_snapshots
    WHERE  chart_type = ${chartType}
      AND  country    = ${code2}
    ORDER  BY date DESC
  `;
  return rows.map((r) => r.date);
}

/**
 * Returns all distinct country codes that have at least one snapshot for any
 * YouTube Shorts chart type.
 *
 * @returns Sorted array of country code strings (ISO alpha-2 or 'GLOBAL').
 */
export async function queryYouTubeShortsCountries(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ country: string }>>`
    SELECT DISTINCT country
    FROM   youtube_shorts_chart_snapshots
    ORDER  BY country ASC
  `;
  return rows.map((r) => r.country);
}
