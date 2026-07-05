# Learning Loops: Feedback Weighting & Post-Launch Objectives

How user/market feedback flows into the models, how it is weighted (so the loop
improves without overfitting to the loudest voices), and the 30/60/90-day
learning objectives for launch. This is the learning-loops evidence for the
readiness gate.

## The loop

```
POST /api/v1/feedback  ──▶  user_feedback table
                                  │
ml/feedback/collector.py ────────┘  (collect_and_export, --since-days N)
      ├─ explicit human labels (curator / A&R)
      ├─ implicit signals (trending/engagement)
      └─ search-interest signals
                                  │  weighted sample_weight
      ml:*:full retrain ─────────┘  → new model version (see ML_EXPERIMENTS.md)
```

Retraining is triggered by `ml/training/retrain_scheduler.py` on drift (PSI),
label drift, or **feedback divergence** (≥20% of feedback contradicting the
model), and always collects fresh feedback first.

## Feedback weighting rules

The weight each feedback row contributes to training is set in
`ml/feedback/collector.py`. The design deliberately trusts **explicit human
judgment most** and dampens noisy, high-volume implicit signals so the loudest
or most-active sources cannot dominate:

| Source | `sample_weight` | Rationale |
|---|---|---|
| Explicit human label (curator / A&R) — VIRAL/POPULAR/label | **3.0** (fixed) | A named human decision is the strongest signal |
| Implicit trending signal | `min(1.5 + count/20, 3.0)` | Grows with corroboration but **capped at 3.0** |
| Search-interest signal | `min(1.2 + count/30, 2.0)` | Weakest prior; caps lower (2.0) and grows slowest |

Key properties that prevent overfitting to the loudest users/newest customers:

- **Hard caps** (2.0 / 3.0) mean no single high-volume source can run away.
- **Diminishing returns** (`count/20`, `count/30`) — the 100th corroboration
  barely moves the weight past the 20th.
- **Human > implicit > search** ordering encodes trust, not volume.
- Feedback is **source-tagged** (`curator | ar | user | algorithm`) so a single
  account or channel can be audited or down-weighted if it distorts outcomes.
- Human review can always **override** automated learning: the promotion gate
  blocks a regressing retrain, and an operator can roll back a bad version.

## Distinguishing product feedback from model feedback

`/api/v1/feedback` captures *model* feedback (is this track viral/popular?),
which feeds retraining. Product feedback (UX issues, feature requests) is not
routed into training — only labeled outcomes are.

## Post-launch learning objectives

### First 30 days — establish the baseline
- Confirm feedback is arriving from ≥2 roles (A&R + curator) and is source-tagged.
- Establish baseline held-out accuracy + precision@K per model in the ledger.
- Watch the drift dashboard (PSI) weekly; confirm no silent regressions promote.
- Target: ≥1 clean retrain cycle proving the loop end-to-end.

### 60 days — validate that feedback improves outcomes
- Compare model versions in the ledger: does incorporating 30–60 days of
  feedback raise held-out accuracy / precision@K vs. the launch baseline?
- Review feedback-divergence: where does human feedback most contradict the
  model? Prioritize those cohorts (genre/market) for labeling.
- Target: a measurable, ledger-visible improvement attributable to feedback,
  with no bias regression against smaller artists/independent labels.

### 90 days — tune the loop
- Revisit the weighting caps if any source is over/under-influential (change is
  a one-line edit in `collector.py`, recorded via a new model version).
- Formalize a labeling cadence with pilot customers for the weakest cohorts.
- Target: a documented, repeatable monthly learning cycle owned by the ML owner,
  with rollback exercised at least once as a drill.

## Owners & cadence

- Feedback queue + weighting: ML owner, reviewed monthly.
- Drift/retrain: automated weekly (`ml_drift_check.yml`) + on-divergence.
- Improvement experiments are prioritized by customer value × model risk and
  tracked as model versions in the ledger (`ML_EXPERIMENTS.md`).
