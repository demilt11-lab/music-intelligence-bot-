export type ParsedUrl = {
  platform: 'spotify' | 'youtube' | 'apple'
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
 * Apple Music (music.apple.com):
 *   /{storefront}/artist|song|album|playlist/{slug}/{id}
 *   album links with ?i={trackId} resolve to the track.
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

  // ── Apple Music ─────────────────────────────────────────────────────────────
  //   /{storefront}/artist/{slug}/{id}     /{storefront}/song/{slug}/{id}
  //   /{storefront}/album/{slug}/{id}[?i=] /{storefront}/playlist/{slug}/{plId}
  if (url.hostname === 'music.apple.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    // Strip the 2-letter storefront prefix (e.g. /us/…) when present.
    if (parts[0] && /^[a-z]{2}$/i.test(parts[0])) parts.shift()
    const type = parts[0]
    const pathId = parts[parts.length - 1]
    if (!type || !pathId || parts.length < 2) return null

    if (type === 'artist') return { platform: 'apple', entityType: 'artist', id: pathId }
    if (type === 'song') return { platform: 'apple', entityType: 'track', id: pathId }
    if (type === 'playlist') return { platform: 'apple', entityType: 'playlist', id: pathId }
    if (type === 'album') {
      // A track within an album is addressed by ?i={trackId}.
      const i = url.searchParams.get('i')
      return i
        ? { platform: 'apple', entityType: 'track', id: i }
        : { platform: 'apple', entityType: 'album', id: pathId }
    }
    return null
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
