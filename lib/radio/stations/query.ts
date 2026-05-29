/**
 * Database query for Radio Stations.
 */

import { db } from '@/lib/db';

/**
 * Fetches all radio stations for a given country, including social media stats.
 *
 * Joins `radio_stations` with `radio_station_social_stats` on station id.
 * Returns raw database rows.
 *
 * @param code2 - ISO 3166-1 alpha-2 country code.
 * @returns Array of raw database rows.
 */
export async function queryRadioStations(code2: string): Promise<any[]> {
  const rows = await db.$queryRaw<any[]>`
    SELECT
      rs.id,
      rs.name,
      rs.genre,
      rs.frequency,
      rs.market,
      rs.broadcast_area   AS "broadcastArea",
      rs.country,
      rs.station_state    AS "stationState",
      rs.image_url        AS "imageUrl",
      rs.aqh,
      rs.platform,
      ss.facebook_followers  AS "facebookFollowers",
      ss.facebook_likes      AS "facebookLikes",
      ss.instagram_followers AS "instagramFollowers",
      ss.twitter_followers   AS "twitterFollowers",
      ss.wikipedia_views     AS "wikipediaViews"
    FROM radio_stations rs
    LEFT JOIN radio_station_social_stats ss
      ON ss.station_id = rs.id
    WHERE rs.country = ${code2}
    ORDER BY rs.name ASC
  `;

  return rows;
}
