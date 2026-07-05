# ML Experiments, Versioning & Reproducibility

How every trained model is recorded so it can be compared, audited, reproduced,
and rolled back. This is the "experiment / dataset-version ledger" evidence for
the training-readiness gate.

## The ledger

Every promotion writes an immutable row to **`ml_model_versions`**
(`lib/ml/versioning.ts` → `archiveAndPromote`). `ml_models` holds only the single
*active* pointer; the version table is the append-only history.

Each row records:

| Field | Meaning |
|---|---|
| `modelType`, `version` | which model, monotonically increasing version |
| `accuracy`, `nSamples` | held-out accuracy + training-set size (the metrics) |
| `trainedAt` | when the underlying model was trained |
| `codeSha` | the commit that produced it (`GIT_SHA` / `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA`) |
| `datasetHash` | a stable hash of the exact training set (`hashDataset`) |
| `note` | `promoted` or `rollback to vN` |

Because `codeSha` + `datasetHash` are captured at promotion time, any model in
production can be traced to **the code and the data that produced it** — the
requirement for audit and debugging reproducibility.

## Inspecting the ledger

```
GET /api/internal/ml/status        # active model + recent version history per type
```

Returns, per model, its active version plus the last 10 versions with accuracy,
sample count, `codeSha`, `datasetHash`, and note.

## Comparing experiments across time

Versions are directly comparable: `accuracy` is always a **held-out**
generalization estimate (enforced by `tests/unit/ml-regression.test.ts`), and
`nSamples` + `datasetHash` show whether a change came from new data or new code.
A retrain that would regress held-out accuracy by more than 2 points vs. the
incumbent is **rejected** by the promotion gate (`lib/ml/models/*`), so the
ledger never records a silent regression as "promoted".

## Reproducing a version

1. `GET /api/internal/ml/status` → read the target version's `codeSha` and
   `datasetHash`.
2. Check out `codeSha`.
3. Re-run the model's `ml:*:full` pipeline (see `package.json`). The exported
   training set's `hashDataset` should match the recorded `datasetHash`; a
   mismatch means the upstream source data has since changed — itself a useful
   signal.

## Rollback

If a promoted version misbehaves, revert in one step
(`POST /api/internal/ml/rollback`, see `DEPLOYMENT.md §11`). The rollback is
recorded as a new version carrying the restored version's `codeSha` /
`datasetHash`, so history is never rewritten.

## Failed / rejected experiments

A retrain that fails the promotion gate returns `promoted:false` with the reason
and is **not** written to the ledger as active — but the attempt is visible in
the training job's `job_runs` record and logs, so failed experiments are
retained for learning rather than lost.
