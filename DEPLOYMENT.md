# Deployment Guide

Production deployment runbook for the Music Intelligence API (Next.js 14 on
Vercel + Postgres + an optional Python ML sidecar).

---

## 1. Architecture at a glance

| Component | Tech | Hosting |
|-----------|------|---------|
| Web app + REST API | Next.js 14 (App Router) | Vercel |
| Database | PostgreSQL (Prisma ORM) | Supabase (or any managed Postgres) |
| Rate limiting | Upstash Redis (optional) | Upstash |
| Scheduled jobs | Vercel Cron + GitHub Actions | Vercel / GitHub |
| ML inference | FastAPI (`ml/api`, `services/ar-api`) | Railway / Fly.io (separate service) |

The Next.js app is fully functional **without** the ML service and Redis — those
degrade gracefully (rate limiting is skipped if Redis env vars are absent; the
ML trajectory endpoint returns an error only if called without `ML_ARTIST_TRAJECTORY_URL`).

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

### Required for specific features
| Variable | Needed by |
|----------|-----------|
| `INTERNAL_API_BASE_URL` | **Server-rendered detail pages** (`/tracks/[id]`, `/curators/[id]`, `/playlists/[id]`, `/songwriters/[id]`) fetch the internal API server-side. Without an absolute base URL these pages render "not found". Set to your deployment URL (e.g. `https://app.example.com`). |
| `NEXT_PUBLIC_API_KEY` + `NEXT_PUBLIC_API_BASE_URL` | The bundled dashboard pages call the v1 API. Use a **low-privilege, scoped** key — it ships in the browser bundle. |
| `ML_ARTIST_TRAJECTORY_URL` | Artist trajectory prediction endpoint (points at the FastAPI ML service). |
| `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` | Rate limiting. If absent, rate limiting is disabled (all requests allowed). |
| `ALLOWED_ORIGIN` | CORS allow-origin for `/api/*`. Defaults to `*`; set to your domain. |
| `INTERNAL_CRON_SECRET` | Auth between the trajectory cron and the internal ETL endpoint. |
| Data-provider keys | The ingest/ETL jobs (see `.env.example` for the full list). |

See `.env.example` for the complete, annotated list (kept in sync with the code).

---

## 4. Database setup

> ⚠️ **Migration model:** this project deploys its schema with `prisma db push`,
> **not** `prisma migrate deploy`. The `prisma/migrations/` folder is **not a
> complete history** — it only contains incremental add-ons (indexes, watchlist/
> digest/alert tables, prediction outcomes) layered on top of a base schema that
> was originally created via `db push`. There is no baseline migration, so
> `migrate deploy` on a fresh DB will fail. See "Deployment debt" below.

**First deploy (fresh database):**
```bash
DATABASE_URL=<direct-5432-url> DIRECT_URL=<direct-5432-url> npx prisma db push
```

**Subsequent schema changes:** trigger the **Database Migrations** GitHub Action
(`.github/workflows/db_migrate.yml`, `workflow_dispatch`). It runs `prisma db push`
against the session pooler. Note: `--accept-data-loss` was intentionally removed —
the push **aborts** on any destructive change so a human can review it. Never
re-add that flag to an automated workflow.

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
| `/api/cron/check-alert-rules` | `0 */2 * * *` (every 2h) |

Vercel automatically attaches `Authorization: Bearer $CRON_SECRET` to cron
requests **when `CRON_SECRET` is set**. Sub-daily schedules require the Vercel
**Pro** plan.

### GitHub Actions (ingestion, ETL, ML)
The 16 workflows under `.github/workflows/` run ingestion, ETL, and ML training
on schedules / manual dispatch. They require these repo secrets:
`DATABASE_URL`, plus the relevant provider keys (`SPOTIFY_CLIENT_ID/SECRET`,
`YOUTUBE_API_KEY`, `TIKTOK_*`, `RAPIDAPI_KEY`, `SHAZAM_API_KEY`,
`FIRECRAWL_API_KEY`, `SEARCHAPI_KEY`, `META_*`, `LUMINATE_*`, `SOUNDCHARTS_*`,
`SONGSTATS_*`).

> The **artist-trajectory ETL** runs via the `artist_etl.yml` workflow
> (`npm run etl:artist-all`), **not** via the `/api/cron/etl-artist-trajectory`
> route — that route targets an internal ETL endpoint that does not exist in
> this codebase and is therefore left out of the Vercel cron schedule.

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

## 8. Post-deploy verification

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

## 9. Deployment debt (tracked, not yet resolved)

- **No baseline Prisma migration.** Schema is managed by `db push`. To move to a
  proper migration history, generate a baseline with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma`
  against a checkpoint, add a `migration_lock.toml`, then switch deploys to
  `prisma migrate deploy`. Requires validation against a copy of prod.
- **Residual npm advisories.** `npm audit` reports 2 low-impact transitive
  advisories whose only fix is a Next.js **major** (preview) upgrade — deferred.
  The critical/high Next.js CVEs were resolved by upgrading to 14.2.x.
- **`/api/cron/etl-artist-trajectory`** is a dead route (its target endpoint
  doesn't exist); ETL runs via GitHub Actions instead.
