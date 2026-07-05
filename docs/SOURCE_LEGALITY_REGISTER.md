# Source Legality & Access Register + Takedown Runbook

**Purpose:** document, per data source, *how* we access it, the *legal basis*,
what we *store vs. discard*, and our *rate/robots posture* — plus the process
for handling a takedown or blocking a source. This is the checklist's required
"source legality and access review" evidence and its "takedown / source-blocking
process."

**Last reviewed:** 2026-07-05 · **Owner:** Data / Legal · **Review cadence:** quarterly

---

## 1. Access-method categories

- **Licensed API** — accessed under a commercial contract / enterprise
  agreement. Governed by that contract, not scraping law.
- **Official platform API** — accessed under the platform's published developer
  terms with our own credentials (least-risk public access).
- **Crawl** — HTML retrieved via our crawler service (`services/crawler-api`,
  crawl4ai). Governed by the site's ToS + robots + applicable law; lowest
  frequency, most caution.

Everything below is **factual market/metadata** (chart positions, play counts,
follower counts, release metadata, identifiers). We do **not** store or serve
copyrighted audio, full lyrics, or article full-text — see §3.

## 2. Register

| Source | Category | Access method | Legal basis | Freq (cron) | We store | We discard |
|---|---|---|---|---|---|---|
| Spotify | Official API | Web API, client-credentials (`SPOTIFY_CLIENT_*`) | Spotify Developer Terms | daily | popularity, followers, playlist/track metadata, IDs | audio, 30s previews beyond URL ref |
| YouTube | Official API | Data API v3 (`YOUTUBE_API_KEY`) | YouTube API Services Terms | daily | view/like counts, video/channel metadata, IDs | video content, comments |
| Instagram | Official API | Meta Graph API (`META_APP_*`) | Meta Platform Terms | daily | follower counts, post counts (business/creator) | media binaries, private data |
| Google Trends | Vendor API | via SearchAPI.io (`SEARCHAPI_KEY`) | SearchAPI ToS | daily | relative interest indices | none sensitive |
| Luminate | **Licensed API** | `api.luminatedata.com` (`LUMINATE_API_KEY`) | Enterprise data licence | daily 06:00 | sales/streams/airplay aggregates | per-contract fields not licensed |
| Soundcharts | **Licensed API** | Soundcharts API | Enterprise/API subscription | daily/6–8h | cross-platform metrics, radio, playlists | per-contract |
| Shazam | Vendor API | via RapidAPI (`RAPIDAPI_KEY`) | RapidAPI + provider terms | daily | Shazam counts / chart positions | audio fingerprints |
| TikTok | Mixed | RapidAPI + crawl of Creative Center Trends | RapidAPI terms / site ToS | 6–12h | UGC/track/video/creator chart rows | video content |
| Billboard | Crawl | crawler service (`CRAWLER_API_URL`) | billboard.com ToS + robots | daily 06:15 | chart positions + track/artist names | article text |
| Apple / DSP charts | Crawl | `crawl_dsp_apple` | site ToS + robots | daily | chart positions, track/artist refs | audio, editorial copy |
| Social (X) | Crawl | `crawl_social_x` | site ToS + robots | 6–10h | public post/engagement counts | post bodies beyond snippet |
| Radio spins | Crawl | `crawl_radio_spins` | site ToS + robots | daily | spin counts by station/market | audio |
| Radiostats | Vendor API | Radiostats API | subscription | daily | airplay/spin aggregates | audio |

Credentials are enumerated (booleans only) at `/api/health`; none are logged.

## 3. Copyright-sensitive content handling

- **Stored:** factual metrics, identifiers (ISRC/UPC/ISWC/platform IDs), names,
  chart positions, timestamps, and derived scores. These are facts, not
  expression.
- **Referenced, not copied:** preview/cover URLs are stored as **links** to the
  source, not rehosted binaries.
- **Never stored:** full audio, full lyrics, or full article/editorial text.
  Crawlers extract structured fields via `JsonCssExtractionStrategy`, not
  wholesale page copies.
- **Transformations** (scores, trends, aggregates) are our own derived work.

## 4. Rate & robots posture

- **Licensed/official APIs** are called within documented rate limits on low,
  fixed schedules (daily/6–12h GitHub Actions cron), with graceful retry/backoff
  in each client and `runTrackedJob` recording every run.
- **Crawls** run at the *lowest* useful cadence, single-threaded per source, with
  a render delay (`delay_before_return_html_s`) rather than aggressive parallel
  fetching.
- **Action item (tracked):** add explicit `robots.txt` fetch-and-honor plus a
  descriptive, contactable `User-Agent` to the crawler service before enabling
  any *new* crawl source. Current crawl sources are chart/aggregate pages
  reviewed individually; the automated robots check hardens this going forward.
  Owner: Data. Target: pre-GA.

## 5. Takedown & source-blocking runbook

**Intake.** A takedown / objection can arrive via `security@`/`legal@` or a
source's abuse contact. Log it (who, source, URL/entity, date, claim type).

**Triage (same business day).**
1. Identify the source and the specific entities/fields implicated.
2. Classify: (a) access objection (stop crawling), (b) content objection (purge
   stored data), or (c) both.

**Block a source (stops future ingestion) — effective immediately.**
1. Disable the source's scheduled workflow: GitHub → Actions → the relevant
   `ingest_*.yml` → **Disable workflow** (mirrors the TikTok pause precedent in
   the git history). This halts new pulls without a deploy.
2. Remove/rotate the source credential if the objection is to access itself.
3. Record the block and its reason in this register (add a struck-through row).

**Purge stored data (content objection).**
1. Scope the rows: the crawl/ingest job for each source writes to identifiable
   tables (chart-row, platform-stats, UGC tables) tagged by `platform`/source.
2. Delete with a targeted, tenant-agnostic query on the source dimension (the
   corpus is shared reference data, not tenant-owned), e.g. remove the affected
   `platform`/entity rows and any derived signals recomputed from them.
3. Re-run the affected ETL so derived tables (`compute_*_signals`, trend labels)
   recompute *without* the purged inputs — most ETL recomputes from source, so
   this self-heals (see `DEPLOYMENT.md §11`).
4. Confirm removal from any export path (watchlist/talent-scout CSV) on next
   generation.

**Respond.** Acknowledge the requester within 3 business days; confirm the block
and/or purge with the effective date. Escalate contract-source objections to the
account owner for that data licence.

**Verify & close.** Re-check `/status` and `job_runs` to confirm the source is no
longer running; note completion in the intake log.
