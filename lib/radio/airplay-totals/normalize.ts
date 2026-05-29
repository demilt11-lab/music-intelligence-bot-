/**
 * Reshaper for the deprecated aggregate Airplay Totals response format.
 *
 * The legacy format represents each row as a tuple `[row, trendPoints]` where
 * the trend is extracted from the row and also surfaced separately.  This is
 * kept for backwards-compatibility; new consumers should use the
 * airplay-by-entity endpoint.
 */

import type {
  AirplayCountryRow,
  AirplayCityRow,
  AirplayStationRow,
  AirplayTrackRow,
  AirplayTrendPoint,
  AirplayTotalsResponse,
} from './types';

/**
 * Converts the four dimension arrays returned by the service into the legacy
 * tuple format expected by `AirplayTotalsResponse`.
 *
 * Each entry in the output arrays is `[row, trendPoints]` where `trendPoints`
 * is identical to `row.plays_trend`.  The trend is preserved inline on the row
 * as well so either access path works.
 *
 * @param countries - Normalized country rows.
 * @param cities    - Normalized city rows.
 * @param stations  - Normalized station rows.
 * @param tracks    - Normalized track rows.
 * @returns The legacy `obj` shape for {@link AirplayTotalsResponse}.
 */
export function reshapeToLegacyFormat(
  countries: AirplayCountryRow[],
  cities:    AirplayCityRow[],
  stations:  AirplayStationRow[],
  tracks:    AirplayTrackRow[],
): AirplayTotalsResponse['obj'] {
  return {
    countries: countries.map<[AirplayCountryRow, AirplayTrendPoint[]]>(
      (row) => [row, row.plays_trend],
    ),
    cities: cities.map<[AirplayCityRow, AirplayTrendPoint[]]>(
      (row) => [row, row.plays_trend],
    ),
    stations: stations.map<[AirplayStationRow, AirplayTrendPoint[]]>(
      (row) => [row, row.plays_trend],
    ),
    tracks: tracks.map<[AirplayTrackRow, AirplayTrendPoint[]]>(
      (row) => [row, row.plays_trend],
    ),
  };
}
