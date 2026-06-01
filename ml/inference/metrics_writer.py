"""
Metrics Writer

Maintains rolling probability distributions and label counts used by the
retrain scheduler's PSI drift detection.

Files written to logs/metrics/:
  viral_prob_distribution.json       — { recent_probs: [float] }
  popularity_prob_distribution.json  — { recent_probs: [float] }
  trend_label_distribution.json      — { recent_counts: {label: int} }
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from ml.config import METRICS_DIR, configure_logging

logger = configure_logging(__name__)

VIRAL_METRICS_PATH = METRICS_DIR / "viral_prob_distribution.json"
POP_METRICS_PATH   = METRICS_DIR / "popularity_prob_distribution.json"
TREND_METRICS_PATH = METRICS_DIR / "trend_label_distribution.json"

ROLLING_WINDOW = 10_000


def _load(path: Path) -> dict:
    if path.exists():
        with path.open() as f:
            return json.load(f)
    return {}


def _save(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(data, f)


def _append_probs(path: Path, new_probs: List[float]):
    data = _load(path)
    existing = data.get("recent_probs", [])
    combined = (existing + [float(p) for p in new_probs])[-ROLLING_WINDOW:]
    _save(path, {"recent_probs": combined})
    logger.info("Appended %d probs to %s (total %d)", len(new_probs), path.name, len(combined))


def _increment_counts(path: Path, new_labels: List[str]):
    data = _load(path)
    counts: Dict[str, int] = data.get("recent_counts", {})
    for label in new_labels:
        counts[label] = counts.get(label, 0) + 1
    total = sum(counts.values())
    if total > ROLLING_WINDOW:
        scale = ROLLING_WINDOW / total
        counts = {k: max(1, int(v * scale)) for k, v in counts.items()}
    _save(path, {"recent_counts": counts})


def update_viral_prob_metrics(new_probs: List[float]):
    _append_probs(VIRAL_METRICS_PATH, new_probs)


def update_popularity_prob_metrics(new_probs: List[float]):
    _append_probs(POP_METRICS_PATH, new_probs)


def update_trend_label_metrics(labels: List[str]):
    _increment_counts(TREND_METRICS_PATH, labels)


def update_from_batch_result(results: List[dict]):
    """Called after scoring a batch. Extracts all probe values and writes metrics."""
    viral_probs  = []
    pop_probs    = []
    trend_labels = []

    for r in results:
        # XGBoost results use viral_probabilities.30d
        # Neural results use viral_probability (scalar) — handle both
        vp = r.get("viral_probabilities", {})
        if vp.get("30d") is not None:
            viral_probs.append(float(vp["30d"]))
        elif r.get("viral_probability") is not None:
            viral_probs.append(float(r["viral_probability"]))

        pp = r.get("popularity_probabilities", {})
        if pp.get("30d") is not None:
            pop_probs.append(float(pp["30d"]))
        elif r.get("popular_probability") is not None:
            pop_probs.append(float(r["popular_probability"]))

        # XGBoost: trend_prediction.label  /  Neural: trend_prediction.label
        tp = r.get("trend_prediction", {})
        if tp.get("label"):
            trend_labels.append(tp["label"])
        elif r.get("trend_label"):
            trend_labels.append(r["trend_label"])

    if viral_probs:
        update_viral_prob_metrics(viral_probs)
    if pop_probs:
        update_popularity_prob_metrics(pop_probs)
    if trend_labels:
        update_trend_label_metrics(trend_labels)
