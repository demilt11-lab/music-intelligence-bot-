/**
 * YouTube Shorts Chart – database queries.
 * @module lib/charts/youtube-shorts/query
 */

import { db } from '@/lib/db';
import { YouTubeShortsChartParams, YouTubeShortsChartType } from './types';

export async function queryYouTubeShortsChart(
  params: YouTubeShortsChartParams,
): Promise<any[]> {
  if (params.latest) {
    return db.$queryRaw<any[]>`
      WITH latest_snap AS (
        SELECT id, "snapshotDate"::text AS charted_date, "countryCode" AS country
        FROM   youtube_shorts_chart_snapshots
        WHERE  "chartType"   = ${params.chartType}
          AND  "countryCode" = ${params.code2}
        ORDER  BY "snapshotDate" DESC
        LIMIT  1
      )
      SELECT
        r."trackId"      AS track_id,
        r.rank,
        r."previousRank" AS rank_diff,
        r.views::text    AS youtube_views,
        s.country,
        s.charted_date,
        (
          SELECT e."externalId"
          FROM   external_ids e
          WHERE  e."entityId"   = r."trackId"
            AND  e."entityType"  = 'youtube_track'
          LIMIT  1
        )                AS external_youtube_id,
        (
          SELECT COALESCE(json_agg(
            json_build_object(
              'artistId', a.id,
              'name',     a.name,
              'code2',    a.country,
              'imageUrl', a."imageUrl"
            ) ORDER BY ta.position
          ), '[]'::json)
          FROM   track_artists ta
          JOIN   artists       a ON a.id = ta."artistId"
          WHERE  ta."trackId" = r."trackId"
        )::text          AS artists_json,
        (
          SELECT json_build_object(
            'albumId',     al.id,
            'name',        al.title,
            'label',       al.label,
            'releaseDate', al."releaseDate"::text
          )
          FROM   track_albums ta2
          JOIN   albums       al ON al.id = ta2."albumId"
          WHERE  ta2."trackId" = r."trackId"
          ORDER  BY al.id ASC
          LIMIT  1
        )::text          AS album_json
      FROM   youtube_shorts_chart_rows r
      JOIN   latest_snap               s ON s.id = r."snapshotId"
      ORDER  BY r.rank ASC
      LIMIT  ${params.limit}
      OFFSET ${params.offset}
    `;
  }

  return db.$queryRaw<any[]>`
    SELECT
      r."trackId"      AS track_id,
      r.rank,
      r."previousRank" AS rank_diff,
      r.views::text    AS youtube_views,
      s."countryCode"  AS country,
      s."snapshotDate"::text AS charted_date,
      (
        SELECT e."externalId"
        FROM   external_ids e
        WHERE  e."canonicalId" = r."trackId"
          AND  e."entityType"  = 'youtube_track'
        LIMIT  1
      )                AS external_youtube_id,
      (
        SELECT COALESCE(json_agg(
          json_build_object(
            'artistId', a.id,
            'name',     a.name,
            'code2',    a.country,
            'imageUrl', a."imageUrl"
          ) ORDER BY ta.position
        ), '[]'::json)
        FROM   track_artists ta
        JOIN   artists       a ON a.id = ta."artistId"
        WHERE  ta."trackId" = r."trackId"
      )::text          AS artists_json,
      (
        SELECT json_build_object(
          'albumId',     al.id,
          'name',        al.title,
          'label',       al.label,
          'releaseDate', al."releaseDate"::text
        )
        FROM   track_albums ta2
        JOIN   albums       al ON al.id = ta2."albumId"
        WHERE  ta2."trackId" = r."trackId"
        ORDER  BY al.id ASC
        LIMIT  1
      )::text          AS album_json
    FROM   youtube_shorts_chart_rows      r
    JOIN   youtube_shorts_chart_snapshots s ON s.id = r."snapshotId"
    WHERE  s."chartType"   = ${params.chartType}
      AND  s."countryCode" = ${params.code2}
      AND  s."snapshotDate" = ${params.date!}::date
    ORDER  BY r.rank ASC
    LIMIT  ${params.limit}
    OFFSET ${params.offset}
  `;
}

export async function queryAvailableYouTubeShortsDates(
  chartType: YouTubeShortsChartType,
  code2: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ date: string }>>`
    SELECT DISTINCT "snapshotDate"::text AS date
    FROM   youtube_shorts_chart_snapshots
    WHERE  "chartType"   = ${chartType}
      AND  "countryCode" = ${code2}
    ORDER  BY "snapshotDate" DESC
  `;
  return rows.map((r) => r.date);
}

export async function queryYouTubeShortsCountries(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ country: string }>>`
    SELECT DISTINCT "countryCode" AS country
    FROM   youtube_shorts_chart_snapshots
    ORDER  BY "countryCode" ASC
  `;
  return rows.map((r) => r.country);
}
