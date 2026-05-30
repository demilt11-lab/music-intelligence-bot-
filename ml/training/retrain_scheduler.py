# ml/training/retrain_scheduler.py
from pathlib import Path
import json
import subprocess
import sys
from datetime import datetime, timedelta

import numpy as np

from ml.config import ROOT, LOG_DIR, METRICS_DIR, configure_logging

logger = configure_logging(__name__)

STATE_PATH = LOG_DIR / "retrain_state.json"
DRIFT_THRESHOLD = 0.1  # example tolerance on metric difference
MIN_HOURS_BETWEEN_RETRAINS = 12

TRAIN_SCRIPTS = [
    ROOT / "ml" / "training" / "train_trajectory_model.py",
    ROOT / "ml" / "training" / "train_trend_classifier.py",
    ROOT / "ml" / "training" / "train_viral_predictor.py",
]

METRICS_FILE = METRICS_DIR / "viral_prob_distribution.json"

def load_state():
    if not STATE_PATH.exists():
        return {}
    with STATE_PATH.open() as f:
        return json.load(f)

def save_state(state):
    with STATE_PATH.open("w") as f:
        json.dump(state, f, indent=2)

def detect_model_drift(
    recent_scores: np.ndarray, baseline_scores: np.ndarray
) -> bool:
    """Simple drift: compare mean of viral probabilities."""
    if recent_scores.size == 0 or baseline_scores.size == 0:
        return False
    recent_mean = recent_scores.mean()
    base_mean = baseline_scores.mean()
    diff = abs(recent_mean - base_mean)
    logger.info(
        "Drift check: recent_mean=%.4f, base_mean=%.4f, diff=%.4f",
        recent_mean,
        base_mean,
        diff,
    )
    return diff > DRIFT_THRESHOLD

def run_training_script(path: Path) -> bool:
    logger.info("Running training script: %s", path)
    try:
        result = subprocess.run(
            [sys.executable, str(path)],
            cwd=str(ROOT),
            check=True,
            capture_output=True,
            text=True,
        )
        logger.info("Training script %s completed. stdout:\n%s", path.name, result.stdout)
        if result.stderr:
            logger.warning("stderr from %s:\n%s", path.name, result.stderr)
        return True
    except subprocess.CalledProcessError as e:
        logger.error(
            "Training script %s failed with code %s.\nstdout:\n%s\nstderr:\n%s",
            path.name,
            e.returncode,
            e.stdout,
            e.stderr,
        )
        return False

def load_recent_scores() -> np.ndarray:
    if not METRICS_FILE.exists():
        logger.info("Metrics file %s not found; no recent scores.", METRICS_FILE)
        return np.array([], dtype=float)
    with METRICS_FILE.open() as f:
        data = json.load(f)
    recent = data.get("recent_probs", [])
    return np.array(recent, dtype=float)

def main():
    state = load_state()
    last_retrain_iso = state.get("last_retrain_at")
    now = datetime.utcnow()

    if last_retrain_iso:
        last_retrain = datetime.fromisoformat(last_retrain_iso)
        elapsed = (now - last_retrain).total_seconds() / 3600.0
        logger.info("Hours since last retrain: %.2f", elapsed)
        if elapsed < MIN_HOURS_BETWEEN_RETRAINS:
            logger.info("Skipping retrain: minimum interval not reached")
            return

    baseline_scores = np.array(state.get("baseline_scores", []), dtype=float)
    recent_scores = load_recent_scores()

    if not detect_model_drift(recent_scores, baseline_scores):
        logger.info("No significant model drift detected. Skipping retrain.")
        return

    logger.info("Model drift detected. Triggering retrain.")
    all_ok = True
    for script in TRAIN_SCRIPTS:
        if not run_training_script(script):
            all_ok = False

    if all_ok:
        state["last_retrain_at"] = now.isoformat()
        if recent_scores.size:
            state["baseline_scores"] = recent_scores.tolist()
        save_state(state)
        logger.info("Retrain completed successfully and state saved.")
    else:
        logger.error("One or more training scripts failed; state not updated.")

if __name__ == "__main__":
    main()
