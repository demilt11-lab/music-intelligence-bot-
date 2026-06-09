import { queryTrackChartAppearances } from './query'
import { normalizeChartRow } from './normalize'
import { TrackChartsResponse } from './types'
import { TrackChartParams } from './validate'

/**
 * Orchestrates the chart-appearances data pipeline for a single track.
 *
 * Fetches raw chart rows from the database, normalises each row, and wraps the
 * result in the standard {@link TrackChartsResponse} envelope.
 *
 * @param params - Validated query parameters produced by
 * {@link validateTrackChartParams}.
 * @returns A fully populated {@link TrackChartsResponse}.
 */
export async function getTrackChartAppearances(
  params: TrackChartParams,
): Promise<TrackChartsResponse> {
  const { trackId, chartType, since, until } = params

  const rawRows = await queryTrackChartAppearances(
    trackId,
    chartType,
    since,
    until,
  )

  const data = rawRows.map(normalizeChartRow)

  return {
    obj: {
      data,
      length: data.length,
    },
  }
}
