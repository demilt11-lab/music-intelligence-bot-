#!/usr/bin/env bash
#
# Cold-start ingestion sequence — runs every configured provider ingest in
# dependency order, then the full ETL chain, then reconciliation, and prints
# a job-run summary. Safe to re-run: every job is idempotent and tracked in
# job_runs.
#
# Providers whose credentials are absent are SKIPPED loudly, not failed —
# so the sequence is usable from the very first credential onward.
#
# Usage:
#   DATABASE_URL=... ./scripts/coldstart.sh            # full run
#   COLDSTART_SKIP_INGEST=1 ./scripts/coldstart.sh     # ETL + reconcile only
set -uo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL is not set — aborting." >&2
  exit 1
fi

TODAY=$(date -u +%F)
YESTERDAY=$(date -u -d "yesterday" +%F 2>/dev/null || date -u -v-1d +%F)

PASS=0; FAIL=0; SKIP=0
FAILED_STEPS=()

run_step() { # name, command...
  local name="$1"; shift
  echo ""
  echo "━━ ${name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if "$@"; then
    echo "── ✓ ${name}"
    PASS=$((PASS+1))
  else
    echo "── ✗ ${name} FAILED (continuing — see job_runs / logs)" >&2
    FAIL=$((FAIL+1)); FAILED_STEPS+=("${name}")
  fi
}

# name, required_env_csv, command...
run_provider() {
  local name="$1" required="$2"; shift 2
  local missing=()
  IFS=',' read -ra vars <<< "$required"
  for v in "${vars[@]}"; do
    [ -z "${!v:-}" ] && missing+=("$v")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo ""
    echo "── ⏭  ${name} SKIPPED (missing: ${missing[*]})"
    SKIP=$((SKIP+1))
    return 0
  fi
  run_step "$name" "$@"
}

echo "🚀 Cold-start sequence — $(date -u '+%F %T') UTC"
echo "   database: $(echo "$DATABASE_URL" | sed -E 's#//[^@]+@#//***@#')"

# ── Phase 1: provider ingestion (catalog seeding first) ─────────────────────
if [ "${COLDSTART_SKIP_INGEST:-0}" != "1" ]; then
  # Spotify FIRST — it seeds the track/artist catalog everything joins against.
  run_provider "ingest:spotify"      "SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET" npx tsx jobs/ingest/spotify.ts
  run_provider "ingest:billboard"    "FIRECRAWL_API_KEY"                       npx tsx jobs/ingest/billboard.ts
  run_provider "ingest:youtube"      "YOUTUBE_API_KEY"                         npx tsx jobs/ingest/youtube.ts
  run_provider "ingest:tiktok"       "CRAWLER_API_URL"                         npx tsx jobs/ingest/tiktok.ts
  run_provider "ingest:shazam"       "SHAZAM_API_KEY"                          npx tsx jobs/ingest/shazam.ts
  run_provider "ingest:googletrends" "SEARCHAPI_KEY"                           npx tsx jobs/ingest/googletrends.ts
  run_provider "ingest:instagram"    "META_APP_ID,META_APP_SECRET,IG_USER_ID"  npx tsx jobs/ingest/instagram.ts
else
  echo ""
  echo "── ⏭  Phase 1 (ingestion) skipped via COLDSTART_SKIP_INGEST=1"
fi

# ── Phase 2: ETL chain (order matters) ───────────────────────────────────────
run_step "etl:artist-daily ($YESTERDAY)" npx tsx jobs/etl/artist_daily_stats.ts "$YESTERDAY"
run_step "etl:artist-daily ($TODAY)"     npx tsx jobs/etl/artist_daily_stats.ts "$TODAY"
run_step "etl:ugc"                       npx tsx jobs/etl/ugcTracks.ts
run_step "etl:compute-track-signals"     npx tsx jobs/etl/compute_track_signals.ts "$TODAY"
run_step "etl:artist-trajectory"         npx tsx jobs/etl/artist_trajectory_snapshots.ts "$TODAY"
run_step "etl:genres"                    npx tsx jobs/etl/genres.ts
run_step "etl:track-trend-labels"        npx tsx jobs/etl/track_trend_labels.ts "$TODAY"
run_step "etl:log-predictions"           npx tsx jobs/etl/log_predictions.ts "$TODAY"

# ── Phase 3: integrity gate ──────────────────────────────────────────────────
run_step "etl:reconcile" npx tsx jobs/etl/reconcile.ts

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━ Job-run summary (latest per job) ━━━━━━━━━━━━━━━"
npx tsx scripts/jobs-summary.ts || echo "  (job_runs summary unavailable)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Cold start complete: ${PASS} ok · ${FAIL} failed · ${SKIP} skipped"
if [ ${#FAILED_STEPS[@]} -gt 0 ]; then
  echo "Failed steps: ${FAILED_STEPS[*]}"
fi
[ "$FAIL" -eq 0 ]
