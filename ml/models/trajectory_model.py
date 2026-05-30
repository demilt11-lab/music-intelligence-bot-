# ml/models/trajectory_model.py
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Any, Dict

import json
from xgboost import XGBRegressor

from ml.config import configure_logging

logger = configure_logging(__name__)

@dataclass
class TrajectoryModelPackage:
    feature_cols: List[str]
    model_path: str

def save_trajectory_model(
    model: XGBRegressor, feature_cols: List[str], path: Path
):
    # Save model
    model.save_model(str(path))
    meta = TrajectoryModelPackage(
        feature_cols=feature_cols,
        model_path=str(path),
    )
    meta_path = path.with_suffix(".meta.json")
    with meta_path.open("w") as f:
        json.dump(asdict(meta), f, indent=2)
    logger.info("Saved trajectory model meta to %s", meta_path)
