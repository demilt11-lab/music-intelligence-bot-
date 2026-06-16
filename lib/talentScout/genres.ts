// lib/talentScout/genres.ts
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

export type GenreBreakoutSignal = {
  genre: string

  // UGC
  ugcVideos7d: number
  ugcVideos7dGrowth: number
  ugcViews7d: number
  ugcViews7dGrowth: number
  ugcLeadCountry: string | null

  // International streaming
  intlStreams7d: number
  intlStreams7dGrowth: number
  intlLeadCountry: string | null

  // US streaming
  usStreams7d: number
  usStreams7dGrowth: number

  // US radio
  usSpins7d: number
  usSpins7dGrowth: number
  leadFormat: string | null

  breakoutScore: number
  commentary: string
}

type GenreTrendOptions = {
  date?: string
  usCode2?: string
}

export type GenreSourceCoverage = {
  date: string | null
  ugc: boolean
  spotifyCharts: boolean
  usRadio: boolean
}

/**
 * Most recent date with a row in any genre-signal table, or null if all
 * three are empty. Without this, an unset `date` meant "no date filter" —
 * computeGenreBreakouts would sum every row ever written across every date
 * (BUG-005), inflating without bound as the ETL accumulates daily snapshots
 * instead of reflecting current momentum.
 */
async function resolveEffectiveDate(explicit?: string): Promise<Date | null> {
  if (explicit) return new Date(explicit)

  const [latestUgc, latestPlaylist, latestAirplay] = await Promise.all([
    db.ugcGenreMetrics.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.genrePlaylistMetrics.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.genreAirplayMetrics.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
  ])

  const dates = [latestUgc?.date, latestPlaylist?.date, latestAirplay?.date].filter(
    (d): d is Date => d != null,
  )
  if (!dates.length) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
}

/** Which genre-signal sources have data for the effective date, for transparent empty states. */
export async function getGenreSourceCoverage(explicitDate?: string): Promise<GenreSourceCoverage> {
  const date = await resolveEffectiveDate(explicitDate)
  if (!date) return { date: null, ugc: false, spotifyCharts: false, usRadio: false }

  const [ugcCount, chartCount, radioCount] = await Promise.all([
    db.ugcGenreMetrics.count({ where: { date } }),
    db.genrePlaylistMetrics.count({ where: { date, playlistType: 'chart' } }),
    db.genreAirplayMetrics.count({ where: { date } }),
  ])

  return {
    date: date.toISOString().slice(0, 10),
    ugc: ugcCount > 0,
    spotifyCharts: chartCount > 0,
    usRadio: radioCount > 0,
  }
}

export async function computeGenreBreakouts(
  opts: GenreTrendOptions = {}
): Promise<GenreBreakoutSignal[]> {
  const usCode2 = opts.usCode2 ?? 'US'
  const date = await resolveEffectiveDate(opts.date)
  if (!date) return []

  const [ugcRows, intlRows, usStreamRows, radioRows] = await Promise.all([
    db.ugcGenreMetrics.findMany({ where: { date } }),
    db.genrePlaylistMetrics.findMany({ where: { country: { not: usCode2 }, date } }),
    db.genrePlaylistMetrics.findMany({ where: { country: usCode2, date } }),
    db.genreAirplayMetrics.findMany({ where: { country: usCode2, date } }),
  ])

  return reduceGenreSignals(ugcRows, intlRows, usStreamRows, radioRows, usCode2)
}

type UgcGenreRow = {
  genre: string
  videos7d: number
  videos7dGrowth: number
  views7d: bigint
  views7dGrowth: number
  leadCountry: string | null
}

type PlaylistGenreRow = {
  genre: string
  country: string
  streams7d: bigint
  streams7dGrowth: number
}

type AirplayGenreRow = {
  genre: string
  spins7d: number
  spins7dGrowth: number
  formatId: string | null
}

/**
 * Pure reducer: folds already-fetched rows from all sources into ranked
 * genre signals. Rows are summed (not overwritten) per genre — e.g. a
 * "chart"-derived row and a legacy "all" row for the same genre/country/date,
 * or multiple radio formats — so one source can no longer silently clobber
 * another's contribution for the same key (BUG-005).
 */
export function reduceGenreSignals(
  ugcRows: UgcGenreRow[],
  intlRows: PlaylistGenreRow[],
  usStreamRows: PlaylistGenreRow[],
  radioRows: AirplayGenreRow[],
  usCode2: string,
): GenreBreakoutSignal[] {
  const byGenre: Map<string, GenreBreakoutSignal> = new Map()

  const ensureGenre = (genre: string): GenreBreakoutSignal => {
    const existing = byGenre.get(genre)
    if (existing) return existing

    const base: GenreBreakoutSignal = {
      genre,
      ugcVideos7d: 0,
      ugcVideos7dGrowth: 0,
      ugcViews7d: 0,
      ugcViews7dGrowth: 0,
      ugcLeadCountry: null,
      intlStreams7d: 0,
      intlStreams7dGrowth: 0,
      intlLeadCountry: null,
      usStreams7d: 0,
      usStreams7dGrowth: 0,
      usSpins7d: 0,
      usSpins7dGrowth: 0,
      leadFormat: null,
      breakoutScore: 0,
      commentary: '',
    }

    byGenre.set(genre, base)
    return base
  }

  ugcRows.forEach((row) => {
    const g = ensureGenre(row.genre)
    g.ugcVideos7d = Number(row.videos7d ?? 0)
    g.ugcVideos7dGrowth = Number(row.videos7dGrowth ?? 0)
    g.ugcViews7d = Number(row.views7d ?? 0)
    g.ugcViews7dGrowth = Number(row.views7dGrowth ?? 0)
    g.ugcLeadCountry = row.leadCountry ?? g.ugcLeadCountry
  })

  intlRows.forEach((row) => {
    const g = ensureGenre(row.genre)
    g.intlStreams7d += Number(row.streams7d ?? 0)
    g.intlStreams7dGrowth += Number(row.streams7dGrowth ?? 0)

    if (!g.intlLeadCountry || row.streams7d > 0) {
      g.intlLeadCountry = row.country
    }
  })

  usStreamRows.forEach((row) => {
    const g = ensureGenre(row.genre)
    g.usStreams7d += Number(row.streams7d ?? 0)
    g.usStreams7dGrowth += Number(row.streams7dGrowth ?? 0)
  })

  radioRows.forEach((row) => {
    const g = ensureGenre(row.genre)
    g.usSpins7d += Number(row.spins7d ?? 0)
    g.usSpins7dGrowth += Number(row.spins7dGrowth ?? 0)

    if (!g.leadFormat || row.spins7d > 0) {
      g.leadFormat = row.formatId
    }
  })

  for (const g of byGenre.values()) {
    g.breakoutScore = computeGenreBreakoutScore(g)
    g.commentary = buildGenreCommentary(g, usCode2)
  }

  return [...byGenre.values()].sort((a, b) => b.breakoutScore - a.breakoutScore)
}

function computeGenreBreakoutScore(g: GenreBreakoutSignal): number {
  const ugcMomentum =
    growthScore(g.ugcVideos7dGrowth) * 0.4 +
    growthScore(g.ugcViews7dGrowth) * 0.2

  const intlMomentum = growthScore(g.intlStreams7dGrowth) * 0.2

  // usStreams7d was always 0 before BUG-005 (its only source was a dead
  // ETL branch), so this term had no observable effect and was missing —
  // weighted the same as intlMomentum since both represent chart/streaming
  // growth, just on opposite sides of the US/international split.
  const usMomentum = growthScore(g.usStreams7dGrowth) * 0.2

  const usGap =
    g.intlStreams7d > 0 && g.usStreams7d < g.intlStreams7d
      ? (g.intlStreams7d - g.usStreams7d) / (g.intlStreams7d + 1)
      : 0

  const radioSignal = growthScore(g.usSpins7dGrowth) * 0.1

  return ugcMomentum + intlMomentum + usMomentum + usGap * 0.2 + radioSignal
}

function growthScore(delta: number): number {
  if (!delta || Number.isNaN(delta)) return 0
  const capped = Math.max(-100, Math.min(300, delta))
  return capped / 100
}

function buildGenreCommentary(g: GenreBreakoutSignal, usCode2: string): string {
  const pieces: string[] = []

  if (g.ugcVideos7dGrowth > 0) {
    pieces.push(
      `UGC videos up ${g.ugcVideos7dGrowth.toFixed(1)}% over 7 days, led by ${
        g.ugcLeadCountry ?? 'GLOBAL'
      }.`
    )
  }

  if (g.intlStreams7dGrowth > 0 && g.intlLeadCountry) {
    pieces.push(
      `International streams strong in ${g.intlLeadCountry}, with ${g.intlStreams7dGrowth.toFixed(
        1
      )}% growth.`
    )
  }

  if (g.usStreams7dGrowth > 0) {
    pieces.push(
      `US streams starting to move in ${usCode2}, up ${g.usStreams7dGrowth.toFixed(1)}%.`
    )
  }

  if (g.usSpins7dGrowth > 0 && g.leadFormat) {
    pieces.push(
      `US radio format ${g.leadFormat} showing early adoption with spins up ${g.usSpins7dGrowth.toFixed(
        1
      )}%.`
    )
  }

  if (!pieces.length) {
    return 'No strong breakout signals yet; monitor UGC and international playlists for emerging momentum.'
  }

  return pieces.join(' ')
}
