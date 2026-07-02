# Music Intelligence API

A full internal Music Intelligence API built with Next.js 14 App Router and TypeScript.
Uses canonical internal IDs and our own data warehouse. Supports platform-native IDs via an external ID graph.

---

## Stack

- **Next.js 14** — App Router, TypeScript
- **Prisma** — DB abstraction (`lib/db.ts`)
- **Zod** — not used directly; validation is hand-rolled with shared helpers for performance
- **PostgreSQL** — primary data store

---

## Project Structure

```
app/api/               — Route handlers (Next.js App Router)
lib/shared/            — Shared helpers (validation, pagination, bigint, dates, errors, etc.)
lib/search/            — Search module
lib/tracks/            — Track metadata, charts, platform stats, TikTok video trends
lib/charts/            — Chart modules (TikTok videos/users/tracks, YouTube Shorts, Airplay)
lib/curators/          — Curator directory + curator playlists
lib/playlists/         — Playlist directory + playlist tracks
lib/radio/             — Radio stations, airplay by entity, broadcast markets
lib/crawler/           — Client + shared parsing helpers for the crawl4ai crawler service
services/crawler-api/  — Standalone FastAPI service wrapping crawl4ai (headless-browser crawling)
prisma/schema.prisma   — Full database schema
```

---

## Shared Conventions

### Error responses
All errors return `{ error: string }` with an appropriate HTTP status code.

### BigInt / large counter serialization
All large counters (stream counts, play counts, follower counts, etc.) are returned as **strings** to avoid JavaScript precision loss on 64-bit integers.

### Pagination
Endpoints that support pagination accept `offset` (≥0) and `limit` (platform-specific max). The constraint `offset + limit ≤ 10000` is enforced on directory endpoints.

Response envelope for paginated lists:
```json
{ "obj": [...], "offset": 0, "total": 1234 }
```

### Date handling
- Date params accept `YYYY-MM-DD` strings
- Default `since` = 180 days ago
- Default `until` = today
- `dateFormat` param accepts `"ISO"` (default) or `"UNIX"`

### Canonical IDs
All entity IDs are our internal canonical integers. External platform IDs (Spotify, YouTube, TikTok, etc.) are accessible via `externalIds` / `externalTrackIds` / etc. fields on response objects.

---

## API Endpoints

### Search

#### `GET /api/search`
Free-text or URL search across all entity types.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `q` | string (required) | — | Search query, max 100 chars |
| `type` | enum | `all` | `all \| artists \| tracks \| playlists \| curators \| albums \| stations \| cities \| songwriters` |
| `limit` | int | 20 | Max 100 |
| `offset` | int | 0 | |
| `beta` | boolean | false | Returns suggestions list instead of grouped buckets |
| `platforms` | string[] | — | Filter suggestions by platform (beta mode only) |
| `triggerCitiesOnly` | boolean | false | Restrict cities to trigger cities |

**Normal mode response (`beta=false`):**
```json
{
  "obj": {
    "artists": [{ "id": 1, "name": "...", "imageUrl": null, "code2": "US" }],
    "tracks": [{ "id": 2, "name": "...", "isrc": "...", "artists": [...] }],
    "playlists": [...],
    "curators": [...],
    "albums": [...],
    "stations": [...],
    "cities": [...],
    "songwriters": [...]
  }
}
```

**Beta mode response (`beta=true`):**
```json
{
  "obj": {
    "suggestions": [
      { "type": "artist", "id": 1, "name": "...", "imageUrl": null, "subtitle": null, "platforms": ["spotify"] }
    ]
  }
}
```

---

### Tracks

#### `GET /api/tracks/:trackId`
Full track metadata.

**Response:**
```json
{
  "obj": {
    "id": 42,
    "name": "Song Title",
    "isrc": "USRC12345678",
    "imageUrl": "https://...",
    "previewUrl": null,
    "durationMs": 210000,
    "composerName": "Composer Name",
    "trackTier": "major",
    "artists": [{ "id": 1, "name": "Artist", "imageUrl": null, "code2": "US" }],
    "albums": [{ "id": 10, "name": "Album", "upc": "...", "releaseDate": "2023-01-01", "label": "Label", "imageUrl": null, "popularity": 80 }],
    "tags": ["pop"],
    "moods": ["happy"],
    "activities": ["workout"],
    "genres": ["pop"],
    "songwriters": ["Writer Name"],
    "releaseDate": "2023-01-01",
    "albumLabel": "Label",
    "explicit": false,
    "score": 85.5,
    "statistics": {
      "spotifyPopularity": 75,
      "spotifyStreams": "1234567890",
      "tiktokVideoCount": "50000",
      "geniusPageViews": "200000",
      "youtubeViews": "5000000",
      "shazamCount": "300000",
      "pandoraStreams": null,
      "boomplayStreams": null
    }
  }
}
```

#### `GET /api/tracks/:trackId/charts/:chartType`
Chart appearances for a track.

**Path:** `chartType` = `spotify_viral_daily | spotify_viral_weekly | spotify_top_daily | spotify_top_weekly | applemusic_top | applemusic_daily | applemusic_albums | itunes_top | itunes_albums | airplay_daily | airplay_weekly | amazon_top | shazam_top | beatport_top | soundcloud_top | ...`

**Query params:** `since` (default 180d ago), `until` (default today)

**Response:**
```json
{
  "obj": {
    "data": [{
      "rank": 1, "addedAt": "2024-01-01", "code2": "US", "plays": "50000",
      "chartType": "spotify_viral_daily", "preRank": 3, "peakRank": 1,
      "peakDate": "2024-01-01", "peakPlays": "50000", "totalPlays": "500000",
      "trackId": 42, "trackName": "Song", "artists": [...], "album": {...},
      "externalIds": { "spotify": ["6rqhFgbbKwnb9MLmUQDhG6"] }
    }],
    "length": 1
  }
}
```

#### `GET /api/tracks/:id/platforms/:platform/stats/:mode`
Time-series stats for a track on a specific platform.

**Path params:**
- `platform` = `shazam | spotify | youtube | tiktok | genius | soundcloud | line | melon | radio`
- `mode` = `highest-playcounts | most-history`

**Query params:**
| Param | Default | Description |
|---|---|---|
| `since` | 180d ago | |
| `until` | today | |
| `type` | platform-specific | e.g. `streams`, `popularity`, `video_views` |
| `latest` | false | Return only the most recent data point |
| `interpolated` | false | Fill gaps with linear interpolation (not supported for spotify) |
| `isDomainId` | false | If true, `id` is a platform-native ID |
| `extrapolated` | — | `before \| after \| both` |

**Response:**
```json
{
  "obj": [{
    "platform": "spotify",
    "platformTrackId": "6rqhFgbbKwnb9MLmUQDhG6",
    "type": "streams",
    "data": [{ "value": "1234567", "timestp": "2024-01-01" }]
  }]
}
```

#### `GET /api/tiktok/videos/:videoId/trends`
Daily trend data for a TikTok video.

**Query params:** `fromDaysAgo` (1-365, default 28)

**Response:**
```json
{
  "obj": [{ "timestp": "2024-01-01", "likes": "10000", "comments": "500", "views": "200000" }]
}
```

---

### Charts

#### `GET /api/charts/tiktok/videos`
TikTok top videos chart.

**Query params:** `date` (required unless `latest=true`), `limit` (max 100), `offset` (max 9900), `latest`

**Response:**
```json
{
  "obj": {
    "length": 50,
    "data": [{
      "videoId": 1, "externalTikTokVideoIds": ["..."], "linkedTrackId": 42,
      "name": "Video Name", "rank": 1, "addedAt": "2024-01-01",
      "velocity": 5, "preRank": 6, "peakRank": 1, "peakDate": "2024-01-01",
      "timeOnChart": 7, "views": "2000000", "likes": "50000", "comments": "3000",
      "rankStats": [{ "rank": 1, "views": "2000000", "timestp": "2024-01-01" }],
      "viewStats": [{ "views": "2000000", "timestp": "2024-01-01" }],
      "sourceDate": "2024-01-01"
    }]
  }
}
```

#### `GET /api/charts/tiktok/videos/dates`
Available chart dates for TikTok video chart.

#### `GET /api/charts/tiktok/users`
TikTok user chart (likes or followers).

**Query params:** `type` (required: `likes | followers`), `interval` (default `daily`), `date`, `latest`, `limit`, `offset`

#### `GET /api/charts/tiktok/users/dates`

#### `GET /api/charts/tiktok/tracks/:chartType`
TikTok typed track chart. `chartType` = `popular | breakout`

**Query params:** `date`, `latest`, `limit`, `offset`, `code2` (optional)

**Response:** `{ "obj": [TikTokTypedTrackChartRow...] }`

#### `GET /api/charts/tiktok/tracks/dates`

#### `GET /api/charts/youtube/shorts/:chartType`
YouTube Shorts chart. `chartType` = `shorts_daily | shorts_weekly`

**Query params:** `code2` (required, ISO alpha-2 or `GLOBAL`), `date`, `latest`, `limit` (max 1000), `offset`

#### `GET /api/charts/youtube/shorts/dates`
#### `GET /api/charts/youtube/countries`

#### `GET /api/charts/airplay/tracks`
Airplay track chart.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `duration` | required | `daily \| weekly \| monthly \| semi_yearly \| yearly \| all_time` |
| `date` | latest | Chart date |
| `since` | — | Filter by date range |
| `limit` | 50 | Max 500 |
| `country_code` | `GLOBAL` | ISO alpha-2 or GLOBAL |
| `city_id` | — | Optional city filter |
| `latest` | false | |

#### `GET /api/charts/airplay/tracks/dates`
#### `GET /api/charts/airplay/countries`
#### `GET /api/charts/airplay/cities`

---

### Curators

#### `GET /api/curators/:platform`
Curator directory for a platform.

**Platforms:** `spotify | applemusic | itunes | deezer | youtube | amazon`

**Query params:**
| Param | Default | Description |
|---|---|---|
| `offset` | 0 | |
| `limit` | 50 | Max 10000; offset+limit ≤ 10000 |
| `sortColumn` | platform default | Platform-specific sort column |
| `sortOrderDesc` | true | |
| `shortlistIds[]` | — | Comma-separated or repeated |
| `nameSearch` | — | |
| `playlistKeywordSearch` | — | |
| `editorial` | — | boolean filter |
| `indie` | — | boolean filter |

**Response:**
```json
{
  "obj": [{ "position": 1, "curatorId": 10, "platform": "spotify", "ownerName": "...", "numPlaylists": 50, "totalReach": "5000000", "followers": "100000", "editorial": true, "tags": ["editorial"] }],
  "offset": 0,
  "total": 1234
}
```

#### `GET /api/curators/platforms`
Returns `{ "obj": ["spotify", "applemusic", "itunes", "deezer", "youtube", "amazon"] }`

#### `GET /api/curators/:platform/filters`
Returns sort and filter capabilities for the platform.

#### `GET /api/curators/:platform/:curatorId/playlists`
Playlists for a curator.

**Platforms:** `spotify | applemusic | deezer`

**Query params:** `limit`, `offset`, `sortColumn`, `sortOrderDesc`, `storefront`

**Response:**
```json
{
  "total_length": 100,
  "length": 20,
  "data": [{ "playlistId": 1, "name": "Top Hits", "followers": "500000", "numTrack": 50, "lastUpdated": "2024-01-01", "tags": [{ "id": 1, "name": "pop" }] }]
}
```

---

### Playlists

#### `GET /api/playlists/:platform`
Playlist directory for a platform.

**Platforms:** `spotify | applemusic | itunes | deezer | youtube | amazon`

**Query params:**
| Param | Default | Description |
|---|---|---|
| `offset` | 0 | |
| `limit` | 50 | Max 10000; offset+limit ≤ 10000 |
| `sortColumn` | platform default | |
| `sortOrderDesc` | true | |
| `tagIds[]` | — | Filter by tag IDs |
| `code2` | — | Country filter |
| `editorial` | — | |
| `topPlaylist` | — | |
| `descriptionSearch` | — | |
| `shortlistIds[]` | — | |
| `curatorIds[]` | — | (spotify, itunes only) |
| `indie` | — | |

**Response:**
```json
{
  "obj": [{ "position": 1, "playlistId": 1, "name": "Hot Hits", "followers": "1000000", "numTrack": 50, "editorial": true }],
  "offset": 0,
  "total": 500
}
```

#### `GET /api/playlists/platforms`
#### `GET /api/playlists/:platform/tags`
#### `GET /api/playlists/:platform/filters`

#### `GET /api/playlists/:platform/:playlistId/:span/tracks`
Current or historical playlist track membership.

**Path:** `span` = `current | past`

**Query params:**
| Param | Default | Description |
|---|---|---|
| `withDetails` | true | Include full track metadata |
| `since` | — | (past only) filter removed_at >= since |
| `until` | — | (past only) filter added_at <= until |
| `storefront` | — | ISO alpha-2 storefront |
| `version_only[]` | — | Version cluster exact match |
| `version_and[]` | — | All versions must match |
| `version_or[]` | — | Any version matches |
| `version_not[]` | — | Exclude these versions |
| `limit` | 100 | Max 1000 |
| `offset` | 0 | |

**Version filter rules:** `version_only` cannot combine with `version_and/or/not`; `version_and` cannot combine with `version_or`.

**Response:**
```json
{
  "obj": [{
    "trackId": 42, "isrc": "USRC12345678", "addedAt": "2024-01-01", "removedAt": null,
    "position": 1, "name": "Song", "imageUrl": null, "popularity": 80,
    "artistIds": [1], "artistNames": ["Artist"], "artistCode2s": ["US"], "artistImages": [null],
    "albumIds": [10], "albumNames": ["Album"], "albumUpc": ["..."], "albumLabels": ["Label"],
    "releaseDates": ["2023-01-01"],
    "externalTrackIds": { "spotify": ["6rqhFgbbKwnb9MLmUQDhG6"] },
    "externalAlbumIds": {}, "externalArtistIds": {},
    "durationMs": 210000,
    "audioFeatures": { "tempo": 120.0, "energy": 0.8, "danceability": 0.75 },
    "positionStats": [{ "position": 1, "addedAt": "2024-01-01", "removedAt": null }]
  }]
}
```

---

### Radio

#### `GET /api/radio/stations?code2=US`
Radio stations for a country.

**Query params:** `code2` (required, 2-letter ISO alpha-2)

**Response:**
```json
{
  "obj": [{
    "id": 1, "name": "Station Name", "genre": "pop", "frequency": "98.7",
    "market": "Los Angeles", "broadcastArea": "Southern California",
    "country": "US", "stationState": "CA", "imageUrl": null, "aqh": 50000,
    "platform": "fm", "facebookFollowers": "10000", "instagramFollowers": "5000",
    "twitterFollowers": null, "facebookLikes": null, "wikipediaViews": null
  }]
}
```

#### `GET /api/radio/:type/:id/airplay-totals/:entity`
Canonical airplay data by dimension.

**Path:**
- `type` = `artist | album | track`
- `entity` = `country | city | station | track`

**Query params:** `since` (default 180d ago), `station` (optional station ID filter), `limit` (1-100), `dateFormat` (`ISO | UNIX`)

**Response (country entity example):**
```json
{
  "obj": [{
    "code2": "US", "name": "United States",
    "plays": "500000", "plays_percent": 0.45,
    "plays_trend": [{ "air_date": "2024-01-01", "count": "10000" }]
  }]
}
```

#### `GET /api/radio/:type/:id/airplay-totals`
**Deprecated.** Legacy aggregate endpoint. Returns all four dimensions in one response. Internally calls the canonical entity endpoint 4 times.

**Response:**
```json
{
  "obj": {
    "countries": [[{ "code2": "US", "plays": "..." }, [{ "air_date": "2024-01-01", "count": "..." }]]],
    "cities": [...], "stations": [...], "tracks": [...]
  }
}
```

#### `GET /api/radio/:type/:id/broadcast-markets`
Country and city broadcast market ratios.

**Query params:** `since` (default 180d ago)

**Response:**
```json
{
  "obj": {
    "countryRatios": [{
      "market": "United States", "market_count_data": "500000", "code2": "US",
      "total_market_count_data": "1000000", "count_of_stations": 150,
      "population": 330000000, "lat": 37.09, "lng": -95.71, "count": "0.5"
    }],
    "cityRatios": [{
      "market": "Los Angeles", "display_name": "Los Angeles, US", "code2": "US",
      "market_count_data": "100000", "country": "United States",
      "total_market_count_data": "1000000", "count_of_stations": 30,
      "city_id": 5, "population": 4000000, "lat": 34.05, "lng": -118.24, "count": "0.1"
    }]
  }
}
```

---

## Crawling (crawl4ai)

DSP web players, social profiles, and radio station sites either block plain
HTTP fetches (bot detection) or only render content via JavaScript, so those
sources are crawled through a self-hosted [crawl4ai](https://github.com/unclecode/crawl4ai)
service rather than fetched directly:

- **`services/crawler-api/`** — a standalone FastAPI service wrapping
  crawl4ai's `AsyncWebCrawler` (real headless Chromium via Playwright, with
  stealth-mode bot-detection bypass). Deployed separately, same posture as
  `services/ar-api`. See its README for local dev + deployment.
- **`lib/crawler/client.ts`** — `crawlUrl(url, options)`, the Next.js-side
  HTTP client for the service. Returns rendered `markdown`, optional
  CSS-extracted `extracted` data, and discovered page `links`.
- **`lib/crawler/textParsing.ts`** / **`lib/crawler/resolveTrack.ts`** —
  shared markdown-cleanup and title+artist → canonical-Track resolution used
  by every crawl-based ingestion job.

Ingestion jobs built on this (`npm run ingest:<name>`):

| Job | Source | Writes |
|---|---|---|
| `billboard` | Billboard chart pages (Hot 100, R&B/Hip-Hop, Country, Pop Airplay) | `chart_snapshots` / `chart_rows` |
| `crawl-dsp-apple` | Apple Music "Top 100" editorial playlists (Global, USA) | `chart_snapshots` / `chart_rows` |
| `crawl-social-x` | X/Twitter artist profiles (follower counts) | `ArtistDailyStats.platformFollowers` / `totalFollowers` |
| `crawl-radio-spins` | Radio station "recently played" pages (`Station.websiteUrl`) | `radio_airplay_facts` |

Each job's markdown parser is heuristic (multiple fallback strategies) by
design — these sites don't expose stable CSS class names or a public API, so
parsing rendered text is more resilient than a brittle selector schema. The
same `/crawl` endpoint also supports a `JsonCssExtractionStrategy` schema for
sites that *do* have stable markup (see `services/crawler-api/README.md`).

Extending to a source not covered yet (Amazon Music, Tidal, Facebook, more
chart sites) means adding a target URL + a parse function following one of
the existing jobs as a template — no new infrastructure required.

crawl4ai data feeds A&R scoring too: `crawl_radio_spins.ts` and the chart jobs
above roll up into `ArtistFeaturesDaily.airplayGrowth7d/30d` and
`chartPresence7d`/`chartRankImprovement7d` (computed in
`ml/ar_feature_engineering.py`, folded into `ml/scoring.py`'s heat/stability
formulas), which is what `/ar-bot` (below) actually reads.

---

## A&R Bot

`/ar-bot` is a chat UI for `services/ar-api` (the Predictive A&R scoring
service) — the first live consumer of `lib/bot/tools.ts`'s tool schemas,
which previously had no runtime behind them. A Claude tool-calling loop
(`lib/ai/agent.ts`) executes `search_artists` / `explain_artist` /
`playlists_to_pitch` against ar-api (`lib/bot/execute.ts`) and the UI renders
the results as artist cards / feature breakdowns alongside Buddy's reply.

Requires `ANTHROPIC_API_KEY` (the reply) and `AR_API_URL` (the data) — the
page shows which is missing rather than failing silently if either is unset.
`playlists_to_pitch` is intentionally unimplemented upstream (ar-api returns
501); the bot reports that plainly instead of inventing recommendations.

---

## Prisma Schema

Located at `prisma/schema.prisma`. Run migrations with:
```bash
npx prisma migrate dev
npx prisma generate
```

Key tables: `tracks`, `artists`, `albums`, `playlists`, `curators`, `stations`, `cities`, `countries`, `external_ids`, `track_platform_stats_daily`, `track_statistics_latest`, `chart_snapshots`, `chart_rows`, `tiktok_*_chart_*`, `youtube_shorts_chart_*`, `airplay_track_chart_*`, `radio_airplay_facts`, `radio_stations`, `playlist_membership_events`, `track_audio_features`.

---

## Environment

Copy `.env.example` to `.env.local` and fill in your database URL:
```
DATABASE_URL="postgresql://user:password@localhost:5432/music_intelligence"
```

## Development

```bash
npm install
npx prisma generate
npm run dev
```

## Validation

```bash
npm run typecheck   # tsc --noEmit (build is type-checked too)
npm run lint        # next lint
npm test            # unit tests (node:test + tsx, no DB required)
npm run smoke       # end-to-end smoke test (requires DB + running server)
```

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full production runbook:
environment variables, database setup, Vercel build/cron config, the ML
service, GitHub Actions secrets, post-deploy verification, and known
deployment debt.
