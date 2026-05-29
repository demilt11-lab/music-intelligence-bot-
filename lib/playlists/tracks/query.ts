/**
 * Database query layer for Playlist Tracks.
 *
 * Queries `playlist_membership_events` joined to:
 * - `tracks`                – core track metadata.
 * - `track_artists`         – artist associations.
 * - `track_albums`          – album associations.
 * - `track_audio_features`  – Spotify audio feature data.
 * - `external_ids`          – platform-specific external IDs.
 *
 * For `span=current` the query filters to rows where `removed_at IS NULL`.
 * For `span=past`    the query applies optional `since` / `until` date windows.
 */

import { db } from '@/lib/db';
import { applyVersionFilters } from './version-filter';
import type { PlaylistTracksParams } from './types';

/**
 * Executes the playlist membership query and returns raw rows.
 *
 * @param params - Validated playlist tracks parameters.
 * @returns Raw database rows ready for normalisation.
 */
export async function queryPlaylistTracks(params: PlaylistTracksParams): Promise<any[]> {
  const {
    playlistId,
    span,
    since,
    until,
    storefront,
    limit,
    offset,
  } = params;

  const conditions: string[] = ['pme.playlist_id = $1'];
  const values: unknown[] = [playlistId];
  let paramIdx = 2;

  const addParam = (value: unknown): string => {
    values.push(value);
    return `$${paramIdx++}`;
  };

  // --- span filters ---
  if (span === 'current') {
    conditions.push('pme.removed_at IS NULL');
  } else {
    // past: apply optional date window
    if (since !== undefined) {
      conditions.push(`pme.removed_at >= ${addParam(since)}::timestamptz`);
    }
    if (until !== undefined) {
      conditions.push(`pme.added_at <= ${addParam(until)}::timestamptz`);
    }
  }

  // --- storefront ---
  if (storefront !== undefined) {
    conditions.push(`pme.storefront = ${addParam(storefront)}`);
  }

  // --- version filters ---
  paramIdx = applyVersionFilters(params, conditions, values, paramIdx);

  const whereClause = conditions.join(' AND ');

  // Push limit/offset last
  const limitPlaceholder = `$${paramIdx++}`;
  const offsetPlaceholder = `$${paramIdx++}`;
  values.push(limit);
  values.push(offset);

  const sql = `
    SELECT
      t.id                              AS "trackId",
      t.isrc,
      pme.added_at::text                AS "addedAt",
      pme.removed_at::text              AS "removedAt",
      pme.position,
      pme.period,
      t.name,
      t.image_url                       AS "imageUrl",
      t.popularity,
      t.genre,
      t.duration_ms                     AS "durationMs",

      -- Artists (aggregated as JSON)
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id',     a.id,
              'name',   a.name,
              'code2',  a.code2,
              'image',  a.image_url
            ) ORDER BY ta.sort_order
          )
          FROM track_artists ta
          JOIN artists a ON a.id = ta.artist_id
          WHERE ta.track_id = t.id
        ),
        '[]'::json
      )::text                           AS "artists_json",

      -- Albums (aggregated as JSON)
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id',           al.id,
              'name',         al.name,
              'upc',          al.upc,
              'label',        al.label,
              'release_date', al.release_date::text
            ) ORDER BY tal.sort_order
          )
          FROM track_albums tal
          JOIN albums al ON al.id = tal.album_id
          WHERE tal.track_id = t.id
        ),
        '[]'::json
      )::text                           AS "albums_json",

      -- External track IDs keyed by platform
      COALESCE(
        (
          SELECT json_object_agg(e.platform, e.ids)
          FROM (
            SELECT ei.platform, json_agg(ei.external_id ORDER BY ei.id) AS ids
            FROM external_ids ei
            WHERE ei.canonical_id = t.id AND ei.entity_type = 'track'
            GROUP BY ei.platform
          ) e
        ),
        '{}'::json
      )::text                           AS "external_track_ids_json",

      -- External album IDs keyed by platform
      COALESCE(
        (
          SELECT json_object_agg(e.platform, e.ids)
          FROM (
            SELECT ei.platform, json_agg(ei.external_id ORDER BY ei.id) AS ids
            FROM track_albums tal2
            JOIN external_ids ei ON ei.canonical_id = tal2.album_id AND ei.entity_type = 'album'
            WHERE tal2.track_id = t.id
            GROUP BY ei.platform
          ) e
        ),
        '{}'::json
      )::text                           AS "external_album_ids_json",

      -- External artist IDs keyed by platform
      COALESCE(
        (
          SELECT json_object_agg(e.platform, e.ids)
          FROM (
            SELECT ei.platform, json_agg(ei.external_id ORDER BY ei.id) AS ids
            FROM track_artists ta2
            JOIN external_ids ei ON ei.canonical_id = ta2.artist_id AND ei.entity_type = 'artist'
            WHERE ta2.track_id = t.id
            GROUP BY ei.platform
          ) e
        ),
        '{}'::json
      )::text                           AS "external_artist_ids_json",

      -- Audio features
      CASE WHEN taf.track_id IS NOT NULL THEN
        json_build_object(
          'tempo',            taf.tempo,
          'key',              taf.key,
          'mode',             taf.mode,
          'valence',          taf.valence,
          'energy',           taf.energy,
          'danceability',     taf.danceability,
          'acousticness',     taf.acousticness,
          'instrumentalness', taf.instrumentalness,
          'liveness',         taf.liveness,
          'loudness',         taf.loudness,
          'speechiness',      taf.speechiness,
          'time_signature',   taf.time_signature
        )::text
      ELSE NULL
      END                               AS "audio_features_json",

      -- Position history
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'position',  ph.position,
              'addedAt',   ph.added_at::text,
              'removedAt', ph.removed_at::text
            ) ORDER BY ph.added_at
          )
          FROM playlist_membership_events ph
          WHERE ph.playlist_id = pme.playlist_id AND ph.track_id = t.id
        ),
        '[]'::json
      )::text                           AS "position_stats_json"

    FROM playlist_membership_events pme
    JOIN tracks t ON t.id = pme.track_id
    LEFT JOIN track_audio_features taf ON taf.track_id = t.id
    WHERE ${whereClause}
    ORDER BY pme.added_at DESC NULLS LAST, t.id
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  return db.$queryRawUnsafe<any[]>(sql, ...values);
}
