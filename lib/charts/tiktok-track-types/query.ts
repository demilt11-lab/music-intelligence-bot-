/**
 * TikTok Typed Track Chart – database queries.
 * @module lib/charts/tiktok-track-types/query
 */

import { db } from '@/lib/db';
import { TikTokTrackChartType, TikTokTypedTrackChartParams } from './types';

/**
 * Queries the TikTok typed track chart from the database.
 *
 * Joins:
 * - `tiktok_typed_track_chart_snapshots` – one row per chart type × date.
 * - `tiktok_typed_track_chart_rows`      – one row per track × snapshot.
 * - Artist and album data via correlated subqueries.
 *
 * When `params.latest` is true the most recent snapshot is used automatically.
 * An optional `code2` filter restricts results to a specific country.
 *
 * @param params - Validated chart parameters.
 * @returns Array of raw database rows.
 */
export async function queryTikTokTypedTrackChart(
  params: TikTokTypedTrackChartParams,
): Promise<any[]> {
  const { chartType, date, latest, limit, offset, code2 } = params;

  if (latest) {
    if (code2 !== undefined) {
      return db.$queryRaw<any[]>`
        WITH latest_snap AS (
          SELECT id, "snapshotDate"::text AS charted_date
          FROM   tiktok_typed_track_chart_snapshots
          WHERE  "chartType" = ${chartType}
          ORDER  BY "snapshotDate" DESC
          LIMIT  1
        )
        SELECT
          r.track_id,
          r.name,
          r.rank,
          r.rank_diff,
          r.country,
          r.image_url,
          r.external_id,
          r.genre,
          r.is_chart_genre,
          r.airplay_streams::text           AS airplay_streams,
          r.spotify_plays::text             AS spotify_plays,
          r.shazam_count::text              AS shazam_count,
          r.tiktok_top_videos_views::text   AS tiktok_top_videos_views,
          s.charted_date,
          (
            SELECT e.external_id
            FROM   external_ids e
            WHERE  e."entityId"   = r.track_id
              AND  e."entityType" = 'tiktok_track'
            LIMIT  1
          )                                 AS external_tiktok_track_id,
          (
            SELECT COALESCE(json_agg(
              json_build_object(
                'artistId',    a.id,
                'name',        a.name,
                'code2',       a.country,
                'imageUrl',    a."imageUrl",
                'careerStage', NULL
              ) ORDER BY ta.position
            ), '[]'::json)
            FROM   track_artists ta
            JOIN   artists       a ON a.id = ta.artist_id
            WHERE  ta.track_id = r.track_id
          )::text                           AS artists_json,
          (
            SELECT json_build_object(
              'albumId',     al.id,
              'name',        al.title,
              'label',       al.label,
              'releaseDate', al."releaseDate"::text
            )
            FROM   track_albums ta2
            JOIN   albums       al ON al.id = ta2.album_id
            WHERE  ta2.track_id = r.track_id
            ORDER  BY al.id ASC
            LIMIT  1
          )::text                           AS album_json
        FROM   tiktok_typed_track_chart_rows r
        JOIN   latest_snap                   s ON s.id = r.snapshot_id
        WHERE  r.country = ${code2}
        ORDER  BY r.rank ASC
        LIMIT  ${limit}
        OFFSET ${offset}
      `;
    }

    return db.$queryRaw<any[]>`
      WITH latest_snap AS (
        SELECT id, date::text AS charted_date
        FROM   tiktok_typed_track_chart_snapshots
        WHERE  chart_type = ${chartType}
        ORDER  BY date DESC
        LIMIT  1
      )
      SELECT
        r.track_id,
        r.name,
        r.rank,
        r.rank_diff,
        r.country,
        r.image_url,
        r.external_id,
        r.genre,
        r.is_chart_genre,
        r.airplay_streams::text           AS airplay_streams,
        r.spotify_plays::text             AS spotify_plays,
        r.shazam_count::text              AS shazam_count,
        r.tiktok_top_videos_views::text   AS tiktok_top_videos_views,
        s.charted_date,
        (
          SELECT e.external_id
          FROM   external_ids e
          WHERE  e.canonical_id = r.track_id
            AND  e.entity_type  = 'tiktok_track'
          LIMIT  1
        )                                 AS external_tiktok_track_id,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'artistId',    a.id,
              'name',        a.name,
              'code2',       a.code2,
              'imageUrl',    a.image_url,
              'careerStage', a.career_stage
            ) ORDER BY ta.position
          ), '[]'::json)
          FROM   track_artists ta
          JOIN   artists       a ON a.id = ta.artist_id
          WHERE  ta.track_id = r.track_id
        )::text                           AS artists_json,
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
        )::text                           AS album_json
      FROM   tiktok_typed_track_chart_rows r
      JOIN   latest_snap                   s ON s.id = r.snapshot_id
      ORDER  BY r.rank ASC
      LIMIT  ${limit}
      OFFSET ${offset}
    `;
  }

  // Date-specific paths
  if (code2 !== undefined) {
    return db.$queryRaw<any[]>`
      SELECT
        r.track_id,
        r.name,
        r.rank,
        r.rank_diff,
        r.country,
        r.image_url,
        r.external_id,
        r.genre,
        r.is_chart_genre,
        r.airplay_streams::text           AS airplay_streams,
        r.spotify_plays::text             AS spotify_plays,
        r.shazam_count::text              AS shazam_count,
        r.tiktok_top_videos_views::text   AS tiktok_top_videos_views,
        s."snapshotDate"::text            AS charted_date,
        (
          SELECT e.external_id
          FROM   external_ids e
          WHERE  e.canonical_id = r.track_id
            AND  e.entity_type  = 'tiktok_track'
          LIMIT  1
        )                                 AS external_tiktok_track_id,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'artistId',    a.id,
              'name',        a.name,
              'code2',       a.code2,
              'imageUrl',    a.image_url,
              'careerStage', a.career_stage
            ) ORDER BY ta.position
          ), '[]'::json)
          FROM   track_artists ta
          JOIN   artists       a ON a.id = ta.artist_id
          WHERE  ta.track_id = r.track_id
        )::text                           AS artists_json,
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
        )::text                           AS album_json
      FROM   tiktok_typed_track_chart_rows      r
      JOIN   tiktok_typed_track_chart_snapshots s ON s.id = r.snapshot_id
      WHERE  s."chartType"    = ${chartType}
        AND  s."snapshotDate" = ${date!}::date
        AND  r.country        = ${code2}
      ORDER  BY r.rank ASC
      LIMIT  ${limit}
      OFFSET ${offset}
    `;
  }

  return db.$queryRaw<any[]>`
    SELECT
      r.track_id,
      r.name,
      r.rank,
      r.rank_diff,
      r.country,
      r.image_url,
      r.external_id,
      r.genre,
      r.is_chart_genre,
      r.airplay_streams::text           AS airplay_streams,
      r.spotify_plays::text             AS spotify_plays,
      r.shazam_count::text              AS shazam_count,
      r.tiktok_top_videos_views::text   AS tiktok_top_videos_views,
      s."snapshotDate"::text            AS charted_date,
      (
        SELECT e.external_id
        FROM   external_ids e
        WHERE  e.canonical_id = r.track_id
          AND  e.entity_type  = 'tiktok_track'
        LIMIT  1
      )                                 AS external_tiktok_track_id,
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'artistId',    a.id,
            'name',        a.name,
            'code2',       a.code2,
            'imageUrl',    a.image_url,
            'careerStage', a.career_stage
          ) ORDER BY ta.position
        ), '[]'::json)
        FROM   track_artists ta
        JOIN   artists       a ON a.id = ta.artist_id
        WHERE  ta.track_id = r.track_id
      )::text                           AS artists_json,
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
      )::text                           AS album_json
    FROM   tiktok_typed_track_chart_rows      r
    JOIN   tiktok_typed_track_chart_snapshots s ON s.id = r.snapshot_id
    WHERE  s."chartType"    = ${chartType}
      AND  s."snapshotDate" = ${date!}::date
    ORDER  BY r.rank ASC
    LIMIT  ${limit}
    OFFSET ${offset}
  `;
}

/**
 * Returns all distinct chart dates available for a given chart type in
 * `tiktok_typed_track_chart_snapshots`, sorted newest-first.
 *
 * @param chartType - The chart type to filter by ('popular' | 'breakout').
 * @returns ISO date strings (YYYY-MM-DD).
 */
export async function queryAvailableTikTokTypedTrackDates(
  chartType: TikTokTrackChartType,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ date: string }>>`
    SELECT DISTINCT "snapshotDate"::text AS date
    FROM   tiktok_typed_track_chart_snapshots
    WHERE  "chartType" = ${chartType}
    ORDER  BY "snapshotDate" DESC
  `;
  return rows.map((r) => r.date);
}
