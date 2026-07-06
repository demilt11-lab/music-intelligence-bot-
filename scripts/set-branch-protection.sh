#!/usr/bin/env bash
#
# Enforce branch protection on `main`: require the CI checks to pass (and a PR
# review) before any merge. This is a one-time GitHub *account setting* that
# cannot be set from application code or the repo itself — a repo admin runs it
# once. It is idempotent (safe to re-run).
#
# Usage:
#   GITHUB_TOKEN=<admin PAT with repo scope> ./scripts/set-branch-protection.sh
#
# Requires: curl, a token whose owner has admin on the repo.
set -euo pipefail

OWNER="${OWNER:-demilt11-lab}"
REPO="${REPO:-music-intelligence-bot-}"
BRANCH="${BRANCH:-main}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: set GITHUB_TOKEN (admin PAT with 'repo' scope)." >&2
  exit 1
fi

API="https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection"

# The required status checks are the CI job *names* from .github/workflows/ci.yml.
read -r -d '' BODY <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Typecheck · Lint · Build · Unit tests",
      "Smoke (Postgres + live server)",
      "ETL pipeline integration",
      "E2E (Playwright)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Applying branch protection to ${OWNER}/${REPO}@${BRANCH}…"
http_code=$(curl -sS -o /tmp/bp_resp.json -w '%{http_code}' \
  -X PUT "$API" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d "$BODY")

if [[ "$http_code" == "200" ]]; then
  echo "✅ Branch protection enabled on ${BRANCH}. A failing-CI PR can no longer merge."
else
  echo "❌ Failed (HTTP ${http_code}):" >&2
  cat /tmp/bp_resp.json >&2
  exit 1
fi
