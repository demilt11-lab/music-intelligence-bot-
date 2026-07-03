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
| ML inference (artist trajectory) | In-process TS model (`lib/ml/`) | Same Vercel deployment — no separate service |

The Next.js app is fully functional **without** Redis — rate limiting falls
back to a real (if per-instance) in-memory limiter when Redis env vars are
absent, never to unlimited. There is a separate, optional Python/FastAPI ML
service (`ml/api`) that has never been deployed and that nothing in the app
calls by default — see §7.

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

**Backups & recovery:** this project does not run its own backup job — it
relies entirely on the managed Postgres provider's backup posture. On
Supabase specifically:
- **Free/Pro tier**: daily backups, retained per the plan's window (Pro:
  7 days by default, longer with the PITR add-on). Point-in-time recovery
  (restore to any second, not just a daily snapshot) is a paid add-on, not
  enabled by default.
- Verify the actual plan/retention window in the Supabase dashboard
  (**Database → Backups**) — the defaults above can change and this repo
  has no way to confirm what's actually configured for your project.
- If a real RPO/RTO requirement exists (e.g. "no more than 1 hour of data
  loss is acceptable"), confirm PITR is enabled before launch — the daily
  snapshot default does not meet that bar.
- `jobs/etl/data_retention.ts` and `db_seed.yml`/`cleanup_junk_tracks.yml`
  are additive/idempotent or dry-run-gated (see their own docs), so none of
  them should be a routine source of unrecoverable data loss — but they are
  not a substitute for provider-level backups if something goes wrong
  upstream of this app (e.g. a bad manual query against the database).

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
The 31 workflows under `.github/workflows/` run ingestion, ETL, ML training,
and pipeline ops on schedules / manual dispatch. Depending on which
workflows you use, they require these repo secrets:
- `DATABASE_URL` — required by nearly all of them.
- Provider keys: `SPOTIFY_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY`,
  `RAPIDAPI_KEY` (writers/producers external search), `SHAZAM_API_KEY`,
  `FIRECRAWL_API_KEY`, `SEARCHAPI_KEY`, `META_*`, `LUMINATE_*`,
  `SOUNDCHARTS_APP_ID`/`SOUNDCHARTS_API_KEY`, `SONGSTATS_*`.
- **TikTok needs no API keys**: `ingest_tiktok.yml` crawls TikTok Creative
  Center's public trending-music charts through the self-hosted crawl4ai
  service (`services/crawler-api`), booted inside the Actions runner on
  each run. Set a `CRAWLER_API_URL` repo **variable** (plus optional
  `CRAWLER_API_KEY` secret) to use a deployed crawler instance instead.
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

> The **Soundcharts ingest** (`ingest_soundcharts.yml`, daily 05:00 UTC) is
> what feeds Apple Music / Amazon playlist placements and Spotify
> monthly-listener + follower series. It is an **optional** data source:
> without `SOUNDCHARTS_APP_ID` / `SOUNDCHARTS_API_KEY` the workflow
> **skips cleanly** (green run, no Slack alert) and those datasets stay
> empty — the corresponding directory pages show honest empty states and
> the ML listener features remain null (the models handle that). Add the
> two repo secrets to activate it; per-run API budgets are tunable via
> `SOUNDCHARTS_RESOLVE_BUDGET`, `SOUNDCHARTS_PLAYLIST_SONG_BUDGET`, and
> `SOUNDCHARTS_ARTIST_BUDGET` (see `jobs/ingest/soundcharts.ts`).

> The **artist-trajectory ETL** runs via the `artist_etl.yml` workflow daily
> at 8:30 UTC (after ingestion). The `/api/cron/etl-artist-trajectory` route
> also runs the same ETL inline (idempotent) and can be scheduled on Vercel
> Pro for an intraday refresh. A daily **Data Reconciliation** workflow (9:30
> UTC) verifies cross-table invariants and signal freshness, and
> **Pipeline Alerts** posts any workflow failure to Slack when
> `SLACK_WEBHOOK_URL` is configured.

---

## 7. ML service (optional, not required)

Artist trajectory predictions (`/api/v1/artist/trajectory/predict` and the
public forwarding route) are served by the in-process TypeScript model at
`lib/ml/models/artist-trajectory.ts` — trained and promoted via
`/api/internal/ml/train` (see `ml_train.yml`), stored in the `ml_models`
table, no separate service to deploy or keep alive. This is real,
functioning ML: a logistic regression trained on historical trajectory
snapshots, evaluated on a held-out split, gated against regressing below the
current production model before being promoted.

The standalone Python/FastAPI service (`ml/api/artist_trajectory_service.py`)
is separate research scaffolding — a from-scratch XGBoost/PyTorch pipeline
with real training code but no deployment target and no trained model
artifacts committed anywhere. **Nothing in this app calls it.** If you want
to stand it up as an independent, more sophisticated alternative:
```bash
pip install -r requirements.txt
uvicorn ml.api.artist_trajectory_service:app --host 0.0.0.0 --port 8000
```
then point `ML_ARTIST_TRAJECTORY_URL` at its public URL and wire a route to
call it — as of now, setting that variable alone does nothing.

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
4. Check `https://<domain>/status` (sign in first) for job health, data
   freshness, and any unacknowledged high-severity anomalies.

---

## 9. Rollback & incident response

**A bad app deploy (broken build, regressed behavior, not a DB issue):**
1. Vercel → Project → Deployments → find the last known-good deployment →
   **⋯ → Promote to Production** (a.k.a. Instant Rollback). This is
   immediate and does not require a new build.
2. If the bad deploy already merged to `main`, also `git revert` the
   offending commit(s) on `main` so the next deploy doesn't reintroduce it.

**A bad migration (schema change broke something):**
1. Prisma migrations are forward-only by default — there is no
   `prisma migrate down`. Write a new migration that reverses the change
   (e.g. drop the column/index a prior migration added) and deploy it via
   `db_migrate.yml`, the same path as any other migration.
2. If the migration hasn't been applied to production yet (caught in
   review), just remove the migration folder before merging — nothing to
   roll back.
3. For a destructive migration already applied to production with data
   loss: restore from a Supabase backup (see §4) to a **branch/point-in-time
   snapshot first**, verify the data there, then decide whether to restore
   the whole database or hand-copy the affected rows back. Do not restore
   the primary database directly without inspecting the snapshot first.

**A bad model promotion (ML model regressed in production):**
Should be rare — the promotion gate in `lib/ml/models/{artist-trajectory,
track-viral}.ts` already blocks a retrain that regresses held-out accuracy
by more than 2 points vs. the incumbent. If a bad model still got promoted
(e.g. the regression was subtle enough to pass the gate but wrong in
practice): call `POST /api/internal/ml/train` again once the underlying
data issue is fixed — training always compares against the current
incumbent, so a good retrain will simply replace the bad one. There is no
separate "previous model" store to roll back to (`ml_models` holds one row
per model type) — this is a known gap, not a solved one.

**A bad pipeline run (ingest/ETL wrote bad data):**
Check `/status` or the `job_runs` table for the specific run, then check
`pipeline_alerts.yml` (Slack, if configured) for what fired. Most ETL jobs
recompute derived tables from source data rather than incrementally
mutating them, so re-running the job after fixing the root cause (bad
credential, upstream API change, etc.) self-heals in most cases — this is
job-specific, there is no single "undo" command.

**Who to page:** not formalized in this repo — no on-call rotation or
incident-severity definitions exist yet. At minimum, confirm who owns
watching `/status` and the Slack alerts channel before launch.

---

## 10. Deployment debt (tracked, not yet resolved)

- **One moderate npm advisory.** postcss <8.5.10 pinned *inside Next's own
  bundle* (`node_modules/next/node_modules/postcss`) — present in every Next
  release through 16.x and only fixable upstream by Next. Our top-level
  postcss is patched. CI's blocking `npm audit --audit-level=high` gate is
  unaffected.

- **Branch protection on `main` is still unverified.** Needs a repo admin to
  require the `ci.yml` checks in GitHub Settings → Branches — not something
  that can be confirmed or set from inside the repository or via any
  available tool. Until this is set, a failing-CI PR can still merge.

- **Validation rigor still varies by route** (some go through
  `lib/shared/validation.ts` + a dedicated `validate.ts`, others do an inline
  check in the route). Audited the highest-risk intersection — routes that
  both take user input and feed a raw `$queryRaw(Unsafe)` query (the airplay
  chart endpoints) — and found every one properly parameterized (positional
  binds or an allowlisted identifier, never string-concatenated user input).
  No actual bug found; left as a style-consistency backlog item rather than
  sweeping all ~80 routes to one pattern, which would be a large, low-value
  refactor of a stable, shipped API surface.

- **No APM/error-tracking product** (Sentry or similar) — Vercel's own
  runtime-error/log dashboards remain the only production visibility. Needs a
  vendor account and DSN this repo doesn't have; nothing to wire up without
  that.

- **No browser-based E2E framework.** `npm run smoke` (`scripts/smoke.ts`) is
  a real HTTP-level integration test that runs in CI and now explicitly
  checks that F-02/F-03/F-06's previously-open routes (`/api/artists/breaking`,
  `/api/artists/:id`, `/api/artists/:id/trajectory`, `/api/ai/scout-brief`,
  `/api/talent-scout/health`) 401 without a session — that gap existed until
  2026-07-02. A true browser-driving suite (Playwright: render JS, click
  through the UI) is still a separate, larger lift not started here.

Resolved 2026-06-11: **Next.js 16.2.9 + React 19 migration** — clears all
high-severity framework advisories. Includes async request APIs (codemod),
`middleware.ts` → `proxy.ts`, `serverExternalPackages`, ESLint 9 flat config
(`next lint` was removed), Turbopack builds, and React 19 type updates.

Resolved in the 2026-06 hardening passes: baseline Prisma migration (squashed,
`migrate deploy` proven in CI), the dead `/api/cron/etl-artist-trajectory`
route (now runs the ETL inline), browser-exposed API keys (session auth), and
ETL typecheck coverage.
