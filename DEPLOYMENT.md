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
| `AUTH_SECRET` | Signs UI session cookies. **Required in production — the app fails closed (503) without it.** Generate with `openssl rand -base64 32`. Provision users with `npm run create-user -- you@co.com <password> ADMIN`. |

### Required for specific features
| Variable | Needed by |
|----------|-----------|
| `INTERNAL_API_BASE_URL` | **Server-rendered detail pages** (`/tracks/[id]`, `/curators/[id]`, `/playlists/[id]`, `/songwriters/[id]`) fetch the internal API server-side. Without an absolute base URL these pages render "not found". Set to your deployment URL (e.g. `https://app.example.com`). |
| `UI_TENANT_SLUG` | Tenant slug the first-party web UI operates under (default `workspace`, auto-created on first use). The UI no longer ships any API key to the browser — `/api/ui/*` routes resolve the tenant server-side. |
| `SCOUT_SAMPLE_FALLBACK` | Set to `1` to let the Talent Scout return clearly-labeled sample rows when no UGC/ML/chart data exists (default off: an honest empty state is shown instead). |
| `ML_ARTIST_TRAJECTORY_URL` | Artist trajectory prediction endpoint (points at the FastAPI ML service). |
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
The 30 workflows under `.github/workflows/` run ingestion, ETL, ML training,
and pipeline ops on schedules / manual dispatch. Depending on which
workflows you use, they require these repo secrets:
- `DATABASE_URL` — required by nearly all of them.
- Provider keys: `SPOTIFY_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY`, `TIKTOK_*`,
  `RAPIDAPI_KEY`, `SHAZAM_API_KEY`, `FIRECRAWL_API_KEY`, `SEARCHAPI_KEY`,
  `META_*`, `LUMINATE_*`, `SOUNDCHARTS_*`, `SONGSTATS_*`.
- `CRON_SECRET` — same value as the Vercel env var; some workflows call back
  into the deployed app's `/api/cron/*` routes and need it to authenticate.
- `INTERNAL_ADMIN_SECRET` — used by `ml_train.yml` and `provision_user.yml`
  to call the app's `/api/internal/*` management routes. Same value as the
  Vercel env var of the same name.
- `VERCEL_URL` — the deployed app's hostname (e.g.
  `your-app.vercel.app`, no scheme), used by `ml_train.yml` to build the
  callback URL for `/api/internal/ml/train`. **This is a repo secret you
  must set by hand** — despite the name, it is not the same as the
  `VERCEL_URL` environment variable Vercel auto-injects into deployments;
  GitHub Actions runs outside Vercel's build environment and has no access
  to that. Keep it in sync with your production domain.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — used by `db_seed.yml` and
  `provision_user.yml` to create the first admin user.
- `SLACK_WEBHOOK_URL` — optional; `pipeline_alerts.yml` no-ops without it.

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
