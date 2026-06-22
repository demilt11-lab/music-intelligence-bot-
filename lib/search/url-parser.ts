export type ParsedUrl = {
  platform: 'spotify' | 'youtube'
  entityType: 'artist' | 'track' | 'album' | 'playlist'
  id: string
}

const SPOTIFY_ENTITY_TYPES = new Set(['artist', 'track', 'album', 'playlist'])

/**
 * Detects whether a search query is a Spotify or YouTube URL and extracts the
 * platform, entity type, and canonical ID.
 *
 * Supported formats
 * ─────────────────
 * Spotify (open.spotify.com):
 *   /artist/{id}   /track/{id}   /album/{id}   /playlist/{id}
 *   Optional ?si=… suffix is ignored.
 *
 * YouTube:
 *   youtube.com/watch?v={id}   (video → track)
 *   youtu.be/{id}              (video → track)
 *   youtube.com/channel/{id}   (channel → artist)
 *
 * Returns null for plain text, unsupported hosts, or unrecognised path shapes.
 */
export function parseSearchUrl(q: string): ParsedUrl | null {
  const trimmed = q.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  // ── Spotify ───────────────────────────────────────────────────────────────
  if (url.hostname === 'open.spotify.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const entityType = parts[0]
    const id = parts[1]
    if (!entityType || !id) return null
    if (!SPOTIFY_ENTITY_TYPES.has(entityType)) return null
    return {
      platform: 'spotify',
      entityType: entityType as 'artist' | 'track' | 'album' | 'playlist',
      id,
    }
  }

  // ── YouTube long-form ─────────────────────────────────────────────────────
  if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') {
    if (url.pathname === '/watch') {
      const v = url.searchParams.get('v')
      if (v) return { platform: 'youtube', entityType: 'track', id: v }
    }
    const channelMatch = url.pathname.match(/^\/channel\/([A-Za-z0-9_-]+)$/)
    if (channelMatch) {
      return { platform: 'youtube', entityType: 'artist', id: channelMatch[1] }
    }
    return null
  }

  // ── YouTube short-form ────────────────────────────────────────────────────
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1)
    if (id) return { platform: 'youtube', entityType: 'track', id }
  }

  return null
}
