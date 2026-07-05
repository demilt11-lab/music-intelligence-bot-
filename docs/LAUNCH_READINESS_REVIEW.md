# Enterprise Music-Label Launch Readiness Review

**Product:** Music Intelligence API / A&R platform
**Review date:** 2026-07-05
**Reviewer:** Claude Code (automated launch-gate review)
**Method:** Evidence-based audit of the repository. Every score below is anchored
to code, tests, workflows, or docs in this repo. Claims without evidence are
called out as missing evidence, not assumed. Unit suite was executed live
(`npm ci && npm test` → **181/181 passing**).

---

## Verdict

| Gate | Result |
|---|---|
| **Pilot-ready (controlled, 1–2 label pilot)** | ✅ **GO, with conditions** |
| **Full enterprise-ready (multi-team, procurement-grade)** | ⛔ **NO-GO** — 3 hard-requirement gaps |

This is a genuinely mature product with an unusually honest engineering culture
(it ships a `## Deployment debt (tracked, not yet resolved)` section that
self-documents its own gaps). The ingestion, ML, and evaluation layers are real
and measured, not vaporware. The blockers to full enterprise readiness are
concentrated in **enterprise identity (SSO), proven tenant isolation, and
documented security review** — not in product substance.

---

## Weighted Scorecard

| Area | Weight | Green Threshold | Status | Est. Readiness |
|---|---:|---:|---|---:|
| Website crawling and ingestion | 15% | 90% | 🟢 Green | ~90% |
| AI quality and controls | 15% | 90% | 🟡 Yellow | ~75% |
| ML model performance | 15% | 90% | 🟢 Green | ~90% |
| Training and data pipelines | 10% | 90% | 🟢 Green | ~88% |
| Learning loops and feedback | 10% | 85% | 🟢 Green | ~85% |
| Prediction loops and decisioning | 10% | 90% | 🟡 Yellow | ~80% |
| UI quality | 7.5% | 90% | 🟡 Yellow | ~80% |
| UX quality | 7.5% | 90% | 🟡 Yellow | ~78% |
| Enterprise label readiness | 10% | 95% | 🔴 Red | ~60% |

**Weighted readiness ≈ 82%.** Above the pilot bar; below the 90%-green-across-core
+ 95%-enterprise bar the checklist sets for a full enterprise launch.

---

## 1. Website Crawling & Ingestion — 🟢 Green (~90%)

**Evidence found**
- Broad, real source coverage: `jobs/ingest/` has **12 ingestors** — Spotify,
  TikTok, YouTube, Luminate, Soundcharts, Billboard, Shazam, Google Trends,
  Instagram, plus three crawl4ai-backed crawlers (`crawl_dsp_apple`,
  `crawl_social_x`, `crawl_radio_spins`). A dedicated crawler microservice lives
  in `services/crawler-api/` (FastAPI + crawl4ai).
- **Reliability is engineered, not incidental.** Every job runs through
  `lib/jobs/tracker.ts` (`runTrackedJob`) which records each run in `job_runs`,
  and fires **zero-row** and **consecutive-failure** alerts (`lib/jobs/rules.ts`).
  Freshness SLAs are modeled in `lib/jobs/freshness.ts` and surfaced at
  `/api/ui/pipeline-status` and the `/status` page.
- Self-healing by design: `jobs/etl/reconcile.ts` and
  `jobs/etl/anomaly_detection.ts` exist; most ETL recomputes derived tables from
  source rather than mutating incrementally (per DEPLOYMENT §11), so re-running
  after a fix self-heals.
- Entity resolution across identifiers is real: `lib/catalog/matcher.ts`,
  `lib/shared/external-ids.ts`, `lib/resolve/`, ISRC/UPC/ISWC columns in
  `prisma/schema.prisma`, and a `POST /api/v1/resolve/link` endpoint.
- GDPR/CCPA retention is implemented: `jobs/etl/data_retention.ts` purges request
  logs (30d), expired sessions (7d), job_runs (90d).

**Top risks**
- **Legality is under-documented in-repo.** Crawlers set a render delay
  (`delay_before_return_html_s`) but there is **no explicit robots.txt honoring,
  per-source ToS review record, or takedown/source-blocking runbook** checked in.
  This is the checklist's #1 hard-stop ("Source rights or crawling legality is
  unclear") and it is currently an *undocumented* rather than *proven-safe* state.
- Parser resilience to layout change is asserted in commit history (TikTok hub
  migrations) but not covered by fixture-based regression tests for every source.

**Missing evidence:** per-source ToS/robots review log; takedown process doc;
crawl-coverage report by region/genre/market tier; cost-per-source tracking.

**Minimum before launch:** write a one-page **Source Legality & Access Register**
(source → access method → ToS/robots status → what is stored vs. discarded) and a
**takedown runbook**. Pilot-blocking only if a customer's legal team asks — but
cheap to do and closes a named hard-stop.

---

## 2. AI Quality & Controls — 🟡 Yellow (~75%)

**Evidence found**
- The one shipped generative feature (A&R scout brief, `lib/ai/scoutBrief.ts`)
  is **honestly bounded**: grounded system prompt ("only speak to the data you
  are given, never fabricate metrics"), a real output guardrail
  (`isPlausibleBrief` — length bounds + must name the actual lead track), and a
  **deterministic heuristic fallback tagged `source: 'heuristic'`** so an
  AI-sounding narrative is never shown unless a model actually produced it. This
  invariant is unit-tested (`tests/unit/ai-scout-brief.test.ts`).
- The code is candid about the guardrail's limits ("not a full hallucination
  detector") rather than overclaiming.

**Top risks**
- **No golden dataset + human rubric** for AI-workflow evaluation (§2 of the
  checklist). There is a plausibility check and a fallback, but no scored eval set
  measuring usefulness/factuality/actionability, and no "prompt change can't ship
  without eval evidence" gate.
- Prompts are versioned only via git, not an explicit prompt/version registry.

**Missing evidence:** golden set + rubric results; per-workflow factuality scores.

**Minimum before launch:** stand up a small (30–50 example) golden set for the
scout brief with a human usefulness/factuality rubric, and gate prompt changes on
it. Pilot-acceptable without this **if** the AI narrative stays positioned as an
assistive summary over visible source data (which it currently is).

---

## 3. ML Model Performance — 🟢 Green (~90%)

**Evidence found — this is the strongest area.**
- **Honest accuracy reporting is enforced by test.** `tests/unit/ml-regression.test.ts`
  guards a real product invariant: reported accuracy must be **held-out
  generalization**, not training accuracy re-labeled as "the accuracy." Small
  datasets skip the split and flag it honestly.
- **Measured, not claimed, ranking quality:** `ml/backtest_rankings.py` computes
  precision@K against realized trailing-stream growth and writes it to
  `model_accuracy_reports` for display — "the number to quote to a label exec."
- **Regression-safe promotion gate:** a retrain that regresses held-out accuracy
  by >2 points vs. the incumbent is blocked (DEPLOYMENT §11, `lib/ml/models/*`).
- **Drift detection is operational:** `.github/workflows/ml_drift_check.yml`
  (weekly) + `ml/training/retrain_scheduler.py` using PSI thresholds
  (<0.1 none / 0.1–0.25 moderate / >0.25 retrain), label drift, and feedback
  divergence.
- Time-aware validation exists (`ml/utils/splits.py`); segmented/eval scripts
  (`ml/eval_artist_trajectory.py`, `jobs/etl/evaluate_predictions.ts`).

**Top risks**
- **No previous-model store → no true model rollback** (one row per model type in
  `ml_models`). Self-documented. Recovery is "retrain again," which is slower than
  a rollback if a bad model passes the gate.
- Segmentation by genre/market/artist cohort exists in scripts but isn't surfaced
  as a standing report a reviewer can pull on demand.

**Missing evidence:** persisted segmented-metrics report; model version history.

**Minimum before launch:** persist the incumbent model artifact before promotion
so rollback is one step, not a retrain. Not pilot-blocking.

---

## 4. Training & Data Pipelines — 🟢 Green (~88%)

**Evidence found**
- Fully scripted, reproducible training: `package.json` exposes end-to-end
  `ml:*:full` pipelines (export features → collect feedback → train → predict →
  import) per model. Feature store: `ml/pipeline/feature_store.py`.
- Temporal-leakage-aware splits (`ml/utils/splits.py`); feature engineering under
  `ml/features/` with documented provenance in `ml/README.md`.
- Governance basics: training data flows from owned DB tables; PII-minimizing
  retention job; datasets regenerable from source.

**Top risks**
- **Experiment tracking is git + parquet, not an experiment registry.** Runs are
  reproducible but not systematically comparable across time (no MLflow/W&B-style
  ledger of code+data+hyperparams+results).
- Dataset **versioning** relies on regeneration from source, not immutable
  snapshots — fine for debugging, weaker for audit reproducibility.

**Missing evidence:** experiment ledger; immutable versioned dataset snapshots for
audit.

**Minimum before launch:** none for pilot. For enterprise audit, add a lightweight
run manifest (code SHA + dataset hash + metrics) per training run.

---

## 5. Learning Loops & Feedback — 🟢 Green (~85%)

**Evidence found**
- `POST /api/v1/feedback` accepts structured labels (VIRAL/TRENDING/POPULAR/NONE +
  explicit flags + source + notes), scoped by `feedback:write`, written to
  `user_feedback`, and **consumed by the retrain pipeline** (`ml/feedback/collector.py`,
  wired into every `ml:*:full` run).
- Feedback is separable by source (`curator|ar|user|algorithm`) and tenant.
- Drift-vs-feedback divergence feeds the retrain trigger (see §3).

**Top risks**
- Feedback weighting rules (avoid overfitting to loudest/newest customers) are not
  explicitly documented; collector currently treats labels fairly uniformly.
- No documented 30/60/90-day post-launch learning objectives.

**Missing evidence:** feedback-weighting design doc; 30/60/90 learning plan.

**Minimum before launch:** write the feedback-loop design doc (one of the
checklist's required evidence artifacts). Not pilot-blocking.

---

## 6. Prediction Loops & Decisioning — 🟡 Yellow (~80%)

**Evidence found**
- Closed loop: `jobs/etl/log_predictions.ts` snapshots predictions →
  `jobs/etl/evaluate_predictions.ts` scores them at a 30-day window →
  `.github/workflows/evaluate_predictions.yml` runs it on schedule.
- Predictions connect to workflows, not just dashboards: watchlists, alert rules
  (`/api/v1/alerts`, `check-alert-rules` cron), scouting workflows, daily digest.
- Plain-English decision context exists per prediction (trajectory, breakout,
  writer/producer rising, viral).

**Top risks**
- **False-precision in the metrics layer.** `jobs/etl/evaluate_predictions.ts`
  sets `precision = recall = accuracy` (honestly commented, but it means the
  reported precision/recall are not independent quantities). A label data team
  will read those as distinct metrics; presenting them as such risks the
  checklist's "avoids false precision" trust gate.
- Low- vs high-confidence handling exists in scoring but isn't consistently
  surfaced as differentiated treatment in every consuming workflow.

**Missing evidence:** a prediction-monitoring dashboard screenshot; confusion-matrix
-based precision/recall (not accuracy-aliased).

**Minimum before launch:** either compute true precision/recall from TP/FP/FN or
relabel the field "hit rate" so it doesn't overclaim. Small, worth doing pre-pilot.

---

## 7–8. UI & UX — 🟡 Yellow (~80% / ~78%)

**Evidence found**
- Mature component system: `components/ui/` (DataTable, StatCard, ScoreRing,
  TrendSparkline, Toast, Skeleton, Pagination, Disclosure, etc.) + a documented
  `app/ui/components` catalog. Music-domain components (ArtistCard, TrackCard,
  ViralScoreGauge, RightsPanel) speak label vocabulary.
- Role-oriented surfaces: talent-scout, watchlist, compare, genres,
  writers-producers, rights, A&R bot, settings/api-keys, status.
- Web Vitals instrumentation (`components/perf/WebVitals.tsx` →
  `/api/internal/web-vitals`). Export to enterprise formats
  (`watchlist/export`, `talent-scout/export`).

**Top risks**
- **Browser-level UX is under-verified.** Playwright E2E covers only auth +
  homepage CommandBar (self-documented in DEPLOYMENT §12). Search, artist/track
  detail, watchlist, compare, and the A&R bot chat have **no automated
  browser-level verification** — their correctness rests on unit + HTTP smoke.
- No evidence of a first-run/onboarding experience or usability testing with
  actual A&R/marketing/catalog users. "Complete top-3 jobs without support" is
  unproven.
- Empty/error/loading-state polish exists in components but isn't audited per page.

**Missing evidence:** UI QA screenshots + bug log; UX walkthrough for the top user
journeys per role; onboarding flow.

**Minimum before launch:** a manual UX walkthrough (recorded) of the top-3 jobs for
2 roles, plus extend Playwright to search + one detail page. Pilot-acceptable with
CS-assisted onboarding; not enterprise-acceptable as self-serve yet.

---

## 9. Enterprise Music-Label Readiness — 🔴 Red (~60%)

**Evidence found**
- **Auth/security fundamentals are solid.** API keys stored **sha256-hashed only**
  (`lib/platform/auth.ts`, tested in `tests/unit/auth.test.ts`); revocable +
  expiring keys with rotation endpoint. First-party sessions use HMAC tokens with
  **server-side revocation** and **fail-closed in production** (`lib/auth/session.ts`).
  RBAC via `requireScope`; rate limiting (`lib/platform/rate-limit.ts`); per-request
  logging (`lib/platform/logging.ts`).
- Multi-tenant admin surface exists: `/api/internal/tenants/*`, per-tenant API-key
  management + rotation, per-tenant usage/request-log summaries.
- Data governance: retention/deletion job; the core music corpus is a **shared
  reference dataset** (correct — it's public market data) while **customer-owned
  data** (watchlists, alerts, feedback, catalog matches via `clientTrackId`, users,
  usage) is tenant-scoped in the schema (`@@unique([tenantId, …])`).

**Top risks (these are the enterprise blockers)**
1. ⛔ **No SSO/SAML/SCIM.** Auth is API keys + first-party sessions only. Enterprise
   labels will require SSO. Not present and **not scheduled in-repo**. The checklist
   allows "available *or clearly scheduled*" — neither is currently true.
2. ⛔ **Tenant isolation is implemented but not *proven*.** Scoping works by passing
   `ctx.tenantId` explicitly into each service call (e.g. `listWatchlist(ctx.tenantId)`).
   It appears consistently applied — **but the `tenantWhere()` helper in
   `lib/platform/tenant-scope.ts` is dead code (zero call sites)**, so isolation
   depends entirely on every developer remembering the argument, and there is **no
   automated cross-tenant isolation test**. The checklist names "Tenant isolation is
   unproven" as a hard-stop. Mechanism present; *validation* absent.
3. ⛔ **Security review / penetration test status is undocumented.** No pen-test
   record, threat model, or SOC 2 material in-repo. The checklist explicitly
   requires this to be *documented*.
4. 🟡 **No APM/error tracking** (Sentry etc.) — Vercel dashboards only (self-documented).
5. 🟡 **No on-call rotation or incident-severity definitions** (self-documented,
   DEPLOYMENT §11: "not formalized in this repo").
6. 🟡 **Branch protection on `main` unverified** — a failing-CI PR can still merge
   until a repo admin requires the `ci.yml` checks (self-documented).

**Missing evidence:** SSO plan; cross-tenant isolation test + review; pen-test/security
review report; incident runbook with on-call; audit-log coverage matrix.

**Minimum before *enterprise* launch:** (a) ship or firmly schedule SSO; (b) add an
automated cross-tenant isolation test suite and a manual isolation review sign-off;
(c) document a security review / pen test. Items 4–6 are strongly recommended.

---

## 10–12. Observability / QA / Commercial — 🟡 Yellow

- **Observability:** `job_runs` + freshness rules + zero-row/consecutive-failure
  alerts + `/status` + `pipeline_alerts.yml` (Slack) + Web Vitals + per-tenant
  request-log summaries. **Gap:** no APM/error-tracking product; ML monitoring is
  separate (good) but there's no single executive launch-health dashboard.
- **QA/Release:** CI runs typecheck, ETL typecheck, lint, build, **181 unit tests
  (verified passing live)**, plus a smoke test against real Postgres and a narrow
  Playwright E2E. Rollback runbook is real (Vercel instant rollback, forward-only
  migration reversal, PITR restore). **Gaps:** feature-flag-by-tenant not evidenced;
  staging-mirrors-production not documented; E2E coverage narrow.
- **Commercial:** usage limits/seats/scopes modeled; `.env.example` + DEPLOYMENT.md
  are thorough. **Gap:** no customer-facing security/architecture doc, no
  procurement/IT-review packet, no written pilot success criteria.

---

## Hard-Stop Conditions — status check (§14)

| Hard stop | Status |
|---|---|
| Source rights / crawling legality unclear | ⚠️ **Undocumented** — write the legality register |
| Predictions can't be explained for customer trust | ✅ Clear — plain-English contexts + evidence |
| Tenant isolation unproven | ⛔ **Unproven by test** — mechanism exists, validation missing |
| Evaluation anecdotal not measurable | ✅ Measurable — held-out accuracy, backtest, eval jobs |
| Critical workflows need founder handholding | ⚠️ Unverified — no UX walkthrough evidence |
| Data freshness inconsistent | ✅ Modeled + alerted (freshness rules) |
| Can't recover from crawl/model/sync failure | ✅ Mostly — self-healing ETL, rollback runbook (model rollback weak) |

**Two hard-stops are live for a *full enterprise* launch:** tenant-isolation proof
and (cheaply closable) crawling-legality documentation. Neither blocks a *controlled
pilot* with a trusted customer under a single-tenant or supervised arrangement.

---

## Final Go/No-Go (§15)

| Question | Answer | Basis |
|---|---|---|
| Ingest & refresh required data reliably? | **Yes** | 12 tracked ingestors + freshness/alerts + reconcile |
| AI outputs accurate, structured, safe? | **Mostly** | Grounded + guardrail + heuristic fallback; no golden eval |
| ML predictions measurable, calibrated, trusted? | **Yes** | Held-out accuracy, backtest precision@K, drift/PSI |
| Training & learning loops governed & reproducible? | **Mostly** | Scripted + feedback loop; no experiment ledger |
| Users complete core workflows without guided support? | **Unproven** | No UX walkthrough / onboarding evidence |
| Enterprise security, permissions, audit covered? | **No** | RBAC+hashed keys yes; SSO/isolation-proof/pen-test no |
| Credible for a label pilot today? | **Yes** | With the pilot conditions below |
| Scalable beyond pilot to multi-team rollout? | **Not yet** | SSO + proven isolation + security review required |

---

## Recommended path

**To green-light a controlled pilot (est. days, not weeks):**
1. Write the **Source Legality & Access Register** + takedown runbook.
2. Fix the **precision/recall false-precision** in `evaluate_predictions.ts`
   (compute from TP/FP/FN or rename to "hit rate").
3. Record a **UX walkthrough** of the top-3 jobs for 2 roles; confirm no
   founder handholding is required.
4. Confirm the pilot runs **single-tenant or supervised** until isolation is proven.

**To reach full enterprise-ready (est. weeks):**
1. **SSO/SAML + SCIM** shipped or firmly scheduled with a date.
2. **Automated cross-tenant isolation test suite** + manual isolation review
   sign-off (and either wire up or delete the unused `tenantWhere` helper so the
   scoping convention is enforced, not just conventional).
3. **Security review / penetration test** performed and documented.
4. Add **APM/error tracking**, a **formal incident/on-call runbook**, **branch
   protection on `main`**, a **previous-model store** for true ML rollback, and
   an **experiment/dataset version ledger**.
5. Produce **procurement/IT/security customer-facing docs** and **written pilot
   success criteria**.

---

*All findings above are traceable to files in this repository as of 2026-07-05.
The unit suite was executed during this review (181/181 passing). Items marked
"self-documented" are already tracked in `DEPLOYMENT.md §11–12`, which is itself
evidence of a healthy, honest release process.*
