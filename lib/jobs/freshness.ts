export const FRESHNESS_SLA_HOURS = 25;

export function freshnessStatus(latestDate: Date | null | undefined): {
  date: string | null
  ageHours: number | null
  fresh: boolean
} {
  if (!latestDate) return { date: null, ageHours: null, fresh: false }
  const ageHours = (Date.now() - latestDate.getTime()) / 3_600_000
  return {
    date: latestDate.toISOString(),
    ageHours: Math.round(ageHours * 10) / 10,
    fresh: ageHours <= FRESHNESS_SLA_HOURS,
  }
}
