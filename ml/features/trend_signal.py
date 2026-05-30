# ml/features/trend_signal.py
from datetime import datetime
from typing import List, Dict

import numpy as np

from ml.config import configure_logging

logger = configure_logging(__name__)

def compute_spread_velocity(
    region_video_counts: Dict[str, int],
    region_timestamps: Dict[str, str],
    snapshot_at: str,
) -> float:
    """
    Measures how fast a sound spreads across regions, accounting for time deltas.
    region_video_counts: map region -> cumulative videos
    region_timestamps: map region -> ISO time when region first crossed some threshold
    snapshot_at: current snapshot time (ISO)
    """
    if not region_timestamps:
        return 0.0

    t_snapshot = datetime.fromisoformat(snapshot_at)
    deltas_days = []
    weights = []

    for region, t_iso in region_timestamps.items():
        try:
            t_region = datetime.fromisoformat(t_iso)
        except Exception:
            logger.warning("Bad timestamp for region %s: %s", region, t_iso)
            continue
        dt = (t_snapshot - t_region).total_seconds() / 86400.0
        if dt <= 0:
            continue
        deltas_days.append(dt)
        weights.append(region_video_counts.get(region, 1))

    if not deltas_days:
        return 0.0

    deltas = np.array(deltas_days, dtype=float)
    w = np.array(weights, dtype=float)
    # Velocity = weighted regions per day (more recent, faster spread)
    v = w.sum() / deltas.mean()
    return float(v)
