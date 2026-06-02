import { db } from '@/lib/db';
import { TikTokVideoChartParams } from './types';

/**
 * Queries the TikTok video chart from the database.
 *
 * Joins:
 * - `tiktok_video_chart_snapshots` – one row per chart date.
 * - `tiktok_video_chart_rows`      – one row per video × snapshot.
 * - `tiktok_video_chart_history`   – historical rank/view time-series.
 *
 * When `params.latest` is true the most recent snapshot is used automatically.
 *
 * @param params - Validated chart parameters.
 * @returns Array of raw database rows.
 */
export async function queryTikTokVideoChart(
  params: TikTokVideoChartParams,
): Promise<any[]> {
  if (params.latest) {
    return db.$queryRaw<any[]>`
      WITH latest_snap AS (
        SELECT id, "snapshotDate"::text AS source_date
        FROM   tiktok_video_chart_snapshots
        ORDER  BY "snapshotDate" DESC
        LIMIT  1
      )
      SELECT
        r.video_id,
        r.name,
        r.rank,
        r.added_at::text        AS added_at,
        r.velocity,
        r.pre_rank,
        r.peak_rank,
        r.peak_date::text       AS peak_date,
        r.time_on_chart,
        r.views::text           AS views,
        r.likes::text           AS likes,
        r.comments::text        AS comments,
        r.linked_track_id,
        s.source_date,
        -- External TikTok video IDs as JSON array
        (
          SELECT COALESCE(json_agg(e."externalId" ORDER BY e.id), '[]'::json)
          FROM   external_ids e
          WHERE  e."entityId"  = r.video_id
            AND  e."entityType"   = 'tiktok_video'
        )::text                 AS external_ids_json,
        -- Rank history
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'rank',    h.rank,
              'views',   h.views::text,
              'timestp', h.timestp::text
            ) ORDER BY h.timestp
          ), '[]'::json)
          FROM   tiktok_video_chart_history h
          WHERE  h.video_id = r.video_id
            AND  h.stat_type = 'rank'
        )::text                 AS rank_stats_json,
        -- View history
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'views',   h.views::text,
              'timestp', h.timestp::text
            ) ORDER BY h.timestp
          ), '[]'::json)
          FROM   tiktok_video_chart_history h
          WHERE  h.video_id = r.video_id
            AND  h.stat_type = 'views'
        )::text                 AS view_stats_json
      FROM   tiktok_video_chart_rows     r
      JOIN   latest_snap                 s ON s.id = r.snapshot_id
      ORDER  BY r.rank ASC
      LIMIT  ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  return db.$queryRaw<any[]>`
    SELECT
      r.video_id,
      r.name,
      r.rank,
      r.added_at::text        AS added_at,
      r.velocity,
      r.pre_rank,
      r.peak_rank,
      r.peak_date::text       AS peak_date,
      r.time_on_chart,
      r.views::text           AS views,
      r.likes::text           AS likes,
      r.comments::text        AS comments,
      r.linked_track_id,
      s."snapshotDate"::text  AS source_date,
      -- External TikTok video IDs as JSON array
      (
        SELECT COALESCE(json_agg(e."externalId" ORDER BY e.id), '[]'::json)
        FROM   external_ids e
        WHERE  e."entityId"  = r.video_id
          AND  e."entityType"   = 'tiktok_video'
      )::text                 AS external_ids_json,
      -- Rank history
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'rank',    h.rank,
            'views',   h.views::text,
            'timestp', h.timestp::text
          ) ORDER BY h.timestp
        ), '[]'::json)
        FROM   tiktok_video_chart_history h
        WHERE  h.video_id = r.video_id
          AND  h.stat_type = 'rank'
      )::text                 AS rank_stats_json,
      -- View history
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'views',   h.views::text,
            'timestp', h.timestp::text
          ) ORDER BY h.timestp
        ), '[]'::json)
        FROM   tiktok_video_chart_history h
        WHERE  h.video_id = r.video_id
          AND  h.stat_type = 'views'
      )::text                 AS view_stats_json
    FROM   tiktok_video_chart_rows      r
    JOIN   tiktok_video_chart_snapshots s ON s.id = r.snapshot_id
    WHERE  s."snapshotDate" = ${params.date!}::date
    ORDER  BY r.rank ASC
    LIMIT  ${params.limit}
    OFFSET ${params.offset}
  `;
}

/**
 * Returns all distinct chart dates available in `tiktok_video_chart_snapshots`,
 * sorted newest-first.
 *
 * @returns ISO date strings (YYYY-MM-DD).
 */
export async function queryAvailableTikTokVideoDates(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ date: string }>>`
    SELECT "snapshotDate"::text AS date
    FROM   tiktok_video_chart_snapshots
    ORDER  BY "snapshotDate" DESC
  `;
  return rows.map((r) => r.date);
}
