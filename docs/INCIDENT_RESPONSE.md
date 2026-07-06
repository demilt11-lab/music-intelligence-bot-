# Incident Response Runbook

Severity definitions, on-call policy, escalation, and step-by-step response for
production incidents. This is the "incident response runbook" + on-call evidence
for the enterprise-operations gate. It complements the rollback procedures in
`DEPLOYMENT.md §11` (which this runbook points to for the actual fixes).

## Severity levels

| Sev | Definition | Examples | Response target | Update cadence |
|---|---:|---|---|---|
| **SEV1** | Customer-facing outage or data-integrity/security breach | App down; login broken for all; tenant-isolation failure; data leak; secret exposed | Ack ≤15 min, mitigate ≤1 h | Every 30 min |
| **SEV2** | Major degradation, no full outage | A core workflow broken (search/watchlist/scout); ingestion stalled for a key source; elevated 5xx | Ack ≤30 min, mitigate ≤4 h | Hourly |
| **SEV3** | Minor / partial, workaround exists | One non-critical page erroring; a single non-core source stale; slow endpoint | Next business day | Daily |
| **SEV4** | Cosmetic / low | UI polish, copy, non-blocking warning | Backlog | — |

**Security incidents** (suspected breach, tenant-isolation failure, secret
exposure) are **always SEV1** regardless of blast radius and additionally follow
`docs/SECURITY_REVIEW.md §8` (reporting) — preserve evidence before remediation.

## On-call policy

- **Primary on-call** carries the pager for a 1-week rotation; **secondary** is
  the escalation backup. Populate the rotation in `docs/ONCALL.md` (or the
  team's scheduler) — see the template below.
- On-call ack SLAs are the "Response target" column above.
- If primary doesn't ack a SEV1/SEV2 within the target, it auto-escalates to
  secondary, then to the eng lead.
- Anyone may declare an incident. Declaring is cheap; under-reacting to a SEV1
  is not.

### On-call rotation template (`docs/ONCALL.md`)

```
| Week (Mon–Sun) | Primary        | Secondary      | Escalation (Eng lead) |
|----------------|----------------|----------------|-----------------------|
| 2026-07-06     | <name / handle>| <name / handle>| <name / handle>       |
| 2026-07-13     | …              | …              | …                     |
```

## Detection

Incidents surface from any of:
- **Self-hosted observability**: `GET /api/internal/observability` — error rate,
  p95/p99 latency, and top errors (see `docs`/APM). A spike in `serverErrors` or
  a new high-`count` fingerprint is an early signal.
- **Health probe**: `GET /api/health` (`status:"degraded"` / db down).
- **Pipeline alerts**: `job_runs` + `pipeline_alerts.yml` (Slack) — zero-row /
  consecutive-failure alerts from ingestion/ETL.
- **`/status` page** and customer report.

## Response procedure

1. **Declare & classify.** Assign a severity, open an incident channel/thread,
   name an Incident Commander (the on-call by default).
2. **Assess blast radius.** Which tenants/workflows? Check
   `/api/internal/observability` (error rate, top fingerprints) and
   `/api/health`. For a suspected isolation/security issue, treat as SEV1 and
   preserve logs first.
3. **Mitigate** using the matching `DEPLOYMENT.md §11` runbook:
   - Bad app deploy → **Instant Rollback** (promote last good Vercel deploy).
   - Bad migration → forward-fix migration / PITR restore.
   - Bad model promotion → `POST /api/internal/ml/rollback`.
   - Bad pipeline run → fix root cause + re-run (ETL self-heals from source).
   - Abusive source / takedown → pause the `ingest_*.yml` workflow
     (`SOURCE_LEGALITY_REGISTER.md §5`).
4. **Communicate.** Post updates at the cadence for the severity; for customer-
   facing SEV1/SEV2 notify affected tenants per their support agreement.
5. **Verify recovery.** Error rate + latency back to baseline in
   `/api/internal/observability`; `/api/health` green; affected workflow
   re-tested (smoke/pentest can be run against prod-like staging).
6. **Resolve.** Mark the error fingerprint resolved
   (`PATCH /api/internal/observability`), close the incident.

## Postmortem

Every SEV1 and SEV2 gets a blameless postmortem within 3 business days:
- Timeline (detection → mitigation → resolution).
- Root cause + contributing factors.
- What worked / what didn't.
- Action items with owners and due dates (link to tracking).

## Escalation contacts

Fill in for the deployment (kept out of git if sensitive; reference a secret
store or the team wiki):

```
Eng lead:        <name / contact>
Security:        security@<domain>
Infra/DB (Supabase/Vercel): <account owner>
Data licences (Luminate/Soundcharts): <account owner>
```
