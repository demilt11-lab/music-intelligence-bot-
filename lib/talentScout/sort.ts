export type SortKey = 'breakout' | 'playlist' | 'consistency'

export const SORT_KEYS: readonly SortKey[] = ['breakout', 'playlist', 'consistency']

export const SORT_LABELS: Record<SortKey, string> = {
  breakout: 'Breakout velocity',
  playlist: 'Playlist fit',
  consistency: 'Artist consistency',
}

type Sortable = {
  totalScore: number
  tiktokVelocity: number
  spotifyStreamsLatest: string | null
}

/**
 * Re-order a track list according to the active sort key.
 * Returns a new array; the original is not mutated.
 *
 *  breakout    – AI conviction score (totalScore). Matches the API's default
 *                ranking, which weights TikTok velocity most heavily.
 *  playlist    – Spotify stream volume desc. Highlights tracks with enough
 *                consumption history to be pitched to editorial playlists.
 *  consistency – TikTok 7-day growth velocity desc. Surfaces artists building
 *                sustained UGC momentum rather than a single spike.
 */
export function sortTracks<T extends Sortable>(tracks: T[], key: SortKey): T[] {
  const copy = tracks.slice()
  switch (key) {
    case 'breakout':
      return copy.sort((a, b) => b.totalScore - a.totalScore)
    case 'playlist':
      return copy.sort(
        (a, b) => Number(b.spotifyStreamsLatest ?? 0) - Number(a.spotifyStreamsLatest ?? 0),
      )
    case 'consistency':
      return copy.sort((a, b) => b.tiktokVelocity - a.tiktokVelocity)
  }
}
