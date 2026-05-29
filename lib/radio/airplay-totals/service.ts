/**
 * Service layer for the deprecated aggregate Airplay Totals module.
 *
 * Implemented as a thin wrapper over {@link getAirplayByEntity}: it fans out four
 * parallel calls (one per dimension), normalizes each result, and merges them into
 * the legacy response shape via {@link reshapeToLegacyFormat}.
 */

import { getAirplayByEntity } from '@/lib/radio/airplay-by-entity/service';
import { reshapeToLegacyFormat } from './normalize';
import type { AirplayTotalsParams, AirplayTotalsResponse } from './types';
import type {
  AirplayCountryRow,
  AirplayCityRow,
  AirplayStationRow,
  AirplayTrackRow,
  AirplayByEntityParams,
} from '@/lib/radio/airplay-by-entity/types';

/**
 * Builds a fully-typed {@link AirplayByEntityParams} for a specific dimension,
 * forwarding the common fields from {@link AirplayTotalsParams}.
 *
 * `dateFormat` is always `'ISO'` for the legacy endpoint because the legacy shape
 * does not expose a `dateFormat` option.
 */
function toEntityParams(
  params: AirplayTotalsParams,
  entity: AirplayByEntityParams['entity'],
): AirplayByEntityParams {
  return {
    type:       params.type,
    id:         params.id,
    entity,
    since:      params.since,
    station:    params.station,
    limit:      params.limit,
    dateFormat: 'ISO',
  };
}

/**
 * Retrieves aggregate airplay totals across all four dimensions for a given entity.
 *
 * Fires four parallel queries (country, city, station, track) and merges the
 * results into the legacy tuple format.
 *
 * @param params - Validated {@link AirplayTotalsParams}.
 * @returns Normalized legacy {@link AirplayTotalsResponse}.
 */
export async function getAirplayTotals(
  params: AirplayTotalsParams,
): Promise<AirplayTotalsResponse> {
  const [
    countriesResp,
    citiesResp,
    stationsResp,
    tracksResp,
  ] = await Promise.all([
    getAirplayByEntity(toEntityParams(params, 'country')),
    getAirplayByEntity(toEntityParams(params, 'city')),
    getAirplayByEntity(toEntityParams(params, 'station')),
    getAirplayByEntity(toEntityParams(params, 'track')),
  ]);

  const obj = reshapeToLegacyFormat(
    countriesResp.obj as AirplayCountryRow[],
    citiesResp.obj    as AirplayCityRow[],
    stationsResp.obj  as AirplayStationRow[],
    tracksResp.obj    as AirplayTrackRow[],
  );

  return { obj };
}
