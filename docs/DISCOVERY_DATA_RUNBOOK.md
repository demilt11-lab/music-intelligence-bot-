# Discovery ("Songs to Watch") — Data Runbook

How to populate production so the discovery feature
(`scripts/discovery_test.ts` → `lib/talentScout/discovery.ts`) produces a real
ranked top‑10 instead of the **INSUFFICIENT PRODUCTION DATA** report.

The feature ranks tracks by two signals:

| # | Signal | Table / column the query reads |
|---|--------|--------------------------------|
| 1 | Month‑over‑month **streaming growth** (last 30d vs prior 30d) | `luminate_streams.streams` (real stream counts, summed per track) |
| 2 | Growth in **curated‑playlist features** (last 30d vs prior 30d) | `playlist_membership_events` (`eventType='add'`) on **editorial** playlists (`playlists.playlistType='editorial'`) ∪ `curator_playlists` |

A track only makes the list if **both** signals are trending up.

---

## 1. Signal → ingest job → required secrets

Everything below runs from the existing GitHub Actions workflows. Providers
whose secrets are missing are **skipped loudly** (see `scripts/coldstart.sh`),
so you can turn signals on one credential at a time.

### Curated‑playlist signal  ✅ works the day it runs
- **Job:** `jobs/ingest/spotify.ts` — workflow **“Ingest Spotify”** (`ingest_spotify.yml`, also cron every 6h).
- **What it writes:** seeds the track/artist catalog, creates `playlists` with
  `playlistType='editorial'` for Spotify editorial playlists, and writes
  `playlist_membership_events` with `eventType` `'add'`/`'remove'` as tracks
  enter/leave those playlists.
- **Secrets required:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
  (from https://developer.spotify.com → your app).
- **Note:** the *growth* (Δ vs prior month) needs the ingest to have run across
  at least two points in the window, so adds accumulate. Spotify runs every 6h,
  so deltas appear within days.

### Streaming signal  — real stream counts (Luminate)
The discovery query sums `luminate_streams.streams` (literal play counts,
summed across markets/services per track per day):

- **Job:** `jobs/ingest/luminate.ts` — workflow **“Ingest Luminate”** (`ingest_luminate.yml`).
- **What it writes:** `luminate_streams` rows (`entityType='track'`, `entityId`,
  `date`, `streams`). Same source the Talent Scout ranker uses via `hydrateLuminateMetrics`.
- **Secrets required:** `LUMINATE_API_KEY`, `LUMINATE_BASE_URL`.

Notes:
- Other ingests write to `track_platform_stats_daily` (Google Trends → `streams`
  as a search‑interest proxy; YouTube/Instagram → `videoViews`). The discovery
  query no longer reads that table for streaming — it uses Luminate. If you ever
  want the search‑interest proxy instead, that's a one‑line swap back.

---

## 2. Set the secrets

GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.
`DATABASE_URL` / `DIRECT_URL` are already set (the ingests reuse them).

Minimum to light up **both** signals:

```
SPOTIFY_CLIENT_ID         # curated‑playlist signal (+ real catalog)
SPOTIFY_CLIENT_SECRET
LUMINATE_API_KEY          # streaming signal (real stream counts)
LUMINATE_BASE_URL
```

Optional / other data:

```
SEARCHAPI_KEY                         # Google Trends interest (alt streaming proxy; not read now)
YOUTUBE_API_KEY                       # videoViews (not summed)
RAPIDAPI_KEY                          # TikTok UGC (feeds the other Talent Scout lens)
FIRECRAWL_API_KEY                     # blog article search (lib/writersProducers)
CRAWLER_API_URL  CRAWLER_API_KEY      # crawl4ai service — Billboard, Apple Music charts, X followers, radio spins
META_APP_ID  META_APP_SECRET  IG_USER_ID   # Instagram
```

If the live Vercel app needs them too, mirror the same keys into the Vercel
project's Environment Variables.

---

## 3. Run the ingestion

**One button (recommended):** GitHub → **Actions → “Cold Start Ingestion” → Run workflow**.
It runs every provider whose secrets exist (Spotify first to seed the catalog),
then the full ETL chain, then the reconciliation gate. Idempotent — safe to re‑run.

**Or individually:** Actions → “Ingest Spotify” / “Ingest Google Trends” / … → Run workflow.

**Ongoing:** the daily/6‑hourly crons are already configured, so once the secrets
are set the data keeps accruing automatically — no babysitting needed.

---

## 4. The time dimension (why it isn't instant)

- **Curated signal:** available within **days** — as soon as Spotify ingest has
  run a few times so editorial adds accumulate vs the prior window.
- **Streaming MoM:** the query compares **last 30d vs prior 30d**, so it needs
  **~2 months of daily rows** to be meaningful. A single run is one snapshot;
  growth only becomes real once the daily ingests have filled both windows.
  (No provider here exposes historical daily series to backfill it instantly;
  Luminate is the most likely source if historical pulls are available.)

---

## 5. Verify progress

Re‑run **Actions → “Discovery Test — Songs To Watch” → Run workflow** anytime.
Read the **PRODUCTION DATA COVERAGE** block at the top of the logs:

- `Editorial playlists` and `Adds on curated playlists` climb once Spotify runs.
- Streaming `date range` widens each day; once it spans ≥ ~31 days with a
  populated prior window, the streaming guard clears.
- When both signals clear, the **INSUFFICIENT** report is replaced by the ranked
  top‑10 (with per‑signal movers shown while the combined list is still thin).

---

## 6. Known cleanup (separate task)

The current `tracks` table contains scraped non‑song rows (titles like `WEEKS`,
`PEAK`, calendar fragments). Spotify ingest seeds a clean catalog going forward,
but those existing rows should be removed so they don't surface in results. Ask
and we'll add a guarded cleanup script.
