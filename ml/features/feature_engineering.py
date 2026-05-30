# ml/features/feature_engineering.py
from typing import Dict, Any, List
import numpy as np
import pandas as pd

from ml.config import configure_logging
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)

def safe_log1p(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """Robust log1p transform that tolerates zeros/negatives by clipping."""
    clipped = np.clip(x, a_min=eps, a_max=None)
    return np.log1p(clipped)

def build_feature_matrix(records: List[Dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame.from_records(records)
    # Example numeric and categorical columns
    num_cols = [
        "video_count",
        "view_count",
        "like_count",
        "share_count",
        "comment_count",
        "velocity_score",
    ]
    for col in num_cols:
        if col in df.columns:
            df[f"log_{col}"] = safe_log1p(df[col].fillna(0).astype(float))
        else:
            logger.warning("Missing numeric column '%s' in records", col)

    # Example audio features: assume pre-extracted vectors to ensure consistent dimension
    audio_vec_cols = [c for c in df.columns if c.startswith("audio_vec_")]
    if audio_vec_cols:
        audio_vec = df[audio_vec_cols].to_numpy().astype(float)
        X_audio, _ = transform_with_scaler(audio_vec, name="audio_features", fit_if_missing=True)
        for i, col in enumerate(audio_vec_cols):
            df[col] = X_audio[:, i]

    # Scale numeric features with shared scaler
    all_num = [c for c in df.columns if c.startswith("log_")]
    if all_num:
        X_num = df[all_num].to_numpy().astype(float)
        X_scaled, _ = transform_with_scaler(X_num, name="ugc_numeric", fit_if_missing=True)
        for i, col in enumerate(all_num):
            df[col] = X_scaled[:, i]

    return df
