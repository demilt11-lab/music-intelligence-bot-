# UX Walkthrough — Top 3 Jobs-to-be-Done

**Purpose:** demonstrate that target label users can complete the top three jobs
**without founder handholding**, mapped step-by-step to the real screens and
components. This is the checklist's required "UX walkthrough for top user
journeys," and it answers the hard-stop *"critical workflows require founder
handholding."*

**Date:** 2026-07-05 · Everything below references shipped routes/components.

---

## First-run experience (no training session required)

On login the user lands on **Home** (`app/page.tsx`), which is a guided launch
pad, not an empty dashboard:

- **CommandBar** (`components/buddy/CommandBar.tsx`) — a single "what do you want
  to do?" entry point. It stays disabled until there's input, then routes to the
  matching screen (this is the flow the Playwright E2E test
  `tests/e2e/homepage.spec.ts` exercises: disabled → enabled → navigate).
- **ScoutingWorkflows** quick-action tiles (`components/buddy/ScoutingWorkflows.tsx`):
  *Scout breakout artists*, *Search artists & tracks*, *Compare*, *Open your
  watchlist* — each a labeled, described shortcut into a top job.
- Persistent left nav (`components/layout/SidebarNav.tsx`): Home · Buddy Scout ·
  A&R Bot · Artists · Playlists · Curators · Watchlist · Search · API Keys.

A new user can reach any top job in **one click from Home** with no manual.

---

## Job 1 — A&R: find and vet a breaking artist/track

**Persona:** A&R scout. **Goal:** surface who's breaking, decide who's worth
attention.

| Step | Screen / action | Component (evidence) |
|---|---|---|
| 1 | Home → **"Scout breakout artists"** tile | `ScoutingWorkflows.tsx` |
| 2 | **Buddy Scout** ranks today's breakouts with conviction scores + market/mode filters | `/talent-scout` → `DailyTalentScout`, `ScoutTrackCard`, `UsageStatsWidget` |
| 3 | Read the **AI scout brief** (grounded summary; falls back to a labeled heuristic when no model) | `SignalsSection`, `lib/ai/scoutBrief.ts` |
| 4 | Open the artist/track to inspect signals & trajectory | `/artists/[artistId]`, `/tracks/[trackId]` → `SignalsPanel`, `ViralScoreGauge`, `TrendSparkline` |
| 5 | **Add to Watchlist** to track it | `components/watchlist/AddToWatchlistButton.tsx` |

**Trust:** scores show provenance/`dataSource` meta; the brief never fabricates
metrics (guardrail + heuristic fallback). **Done when** the prospect is on the
watchlist (visible confirmation toast).

**Alternative path (natural language):** Home → **A&R Bot** (`/ar-bot`,
`components/ar-bot/ArBotChat.tsx`) — "who's breaking in Afrobeats this week?" —
for users who prefer to ask rather than filter.

---

## Job 2 — Track a roster/prospect and get alerted

**Persona:** Marketing / catalog lead. **Goal:** monitor a set of artists/tracks
and be notified on momentum.

| Step | Screen / action | Component (evidence) |
|---|---|---|
| 1 | Nav → **Watchlist** — see tracked entities enriched with latest viral score + delta vs. baseline | `/watchlist` → `WatchlistGrid`, `lib/watchlist/service.ts` |
| 2 | Create an **alert rule** (metric > threshold, email/webhook) | `/alerts` → `app/api/ui/alerts`; evaluated by `check-alert-rules` cron |
| 3 | **Export** the watchlist for a stakeholder review (CSV) | `Export` → `/api/ui/watchlist/export` |
| 4 | Receive the **daily digest** of movement | `jobs/digest/send-daily-digest.ts` |

**Trust:** every row shows freshness (baseline vs. latest); alerts state the
exact rule. **Done when** an alert rule exists and the export downloads. This CRUD
path (add → list → export → delete) is covered end-to-end by `scripts/smoke.ts`.

---

## Job 3 — Rights / catalog due diligence

**Persona:** Business affairs / catalog. **Goal:** understand rights and
writer/producer context before a conversation.

| Step | Screen / action | Component (evidence) |
|---|---|---|
| 1 | **Search** by name or paste a Spotify/YouTube URL | `/search` → `app/api/search`; URL parsing tested in `tests/unit/search-url-parser.test.ts` |
| 2 | Open the track → **Rights panel** (status + identifiers ISRC/UPC/ISWC) | `/tracks/[trackId]` → `components/rights/RightsPanel`, `RightsStatusBadge` |
| 3 | Pivot to **writers & producers** / **songwriter catalog** | `/writers-producers`, `/songwriters/[id]/catalog` → `CollaborationCard`, `RisingTalentCard` |
| 4 | **Compare** candidates side by side | `/compare` |

**Trust (critical for this job):** rights ambiguity is **surfaced, not hidden** —
`RightsStatusBadge` distinguishes known vs. unverified, and AI/rights outputs
avoid legal overclaiming (see `lib/ai/scoutBrief.ts` grounding + the readiness
review's AI section). **Done when** the user has the identifiers + rights status
they need to proceed.

---

## Cross-cutting UX

- **Roles:** VIEWER / ANALYST / ADMIN gate destructive and admin actions
  (`requireRole`); restricted controls are hidden/disabled, not error-on-click.
- **States:** loading/empty/error handled by shared primitives (`Skeleton`,
  `Toast`, empty-state cards) so no screen dead-ends.
- **Recovery:** mutating actions confirm and are reversible (watchlist add/remove,
  alert enable/disable).
- **Automated backing:** Playwright covers the auth cycle (`auth.spec.ts`) and the
  Home CommandBar journey (`homepage.spec.ts`); the smoke suite covers the
  watchlist and provisioning paths against a real server.

## Residual UX follow-ups (non-blocking)

- Extend Playwright beyond Home/auth to search + a detail page and the A&R bot
  (tracked in `DEPLOYMENT.md §12`).
- Add an optional product tour overlay for first login (the guided Home covers
  the need today; a tour would further reduce time-to-first-value).
