# ml/inference/metrics_writer.py
from pathlib import Path
import json
from typing import List

import numpy as np

from ml.config import METRICS_DIR, configure_logging

logger = configure_logging(__name__)

METRICS_FILE = METRICS_DIR / "viral_prob_distribution.json"
WINDOW_SIZE = 500  # number of recent probabilities to keep

def update_viral_prob_metrics(new_probs: List[float]) -> None:
    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if METRICS_FILE.exists():
        with METRICS_FILE.open() as f:
            data = json.load(f)
    else:
        data = {"recent_probs": []}

    recent = data.get("recent_probs", [])
    recent.extend(float(p) for p in new_probs)

    # Keep only last WINDOW_SIZE
    if len(recent) > WINDOW_SIZE:
        recent = recent[-WINDOW_SIZE:]

    data["recent_probs"] = recent

    with METRICS_FILE.open("w") as f:
        json.dump(data, f, indent=2)

    logger.info(
        "Updated viral_prob_distribution.json with %d new values (total %d)",
        len(new_probs),
        len(recent),
    )
