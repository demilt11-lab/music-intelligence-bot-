import { AirplayDuration } from './types';

/**
 * Maps an {@link AirplayDuration} value to the corresponding database
 * table or view name that stores airplay track chart rows for that duration.
 *
 * @param duration - The requested chart duration.
 * @returns The fully-qualified table / view name.
 */
export function getAirplayTableName(duration: AirplayDuration): string {
  switch (duration) {
    case 'daily':
      return 'airplay_track_chart_rows_daily';
    case 'weekly':
      return 'airplay_track_chart_rows_weekly';
    case 'monthly':
      return 'airplay_track_chart_rows_monthly';
    case 'semi_yearly':
      return 'airplay_track_chart_rows_semi_yearly';
    case 'yearly':
      return 'airplay_track_chart_rows_yearly';
    case 'all_time':
      return 'airplay_track_chart_rows_all_time';
    default: {
      // Exhaustive check – TypeScript will error here if a new duration is added
      // without updating this switch.
      const _exhaustive: never = duration;
      throw new Error(`Unknown airplay duration: ${_exhaustive}`);
    }
  }
}
