/**
 * @module lib/charts/airplay-tracks/service
 *
 * Application-layer service for the airplay track chart.
 * Orchestrates data fetching, normalization, and response shaping.
 */

import { AirplayTrackChartParams, AirplayTrackChartResponse } from './types';
import { queryAirplayTrackChart } from './query';
import { normalizeAirplayTrackChartRow } from './normalize';

/**
 * Fetches the airplay track chart for the given parameters, normalizes each
 * row, and wraps the result in the standard API response envelope.
 *
 * @param params - Validated chart query parameters.
 * @returns The API response containing the chart rows and total count.
 */
export async function getAirplayTrackChart(
  params: AirplayTrackChartParams,
): Promise<AirplayTrackChartResponse> {
  const rawRows = await queryAirplayTrackChart(params);
  const data = rawRows.map(normalizeAirplayTrackChartRow);

  return {
    obj: {
      length: data.length,
      data,
    },
  };
}
