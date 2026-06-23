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
 * Also accepts Spotify URIs (spotify:track:{id}) and internationalized Spotify
 * links (open.spotify.com/intl-xx/track/{id}).
 *
 * Returns null for plain text, unsupported hosts, or unrecognised path shapes.
 */
export function parseSearchUrl(q: string): ParsedUrl | null {
  const trimmed = q.trim()

  // ── Spotify URI (spotify:track:ID) ──────────────────────────────────────────
  const uriMatch = trimmed.match(
    /^spotify:(artist|track|album|playlist):([A-Za-z0-9]+)$/i,
  )
  if (uriMatch) {
    return {
      platform: 'spotify',
      entityType: uriMatch[1].toLowerCase() as 'artist' | 'track' | 'album' | 'playlist',
      id: uriMatch[2],
    }
  }

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
    // Strip locale prefix in internationalized links, e.g. /intl-de/track/{id}.
    if (parts[0] && /^intl-[a-z]{2}$/i.test(parts[0])) parts.shift()
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

/**
 * Heuristic: does this query look like a link (rather than free-text search)?
 * Used to give a specific "unsupported link" message instead of silently
 * returning zero text-search results when a user pastes a URL we can't parse.
 */
export function looksLikeUrl(q: string): boolean {
  const t = q.trim()
  if (/^https?:\/\//i.test(t)) return true
  if (/^spotify:/i.test(t)) return true
  // Bare host + path, e.g. "open.spotify.com/track/x" or "tidal.com/browse/...".
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S/i.test(t)
}
