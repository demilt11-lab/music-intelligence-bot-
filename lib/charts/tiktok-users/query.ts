/**
 * TikTok User Chart – database queries.
 * @module lib/charts/tiktok-users/query
 */

import { db } from '@/lib/db';
import { TikTokUserChartParams, TikTokUserChartType } from './types';

/**
 * Queries the TikTok user chart from the database.
 *
 * Joins:
 * - `tiktok_user_chart_snapshots` – one row per chart type × interval × date.
 * - `tiktok_user_chart_rows`      – one row per creator × snapshot.
 * - `tiktok_user_chart_history`   – historical rank time-series per creator.
 *
 * When `params.latest` is true the most recent snapshot matching the type and
 * interval is used automatically.
 *
 * @param params - Validated chart parameters.
 * @returns Array of raw database rows.
 */
export async function queryTikTokUserChart(
  params: TikTokUserChartParams,
): Promise<any[]> {
  if (params.latest) {
    return db.$queryRaw<any[]>`
      WITH latest_snap AS (
        SELECT id, "snapshotDate"::text AS source_date
        FROM   tiktok_user_chart_snapshots
        WHERE  "chartName" = ${params.type}
        ORDER  BY "snapshotDate" DESC
        LIMIT  1
      )
      SELECT
        r.creator_id,
        r.username,
        r.name,
        r.image_url,
        r.rank,
        r.added_at::text        AS added_at,
        r.velocity,
        r.pre_rank,
        r.peak_rank,
        r.peak_date::text       AS peak_date,
        r.time_on_chart,
        r.metric_value::text    AS metric_value,
        r.likes::text           AS likes,
        r.followers::text       AS followers,
        s.source_date,
        -- External TikTok user IDs as JSON array
        (
          SELECT COALESCE(json_agg(e.external_id ORDER BY e.id), '[]'::json)
          FROM   external_ids e
          WHERE  e.canonical_id = r.creator_id
            AND  e.entity_type  = 'tiktok_user'
        )::text                 AS external_ids_json,
        -- Rank history
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'rank',        h.rank,
              'metricValue', h.metric_value::text,
              'timestp',     h.timestp::text
            ) ORDER BY h.timestp
          ), '[]'::json)
          FROM   tiktok_user_chart_history h
          WHERE  h.creator_id  = r.creator_id
            AND  h.chart_type  = ${params.type}
        )::text                 AS rank_stats_json
      FROM   tiktok_user_chart_rows r
      JOIN   latest_snap            s ON s.id = r.snapshot_id
      ORDER  BY r.rank ASC
      LIMIT  ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  return db.$queryRaw<any[]>`
    SELECT
      r.creator_id,
      r.username,
      r.name,
      r.image_url,
      r.rank,
      r.added_at::text        AS added_at,
      r.velocity,
      r.pre_rank,
      r.peak_rank,
      r.peak_date::text       AS peak_date,
      r.time_on_chart,
      r.metric_value::text    AS metric_value,
      r.likes::text           AS likes,
      r.followers::text       AS followers,
      s."snapshotDate"::text  AS source_date,
      -- External TikTok user IDs as JSON array
      (
        SELECT COALESCE(json_agg(e.external_id ORDER BY e.id), '[]'::json)
        FROM   external_ids e
        WHERE  e.canonical_id = r.creator_id
          AND  e.entity_type  = 'tiktok_user'
      )::text                 AS external_ids_json,
      -- Rank history
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'rank',        h.rank,
            'metricValue', h.metric_value::text,
            'timestp',     h.timestp::text
          ) ORDER BY h.timestp
        ), '[]'::json)
        FROM   tiktok_user_chart_history h
        WHERE  h.creator_id  = r.creator_id
          AND  h.chart_type  = ${params.type}
      )::text                 AS rank_stats_json
    FROM   tiktok_user_chart_rows      r
    JOIN   tiktok_user_chart_snapshots s ON s.id = r.snapshot_id
    WHERE  s."chartName"    = ${params.type}
      AND  s."snapshotDate" = ${params.date!}::date
    ORDER  BY r.rank ASC
    LIMIT  ${params.limit}
    OFFSET ${params.offset}
  `;
}

/**
 * Returns all distinct chart dates available for a given chart type in
 * `tiktok_user_chart_snapshots`, sorted newest-first.
 *
 * @param type - The metric type to filter by ('likes' | 'followers').
 * @returns ISO date strings (YYYY-MM-DD).
 */
export async function queryAvailableTikTokUserDates(
  type: TikTokUserChartType,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ date: string }>>`
    SELECT DISTINCT "snapshotDate"::text AS date
    FROM   tiktok_user_chart_snapshots
    WHERE  "chartName" = ${type}
    ORDER  BY "snapshotDate" DESC
  `;
  return rows.map((r) => r.date);
}
