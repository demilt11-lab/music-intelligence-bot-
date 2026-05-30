# ml/training/retrain_scheduler.py
"""
Automated retraining loop.
Runs on a schedule (cron or continuous loop) to:
  1. Collect fresh features from the API
  2. Auto-label using rule-based trajectory logic (until enough human labels exist)
  3. Retrain viral predictor and trend classifier
  4. Save versioned models with metadata
  5. Log performance delta vs previous model
"""

import os
import json
import time
import logging
import subprocess
from datetime import datetime
import joblib
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = "output/models"
DATA_DIR = "output/data"
RETRAIN_INTERVAL_HOURS = int(os.environ.get("RETRAIN_INTERVAL_HOURS", 24))

TRAJECTORY_AUTO_LABEL_RULES = {
    "rising": 1,
    "resurging": 1,
    "peaking": 0,
    "declining": 0,
    "stable": 0,
    "low_signal": 0,
}


def auto_label_rows(rows):
    """
    Auto-labels rows using trajectory state as a proxy for viral_label.
    Used until sufficient human-verified labels are available.
    """
    labeled = []
    for row in rows:
        traj = row.get("trajectory_label")
        if traj and row.get("viral_label") is None:
            row["viral_label"] = TRAJECTORY_AUTO_LABEL_RULES.get(traj, 0)
        labeled.append(row)
    return labeled


def load_existing_metrics(model_name: str) -> dict:
    path = f"{MODEL_DIR}/{model_name}_metadata.json"
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def version_model(model_name: str):
    """Copies current model to a versioned backup before retraining."""
    src = f"{MODEL_DIR}/{model_name}.pkl"
    if os.path.exists(src):
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        dst = f"{MODEL_DIR}/versions/{model_name}_{ts}.pkl"
        os.makedirs(f"{MODEL_DIR}/versions", exist_ok=True)
        import shutil
        shutil.copy(src, dst)
        logger.info(f"Versioned model to {dst}")


def run_retrain_cycle():
    logger.info("=== Starting retrain cycle ===")

    # 1. Load latest collected features
    features_path = f"{DATA_DIR}/features.json"
    labeled_path = f"{DATA_DIR}/features_labeled.json"

    if not os.path.exists(features_path):
        logger.warning("No features file found; skipping retrain.")
        return

    with open(features_path) as f:
        rows = json.load(f)

    # 2. Auto-label unlabeled rows
    rows = auto_label_rows(rows)

    with open(labeled_path, "w") as f:
        json.dump(rows, f, indent=2)

    logger.info(f"Auto-labeled {len(rows)} rows")

    # 3. Version existing models before overwriting
    version_model("viral_predictor_stack")
    version_model("audio_archetype_kmeans")
    version_model("regional_trend_models")

    # 4. Load previous metrics for comparison
    prev_metrics = load_existing_metrics("viral_predictor")

    # 5. Retrain viral predictor
    logger.info("Retraining viral predictor...")
    result = subprocess.run(
        ["python", "ml/training/train_viral_predictor.py"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.error(f"Viral predictor training failed:\n{result.stderr}")
    else:
        logger.info("Viral predictor retrained successfully.")

    # 6. Retrain trend classifier
    logger.info("Retraining trend classifier...")
    result = subprocess.run(
        ["python", "ml/training/train_trend_classifier.py"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.error(f"Trend classifier training failed:\n{result.stderr}")
    else:
        logger.info("Trend classifier retrained successfully.")

    # 7. Log performance delta
    new_metrics = load_existing_metrics("viral_predictor")
    prev_auc = prev_metrics.get("metrics", {}).get("auc_roc", 0)
    new_auc = new_metrics.get("metrics", {}).get("auc_roc", 0)

    delta = new_auc - prev_auc
    logger.info(f"AUC delta: {delta:+.4f} (prev={prev_auc:.4f} new={new_auc:.4f})")

    cycle_log = {
        "timestamp": datetime.utcnow().isoformat(),
        "rows_trained": len(rows),
        "prev_auc": prev_auc,
        "new_auc": new_auc,
        "delta": delta,
    }

    log_path = f"{DATA_DIR}/retrain_log.jsonl"
    with open(log_path, "a") as f:
        f.write(json.dumps(cycle_log) + "\n")

    logger.info("=== Retrain cycle complete ===")


def main():
    while True:
        try:
            run_retrain_cycle()
        except Exception as e:
            logger.error(f"Retrain cycle error: {e}")
        logger.info(f"Sleeping {RETRAIN_INTERVAL_HOURS}h until next cycle...")
        time.sleep(RETRAIN_INTERVAL_HOURS * 3600)


if __name__ == "__main__":
    main()
