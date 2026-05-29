/**
 * Service layer for Radio Stations.
 */

import { queryRadioStations } from './query';
import { normalizeRadioStation } from './normalize';
import type { RadioStationsParams, RadioStationsResponse } from './types';

/**
 * Retrieves all radio stations for a given country.
 *
 * @param params - Validated query parameters.
 * @returns Normalized {@link RadioStationsResponse}.
 */
export async function getRadioStations(
  params: RadioStationsParams,
): Promise<RadioStationsResponse> {
  const rows = await queryRadioStations(params.code2);
  return { obj: rows.map(normalizeRadioStation) };
}
