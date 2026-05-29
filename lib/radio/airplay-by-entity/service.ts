/**
 * Service layer for the Airplay-by-Entity module.
 */

import { queryAirplayByEntity } from './query';
import { normalizeAirplayByEntity } from './normalize';
import type { AirplayByEntityParams, AirplayByEntityResponse } from './types';

/**
 * Retrieves airplay data for a given entity broken down by the requested dimension.
 *
 * @param params - Fully validated {@link AirplayByEntityParams}.
 * @returns Normalized {@link AirplayByEntityResponse}.
 */
export async function getAirplayByEntity(
  params: AirplayByEntityParams,
): Promise<AirplayByEntityResponse> {
  const rows = await queryAirplayByEntity(params);
  const obj = normalizeAirplayByEntity(rows, params.entity, params.dateFormat);
  return { obj };
}
