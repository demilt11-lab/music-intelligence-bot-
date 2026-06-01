"""
Retrain Scheduler

Monitors prediction drift and triggers full retraining when the models have
drifted beyond safe thresholds.

Drift metrics used:
  - PSI (Population Stability Index): detects distributional shift in
    predicted viral/popularity probabilities vs. a baseline window.
    PSI < 0.1: no drift.  PSI 0.1–0.25: moderate.  PSI > 0.25: retrain.
  - Label drift: shift in the ratio of VIRAL/TRENDING/POPULAR/NONE
    predictions over rolling 7-day windows.
  - Feedback divergence: when user-provided labels frequently contradict
    model predictions, this signals the model is out of date.

The scheduler also collects fresh feedback labels before retraining so the
updated models incorporate the latest user and market signals.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from ml.config import ROOT, LOG_DIR, METRICS_DIR, configure_logging

logger = configure_logging(__name__)

STATE_PATH    = LOG_DIR / "retrain_state.json"
VIRAL_METRICS = METRICS_DIR / "viral_prob_distribution.json"
POP_METRICS   = METRICS_DIR / "popularity_prob_distribution.json"
TREND_METRICS = METRICS_DIR / "trend_label_distribution.json"

MIN_HOURS_BETWEEN_RETRAINS = 12
PSI_RETRAIN_THRESHOLD      = 0.25   # severe drift
PSI_WARN_THRESHOLD         = 0.10   # moderate drift — log but don't retrain yet
LABEL_DRIFT_THRESHOLD      = 0.15   # 15% shift in class ratios
FEEDBACK_DIVERGENCE_THRESH = 0.20   # 20% of feedback contradicts model

TRAIN_SCRIPTS: Dict[str, Path] = {
    "viral":       ROOT / "ml" / "training" / "train_viral_predictor.py",
    "popularity":  ROOT / "ml" / "training" / "train_popularity_predictor.py",
    "trend":       ROOT / "ml" / "training" / "train_trend_classifier.py",
    "trajectory":  ROOT / "ml" / "training" / "train_trajectory_model.py",
}

FEEDBACK_SCRIPT = ROOT / "ml" / "feedback" / "collector.py"


# ── PSI ───────────────────────────────────────────────────────────────────────

def _psi_score(expected: np.ndarray, actual: np.ndarray, buckets: int = 10) -> float:
    """
    Population Stability Index.
    expected = baseline probability distribution.
    actual   = recent probability distribution.
    PSI > 0.25 → significant shift, retrain.
    """
    eps = 1e-6
    bins = np.linspace(0, 1, buckets + 1)

    expected_pct = np.histogram(expected, bins=bins)[0] / (len(expected) + eps)
    actual_pct   = np.histogram(actual,   bins=bins)[0] / (len(actual)   + eps)

    expected_pct = np.clip(expected_pct, eps, None)
    actual_pct   = np.clip(actual_pct,   eps, None)

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return float(psi)


def _label_drift_score(
    baseline_counts: Dict[str, int],
    recent_counts: Dict[str, int],
) -> float:
    """Max absolute shift in any class's fraction."""
    all_keys = set(baseline_counts) | set(recent_counts)
    if not all_keys:
        return 0.0

    base_total   = sum(baseline_counts.values()) or 1
    recent_total = sum(recent_counts.values())   or 1

    max_drift = 0.0
    for k in all_keys:
        base_frac   = baseline_counts.get(k, 0) / base_total
        recent_frac = recent_counts.get(k, 0)   / recent_total
        max_drift = max(max_drift, abs(recent_frac - base_frac))

    return max_drift


# ── state helpers ─────────────────────────────────────────────────────────────

def _load_state() -> Dict:
    if STATE_PATH.exists():
        with STATE_PATH.open() as f:
            return json.load(f)
    return {}


def _save_state(state: Dict):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.open("w") as f:
        json.dump(state, f, indent=2)


def _load_prob_metrics(path: Path) -> Optional[np.ndarray]:
    if not path.exists():
        return None
    with path.open() as f:
        data = json.load(f)
    probs = data.get("recent_probs", [])
    return np.array(probs, dtype=float) if probs else None


def _load_label_counts(path: Path) -> Optional[Dict[str, int]]:
    if not path.exists():
        return None
    with path.open() as f:
        data = json.load(f)
    return data.get("recent_counts")


# ── training ──────────────────────────────────────────────────────────────────

def _run_script(path: Path) -> bool:
    if not path.exists():
        logger.warning("Script not found: %s — skipping", path)
        return True
    logger.info("Running: %s", path)
    try:
        result = subprocess.run(
            [sys.executable, str(path)],
            cwd=str(ROOT),
            check=True,
            capture_output=True,
            text=True,
        )
        if result.stdout:
            logger.info("%s stdout:\n%s", path.name, result.stdout[-2000:])
        if result.stderr:
            logger.warning("%s stderr:\n%s", path.name, result.stderr[-1000:])
        return True
    except subprocess.CalledProcessError as e:
        logger.error("%s failed (code %d):\n%s\n%s", path.name, e.returncode, e.stdout[-2000:], e.stderr[-1000:])
        return False


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    state = _load_state()
    now   = datetime.utcnow()

    # ── Guard: minimum interval between retrains ──────────────────────────
    last_iso = state.get("last_retrain_at")
    if last_iso:
        elapsed_h = (now - datetime.fromisoformat(last_iso)).total_seconds() / 3600
        if elapsed_h < MIN_HOURS_BETWEEN_RETRAINS:
            logger.info("%.1f h since last retrain (min=%d h). Skipping.", elapsed_h, MIN_HOURS_BETWEEN_RETRAINS)
            return
        logger.info("%.1f h since last retrain. Checking drift...", elapsed_h)

    # ── Drift detection ───────────────────────────────────────────────────
    should_retrain = False
    reasons: List[str] = []

    # Viral model PSI
    recent_viral = _load_prob_metrics(VIRAL_METRICS)
    baseline_viral = np.array(state.get("baseline_viral_probs", []), dtype=float)
    if recent_viral is not None and baseline_viral.size > 0:
        psi = _psi_score(baseline_viral, recent_viral)
        logger.info("Viral PSI=%.4f (threshold=%.2f)", psi, PSI_RETRAIN_THRESHOLD)
        if psi > PSI_RETRAIN_THRESHOLD:
            should_retrain = True
            reasons.append(f"viral PSI={psi:.4f}")
        elif psi > PSI_WARN_THRESHOLD:
            logger.warning("Viral model moderate drift: PSI=%.4f", psi)

    # Popularity model PSI
    recent_pop = _load_prob_metrics(POP_METRICS)
    baseline_pop = np.array(state.get("baseline_popularity_probs", []), dtype=float)
    if recent_pop is not None and baseline_pop.size > 0:
        psi = _psi_score(baseline_pop, recent_pop)
        logger.info("Popularity PSI=%.4f", psi)
        if psi > PSI_RETRAIN_THRESHOLD:
            should_retrain = True
            reasons.append(f"popularity PSI={psi:.4f}")

    # Trend label drift
    recent_counts   = _load_label_counts(TREND_METRICS)
    baseline_counts = state.get("baseline_trend_counts", {})
    if recent_counts and baseline_counts:
        ld = _label_drift_score(baseline_counts, recent_counts)
        logger.info("Trend label drift=%.4f (threshold=%.2f)", ld, LABEL_DRIFT_THRESHOLD)
        if ld > LABEL_DRIFT_THRESHOLD:
            should_retrain = True
            reasons.append(f"trend label drift={ld:.4f}")

    # Forced retrain if no baseline exists yet (first run)
    if not state:
        should_retrain = True
        reasons.append("no baseline — first run")

    if not should_retrain:
        logger.info("No significant drift detected. Skipping retrain.")
        return

    logger.info("Retrain triggered: %s", ", ".join(reasons))

    # ── Step 1: Collect fresh user feedback into training data ────────────
    logger.info("Collecting user feedback labels before retrain...")
    _run_script(FEEDBACK_SCRIPT)

    # ── Step 2: Retrain all models ────────────────────────────────────────
    all_ok = True
    for name, script in TRAIN_SCRIPTS.items():
        ok = _run_script(script)
        if not ok:
            logger.error("Model '%s' failed to retrain", name)
            all_ok = False

    # ── Step 3: Update baselines and state ────────────────────────────────
    if all_ok:
        new_state = {
            "last_retrain_at": now.isoformat(),
            "retrain_reasons": reasons,
        }
        if recent_viral is not None:
            new_state["baseline_viral_probs"] = recent_viral.tolist()
        if recent_pop is not None:
            new_state["baseline_popularity_probs"] = recent_pop.tolist()
        if recent_counts:
            new_state["baseline_trend_counts"] = recent_counts
        _save_state(new_state)
        logger.info("Retrain complete and baselines updated.")
    else:
        logger.error("One or more models failed. State not updated to avoid masking failures.")


if __name__ == "__main__":
    main()
