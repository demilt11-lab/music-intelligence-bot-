import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSearchUrl, looksLikeUrl } from '@/lib/search/url-parser'

// ── Non-URL inputs ────────────────────────────────────────────────────────────

test('returns null for plain artist name', () => {
  assert.equal(parseSearchUrl('Billie Eilish'), null)
})

test('returns null for empty string', () => {
  assert.equal(parseSearchUrl(''), null)
})

test('returns null for URL without http/https scheme', () => {
  assert.equal(parseSearchUrl('open.spotify.com/artist/4NHQUkpP4SNVPooniB98tn'), null)
})

test('returns null for unrecognised host', () => {
  assert.equal(parseSearchUrl('https://tidal.com/browse/artist/12345'), null)
})

test('returns null for malformed URL that starts with https://', () => {
  assert.equal(parseSearchUrl('https://not a valid url'), null)
})

// ── Spotify artist ────────────────────────────────────────────────────────────

test('Spotify artist URL without query string', () => {
  const result = parseSearchUrl('https://open.spotify.com/artist/4NHQUkpP4SNVPooniB98tn')
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'artist',
    id: '4NHQUkpP4SNVPooniB98tn',
  })
})

test('Spotify artist URL with ?si= tracking param', () => {
  const result = parseSearchUrl(
    'https://open.spotify.com/artist/4NHQUkpP4SNVPooniB98tn?si=abc123def456',
  )
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'artist',
    id: '4NHQUkpP4SNVPooniB98tn',
  })
})

test('leading and trailing whitespace is stripped before parsing', () => {
  const result = parseSearchUrl(
    '  https://open.spotify.com/artist/4NHQUkpP4SNVPooniB98tn  ',
  )
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'artist',
    id: '4NHQUkpP4SNVPooniB98tn',
  })
})

// ── Spotify track ─────────────────────────────────────────────────────────────

test('Spotify track URL', () => {
  const result = parseSearchUrl('https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6')
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'track',
    id: '6rqhFgbbKwnb9MLmUQDhG6',
  })
})

// ── Spotify album ─────────────────────────────────────────────────────────────

test('Spotify album URL', () => {
  const result = parseSearchUrl('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'album',
    id: '4aawyAB9vmqN3uQ7FjRGTy',
  })
})

// ── Spotify playlist ──────────────────────────────────────────────────────────

test('Spotify playlist URL', () => {
  const result = parseSearchUrl(
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  )
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'playlist',
    id: '37i9dQZF1DXcBWIGoYBM5M',
  })
})

// ── Unsupported Spotify entity types ─────────────────────────────────────────

test('Spotify show URL (unsupported entity type) returns null', () => {
  assert.equal(
    parseSearchUrl('https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL'),
    null,
  )
})

test('Spotify episode URL (unsupported entity type) returns null', () => {
  assert.equal(
    parseSearchUrl('https://open.spotify.com/episode/6MlMcUORrWFvXDG8sUJhpQ'),
    null,
  )
})

test('Spotify URL with no path segments returns null', () => {
  assert.equal(parseSearchUrl('https://open.spotify.com/'), null)
})

// ── YouTube watch URL ─────────────────────────────────────────────────────────

test('YouTube long-form watch URL', () => {
  const result = parseSearchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.deepEqual(result, { platform: 'youtube', entityType: 'track', id: 'dQw4w9WgXcQ' })
})

test('YouTube watch URL without www prefix', () => {
  const result = parseSearchUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')
  assert.deepEqual(result, { platform: 'youtube', entityType: 'track', id: 'dQw4w9WgXcQ' })
})

test('YouTube watch URL with extra params preserves only the video ID', () => {
  const result = parseSearchUrl(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=5',
  )
  assert.deepEqual(result, { platform: 'youtube', entityType: 'track', id: 'dQw4w9WgXcQ' })
})

test('YouTube /watch URL without v param returns null', () => {
  assert.equal(parseSearchUrl('https://www.youtube.com/watch'), null)
})

// ── YouTube short URL ─────────────────────────────────────────────────────────

test('YouTube short-form youtu.be URL', () => {
  const result = parseSearchUrl('https://youtu.be/dQw4w9WgXcQ')
  assert.deepEqual(result, { platform: 'youtube', entityType: 'track', id: 'dQw4w9WgXcQ' })
})

// ── YouTube channel URL ───────────────────────────────────────────────────────

test('YouTube channel URL maps to artist', () => {
  const result = parseSearchUrl(
    'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
  )
  assert.deepEqual(result, {
    platform: 'youtube',
    entityType: 'artist',
    id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
  })
})

test('YouTube @handle URL (unsupported) returns null', () => {
  assert.equal(parseSearchUrl('https://www.youtube.com/@BillieEilish'), null)
})

// ── Spotify URI scheme ────────────────────────────────────────────────────────

test('Spotify track URI (spotify:track:ID)', () => {
  const result = parseSearchUrl('spotify:track:6rqhFgbbKwnb9MLmUQDhG6')
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'track',
    id: '6rqhFgbbKwnb9MLmUQDhG6',
  })
})

test('Spotify playlist URI (spotify:playlist:ID)', () => {
  const result = parseSearchUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'playlist',
    id: '37i9dQZF1DXcBWIGoYBM5M',
  })
})

// ── Internationalized Spotify links ───────────────────────────────────────────

test('Spotify internationalized link strips the locale prefix', () => {
  const result = parseSearchUrl(
    'https://open.spotify.com/intl-de/track/6rqhFgbbKwnb9MLmUQDhG6',
  )
  assert.deepEqual(result, {
    platform: 'spotify',
    entityType: 'track',
    id: '6rqhFgbbKwnb9MLmUQDhG6',
  })
})

// ── looksLikeUrl heuristic ─────────────────────────────────────────────────────

test('looksLikeUrl is true for http(s) URLs', () => {
  assert.equal(looksLikeUrl('https://tidal.com/browse/artist/12345'), true)
})

test('looksLikeUrl is true for a Spotify URI', () => {
  assert.equal(looksLikeUrl('spotify:track:6rqhFgbbKwnb9MLmUQDhG6'), true)
})

test('looksLikeUrl is true for a schemeless host/path', () => {
  assert.equal(looksLikeUrl('open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6'), true)
})

test('looksLikeUrl is false for a plain artist name', () => {
  assert.equal(looksLikeUrl('Billie Eilish'), false)
})

test('looksLikeUrl is false for a name with dots but no path', () => {
  assert.equal(looksLikeUrl('M.I.A'), false)
})
