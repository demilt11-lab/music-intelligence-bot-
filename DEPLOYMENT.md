# Deployment Guide

Production deployment runbook for the Music Intelligence API (Next.js 16 on
Vercel + Postgres + an optional Python ML sidecar).

---

## 1. Architecture at a glance

| Component | Tech | Hosting |
|-----------|------|---------|
| Web app + REST API | Next.js 16 (App Router, Turbopack) | Vercel |
| Database | PostgreSQL (Prisma ORM) | Supabase (or any managed Postgres) |
| Rate limiting | Upstash Redis (optional) | Upstash |
| Scheduled jobs | Vercel Cron + GitHub Actions | Vercel / GitHub |
| ML inference | FastAPI (`ml/api`, `services/ar-api`) | Railway / Fly.io (separate service) |
| Crawling (crawl4ai) | FastAPI (`services/crawler-api`) | Railway / Fly.io (separate service) |

The Next.js app is fully functional **without** the ML service, crawler
service, and Redis — those degrade gracefully (rate limiting is skipped if
Redis env vars are absent; the ML trajectory endpoint returns an error only
if called without `ML_ARTIST_TRAJECTORY_URL`; the crawl-based ingest jobs
fail closed with a clear "missing CRAWLER_API_URL" error but the serving API
itself is unaffected).

---

## 2. Prerequisites

1. A **Vercel** project linked to this repo.
2. A **PostgreSQL** database. Supabase recommended — use the **transaction
   pooler** (port 6543) for `DATABASE_URL` and the **session pooler / direct**
   (port 5432) for `DIRECT_URL`.
3. (Optional) **Upstash Redis** for rate limiting.
4. (Optional) Third-party API keys (Spotify, YouTube, TikTok, Shazam, Luminate,
   Soundcharts, Songstats, Firecrawl, Meta/Instagram, SearchAPI) for the
   ingest/ETL jobs. The serving API works without them; ingestion does not.
5. (Optional) A deployed `services/crawler-api` instance (`CRAWLER_API_URL`)
   for the crawl4ai-based ingest jobs (Billboard, Apple Music charts, X
   followers, radio spins). See § 8.

---

## 3. Environment variables

Copy `.env.example` → `.env.local` for local dev. In production set them in
**Vercel → Project → Settings → Environment Variables**.

### Required for the app to boot / serve
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (transaction pooler, `?pgbouncer=true`). Prisma Client is created at import time, so this **must** be present or the build/runtime fails. |
| `DIRECT_URL` | Direct/session-pooler connection used for schema migrations. |
| `CRON_SECRET` | Authenticates Vercel Cron → `/api/cron/*`. **The app fails closed** — if unset, every `/api/cron/*` call returns 401. Generate with `openssl rand -base64 32`. |
| `AUTH_SECRET` | Signs UI session cookies. **Required in production — the app fails closed (503) without it.** Generate with `openssl rand -base64 32`. Provision users with `npm run create-user -- you@co.com <password> ADMIN`. |

### Required for specific features
| Variable | Needed by |
|----------|-----------|
| `INTERNAL_API_BASE_URL` | **Server-rendered detail pages** (`/tracks/[id]`, `/curators/[id]`, `/playlists/[id]`, `/songwriters/[id]`) fetch the internal API server-side. Without an absolute base URL these pages render "not found". Set to your deployment URL (e.g. `https://app.example.com`). |
| `UI_TENANT_SLUG` | Tenant slug the first-party web UI operates under (default `workspace`, auto-created on first use). The UI no longer ships any API key to the browser — `/api/ui/*` routes resolve the tenant server-side. |
| `SCOUT_SAMPLE_FALLBACK` | Set to `1` to let the Talent Scout return clearly-labeled sample rows when no UGC/ML/chart data exists (default off: an honest empty state is shown instead). |
| `ML_ARTIST_TRAJECTORY_URL` | Artist trajectory prediction endpoint (points at the FastAPI ML service). |
| `CRAWLER_API_URL` + `CRAWLER_API_KEY` | crawl4ai crawler service (points at `services/crawler-api`). Required by `ingest:billboard`, `ingest:crawl-dsp-apple`, `ingest:crawl-social-x`, `ingest:crawl-radio-spins`; the serving API is unaffected if unset. |
| `AR_API_URL` | Predictive A&R FastAPI service (`services/ar-api`). Required by the `/ar-bot` chat's tool-calling loop (`lib/bot/execute.ts`); combined with `ANTHROPIC_API_KEY` for the reply itself. If unset, `/ar-bot` shows an "unconfigured" banner instead of failing. |
| `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` | Rate limiting. If absent, rate limiting is disabled (all requests allowed). |
| `ALLOWED_ORIGIN` | CORS allow-origin for `/api/*`. Defaults to `*`; set to your domain. |
| Data-provider keys | The ingest/ETL jobs (see `.env.example` for the full list). |

> Removed in this hardening pass: `NEXT_PUBLIC_API_KEY` / `NEXT_PUBLIC_API_BASE_URL`
> (the dashboard previously shipped a tenant API key in the browser bundle) and
> `INTERNAL_CRON_SECRET` (the trajectory cron now runs the ETL inline instead of
> calling a separate internal endpoint).

See `.env.example` for the complete, annotated list (kept in sync with the code).

---

## 4. Database setup

> ✅ **Migration model:** as of 2026-06-11 the schema deploys with
> `npx prisma migrate deploy` from a squashed baseline
> (`prisma/migrations/20260611000000_baseline`). Fresh databases work
> directly; databases previously managed via `db push` must run
> `npx prisma migrate resolve --applied 20260611000000_baseline` once first
> (see prisma/migrations/README.md).

**First deploy (fresh database):**
```bash
DATABASE_URL=<direct-5432-url> DIRECT_URL=<direct-5432-url> npx prisma migrate deploy
```

**Existing database previously managed by `db push`:** mark the baseline applied once:
```bash
npx prisma migrate resolve --applied 20260611000000_baseline
npx prisma migrate deploy
```

**Subsequent schema changes:** create a migration locally with
`npx prisma migrate dev --name <change>`, commit it, and run
`npx prisma migrate deploy` against production (or trigger the Database
Migrations workflow).

---

## 5. Build & deploy (Vercel)

`vercel.json` pins the build:
```
buildCommand:   prisma generate && next build
installCommand: npm install
framework:      nextjs
regions:        iad1
```

Standard flow: push to `main` → Vercel builds and deploys. The build is
**type-checked and linted** (the previous `typescript.ignoreBuildErrors`
escape hatch has been removed), so type errors now fail the build.

CI (`.github/workflows/ci.yml`) gates every PR with typecheck → lint → build →
unit tests, plus an end-to-end smoke test against a real Postgres.

---

## 6. Scheduled jobs

### Vercel Cron (defined in `vercel.json`)
| Path | Schedule (UTC) |
|------|----------------|
| `/api/cron/send-daily-digest` | `0 13 * * *` (daily 13:00) |
| `/api/cron/check-alert-rules` | `0 14 * * *` (daily 14:00) |

Vercel automatically attaches `Authorization: Bearer $CRON_SECRET` to cron
requests **when `CRON_SECRET` is set**. Both crons run **daily** because the
Vercel **Hobby** plan only allows daily schedules. To run alert checks more
frequently (e.g. every 2h: `0 */2 * * *`), upgrade to the **Pro** plan.

### GitHub Actions (ingestion, ETL, ML)
The workflows under `.github/workflows/` run ingestion, ETL, and ML training
on schedules / manual dispatch. They require these repo secrets:
`DATABASE_URL`, plus the relevant provider keys (`SPOTIFY_CLIENT_ID/SECRET`,
`YOUTUBE_API_KEY`, `TIKTOK_*`, `RAPIDAPI_KEY`, `SHAZAM_API_KEY`,
`FIRECRAWL_API_KEY`, `CRAWLER_API_URL`, `CRAWLER_API_KEY`, `SEARCHAPI_KEY`,
`META_*`, `LUMINATE_*`, `SOUNDCHARTS_*`, `SONGSTATS_*`).

> Billboard, Apple Music charts (`ingest_crawl_dsp_apple.yml`), X followers
> (`ingest_crawl_social_x.yml`), and radio spins (`ingest_crawl_radio_spins.yml`)
> all require `CRAWLER_API_URL` — they run against the crawl4ai service in
> § 8, not a hosted API, so this secret must point at a reachable deployment
> for those four workflows to do anything.

> The **artist-trajectory ETL** runs via the `artist_etl.yml` workflow daily
> at 8:30 UTC (after ingestion). The `/api/cron/etl-artist-trajectory` route
> also runs the same ETL inline (idempotent) and can be scheduled on Vercel
> Pro for an intraday refresh. A daily **Data Reconciliation** workflow (9:30
> UTC) verifies cross-table invariants and signal freshness, and
> **Pipeline Alerts** posts any workflow failure to Slack when
> `SLACK_WEBHOOK_URL` is configured.

---

## 7. ML service (optional)

The Python FastAPI service is deployed separately:
```bash
pip install -r requirements.txt
uvicorn ml.api.artist_trajectory_service:app --host 0.0.0.0 --port 8000
```
Point `ML_ARTIST_TRAJECTORY_URL` at its public URL. If the service is not
deployed, only the artist-trajectory prediction endpoints are affected.

---

## 8. Crawler service (optional)

The crawl4ai-backed FastAPI service (`services/crawler-api`) is also deployed
separately — it needs a real Chromium install, so it can't run inside the
Vercel build:
```bash
cd services/crawler-api
pip install -r requirements.txt
python -m playwright install --with-deps chromium
uvicorn main:app --host 0.0.0.0 --port 8090
```
Point `CRAWLER_API_URL` at its public URL (and set `CRAWLER_API_KEY` on both
sides if you want the endpoint to require auth — it's open by default, same
posture as `services/ar-api`). If the service is not deployed, `ingest:billboard`,
`ingest:crawl-dsp-apple`, `ingest:crawl-social-x`, and `ingest:crawl-radio-spins`
fail closed with a clear missing-env error; everything else is unaffected.
See `services/crawler-api/README.md` for the API surface.

---

## 9. A&R bot service (optional)

`services/ar-api` (Predictive A&R API) is deployed the same way:
```bash
cd services/ar-api
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080
```
Point `AR_API_URL` at its public URL. It's consumed by the `/ar-bot` chat page
via a Claude tool-calling loop (`lib/ai/agent.ts` + `lib/bot/tools.ts` +
`lib/bot/execute.ts`) — requires both `AR_API_URL` and `ANTHROPIC_API_KEY` to
produce real replies; the page shows which one is missing otherwise. Note
`playlists_to_pitch` intentionally returns 501 (unimplemented) — the UI
surfaces that as a plain error rather than fabricating recommendations.

---

## 10. Post-deploy verification

1. **Health:** `curl https://<domain>/api/health` → `{"status":"ok","db":"up"}`.
2. **Smoke test** (against any environment with DB access + a running server):
   ```bash
   SMOKE_BASE_URL=https://<domain> npm run smoke
   ```
   It validates the track detail path (incl. BigInt serialization), 400/404
   handling, v1 auth enforcement, and cron fail-closed behavior, cleaning up its
   own fixture data afterwards.
3. Spot-check a real track page: `https://<domain>/tracks/<id>`.

---

## 11. Deployment debt (tracked, not yet resolved)

- **One moderate npm advisory.** postcss <8.5.10 pinned *inside Next's own
  bundle* (`node_modules/next/node_modules/postcss`) — present in every Next
  release through 16.x and only fixable upstream by Next. Our top-level
  postcss is patched. CI's blocking `npm audit --audit-level=high` gate is
  unaffected.

Resolved 2026-06-11: **Next.js 16.2.9 + React 19 migration** — clears all
high-severity framework advisories. Includes async request APIs (codemod),
`middleware.ts` → `proxy.ts`, `serverExternalPackages`, ESLint 9 flat config
(`next lint` was removed), Turbopack builds, and React 19 type updates.

Resolved in the 2026-06 hardening passes: baseline Prisma migration (squashed,
`migrate deploy` proven in CI), the dead `/api/cron/etl-artist-trajectory`
route (now runs the ETL inline), browser-exposed API keys (session auth), and
ETL typecheck coverage.
