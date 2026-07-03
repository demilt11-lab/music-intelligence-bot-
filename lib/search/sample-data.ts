/**
 * Sample data returned by search when the database has no records.
 *
 * These match the seed artist/track catalog so the UI is immediately useful
 * for demos and first-time setups before real ingestion has run.
 * Results are marked with `_isSample: true` so the UI can flag them.
 */

import type {
  SearchArtistResult,
  SearchTrackResult,
  SearchPlaylistResult,
  SearchCuratorResult,
  SearchGroupedResults,
} from './types'

export type SampleResult = { _isSample: true }

export const SAMPLE_ARTISTS: (SearchArtistResult & SampleResult)[] = [
  { id: 1, name: 'Nova Rae', imageUrl: null, code2: 'US', spotifyFollowers: 84_200, score: 82, _isSample: true },
  { id: 2, name: 'Jay Meridian', imageUrl: null, code2: 'GB', spotifyFollowers: 61_500, score: 74, _isSample: true },
  { id: 3, name: 'Luz del Mar', imageUrl: null, code2: 'BR', spotifyFollowers: 45_800, score: 68, _isSample: true },
  { id: 4, name: 'Kilo West', imageUrl: null, code2: 'US', spotifyFollowers: 29_100, score: 55, _isSample: true },
  { id: 5, name: 'Aya Tone', imageUrl: null, code2: 'KR', spotifyFollowers: 17_400, score: 43, _isSample: true },
  { id: 6, name: 'Sabina Cruz', imageUrl: null, code2: 'MX', spotifyFollowers: 92_000, score: 88, _isSample: true },
  { id: 7, name: 'Demi Volta', imageUrl: null, code2: 'AU', spotifyFollowers: 38_700, score: 62, _isSample: true },
  { id: 8, name: 'Osei Wave', imageUrl: null, code2: 'GH', spotifyFollowers: 22_500, score: 51, _isSample: true },
]

export const SAMPLE_TRACKS: (SearchTrackResult & SampleResult)[] = [
  { id: 1, name: 'Neon Pulse', isrc: 'SEED001DEMO', imageUrl: null, artists: [{ id: 1, name: 'Nova Rae' }], releaseDate: '2026-04-12', score: 82, _isSample: true },
  { id: 2, name: 'Frequency', isrc: 'SEED002DEMO', imageUrl: null, artists: [{ id: 2, name: 'Jay Meridian' }], releaseDate: '2026-03-28', score: 74, _isSample: true },
  { id: 3, name: 'La Marea', isrc: 'SEED003DEMO', imageUrl: null, artists: [{ id: 3, name: 'Luz del Mar' }], releaseDate: '2026-05-01', score: 68, _isSample: true },
  { id: 4, name: 'Backstreet Burn', isrc: 'SEED004DEMO', imageUrl: null, artists: [{ id: 4, name: 'Kilo West' }], releaseDate: '2026-04-04', score: 55, _isSample: true },
  { id: 5, name: 'Haenyeo', isrc: 'SEED005DEMO', imageUrl: null, artists: [{ id: 5, name: 'Aya Tone' }], releaseDate: '2026-05-15', score: 43, _isSample: true },
  { id: 6, name: 'Borderless', isrc: 'SEED006DEMO', imageUrl: null, artists: [{ id: 6, name: 'Sabina Cruz' }], releaseDate: '2026-02-20', score: 88, _isSample: true },
  { id: 7, name: 'Gold Coast', isrc: 'SEED007DEMO', imageUrl: null, artists: [{ id: 7, name: 'Demi Volta' }], releaseDate: '2026-06-02', score: 62, _isSample: true },
  { id: 8, name: 'Highlife Revival', isrc: 'SEED008DEMO', imageUrl: null, artists: [{ id: 8, name: 'Osei Wave' }], releaseDate: '2026-05-22', score: 51, _isSample: true },
]

export const SAMPLE_PLAYLISTS: (SearchPlaylistResult & SampleResult)[] = [
  { id: 1, name: 'Fresh Finds Pop', imageUrl: null, platform: 'spotify', followers: '1250000', ownerName: 'Spotify Editorial', _isSample: true },
  { id: 2, name: 'UK Rising', imageUrl: null, platform: 'spotify', followers: '480000', ownerName: 'NME Picks', _isSample: true },
  { id: 3, name: 'Viral Hits', imageUrl: null, platform: 'youtube', followers: '2100000', ownerName: 'YouTube Music', _isSample: true },
  { id: 4, name: 'New Music Daily', imageUrl: null, platform: 'apple', followers: '3400000', ownerName: 'Apple Music', _isSample: true },
  { id: 5, name: 'Breaking Latin', imageUrl: null, platform: 'spotify', followers: '920000', ownerName: 'Spotify Editorial', _isSample: true },
  { id: 6, name: 'Afrobeats Pulse', imageUrl: null, platform: 'spotify', followers: '670000', ownerName: 'Spotify Editorial', _isSample: true },
]

export const SAMPLE_CURATORS: (SearchCuratorResult & SampleResult)[] = [
  { id: 1, name: 'Spotify Editorial', imageUrl: null, platform: 'spotify', numPlaylists: 42, _isSample: true },
  { id: 2, name: 'NME Picks', imageUrl: null, platform: 'spotify', numPlaylists: 12, _isSample: true },
  { id: 3, name: 'YouTube Music', imageUrl: null, platform: 'youtube', numPlaylists: 28, _isSample: true },
  { id: 4, name: 'Apple Music', imageUrl: null, platform: 'apple', numPlaylists: 35, _isSample: true },
]

/** Fuzzy-ish text match for sample data filtering. */
function matches(name: string, q: string): boolean {
  const lq = q.toLowerCase().trim()
  const ln = name.toLowerCase()
  return ln.includes(lq) || lq.includes(ln.split(' ')[0]!) || lq.length < 2
}

/**
 * Returns sample search results filtered by `q`.
 * Only used when the database returns zero results.
 */
export function sampleSearch(q: string, type: string): SearchGroupedResults {
  const qt = q.trim()
  if (!qt) return {}

  const result: SearchGroupedResults & Record<string, unknown[]> = {}

  if (type === 'all' || type === 'artists') {
    const artists = SAMPLE_ARTISTS.filter((a) => matches(a.name, qt))
    if (artists.length) result.artists = artists
  }

  if (type === 'all' || type === 'tracks') {
    const tracks = SAMPLE_TRACKS.filter(
      (t) =>
        matches(t.name, qt) ||
        t.artists.some((a) => matches(a.name, qt)),
    )
    if (tracks.length) result.tracks = tracks
  }

  if (type === 'all' || type === 'playlists') {
    const playlists = SAMPLE_PLAYLISTS.filter(
      (p) => matches(p.name, qt) || (p.ownerName && matches(p.ownerName, qt)),
    )
    if (playlists.length) result.playlists = playlists
  }

  if (type === 'all' || type === 'curators') {
    const curators = SAMPLE_CURATORS.filter((c) => matches(c.name, qt))
    if (curators.length) result.curators = curators
  }

  return result
}

/** True if a grouped result set is entirely empty. */
export function isEmptyResult(result: SearchGroupedResults): boolean {
  return Object.values(result).every((arr) => !arr || arr.length === 0)
}
