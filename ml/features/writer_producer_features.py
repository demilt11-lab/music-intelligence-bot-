"""
Feature engineering for the writer/producer breakout predictor.

Input records come from writer_producer_rising_scores joined with songwriter
context. Each record is one (songwriterId, date) snapshot.

Expected fields per record:
  stream_velocity       float  0-1  normalised 7d streaming velocity
  playlist_momentum     float  0-1  playlist follower / editorial signal
  collaboration_score   float  0-1  collaborator popularity signal
  ugc_momentum          float  0-1  TikTok / UGC velocity signal
  multi_track_presence  float  0-1  album/playlist/weekly cluster signal (new)
  is_signed             int    0/1  currently signed to major label
  track_count           int        total track credits in catalog
  rising_score_lag7d    float  0-1  rising score from 7 days ago (trend direction)
  rising_score_lag30d   float  0-1  rising score from 30 days ago (baseline)
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from ml.config import configure_logging
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)

_FEATURE_COLS = [
    "stream_velocity",
    "playlist_momentum",
    "collaboration_score",
    "ugc_momentum",
    "multi_track_presence",
    "is_signed",
    "track_count",
    "rising_score_lag7d",
    "rising_score_lag30d",
]


def _safe_log1p(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    return np.log1p(np.clip(x, a_min=eps, a_max=None))


def _fill(df: pd.DataFrame, cols: List[str], value: float = 0.0) -> pd.DataFrame:
    for c in cols:
        if c not in df.columns:
            df[c] = value
        else:
            df[c] = df[c].fillna(value)
    return df


def build_writer_producer_features(
    records: List[Dict[str, Any]],
) -> Tuple[np.ndarray, List[str]]:
    """
    Transform a list of writer/producer score snapshots into a normalised
    feature matrix.  Returns (X, feature_names).
    """
    df = pd.DataFrame.from_records(records)
    df = _fill(df, _FEATURE_COLS)

    out = pd.DataFrame(index=df.index)

    # Score components — already 0-1, pass through
    for col in [
        "stream_velocity",
        "playlist_momentum",
        "collaboration_score",
        "ugc_momentum",
        "multi_track_presence",
    ]:
        out[col] = df[col].clip(0, 1)

    # Binary flag
    out["is_signed"] = df["is_signed"].clip(0, 1)

    # Track count: log-scale (catalog depth signal)
    out["log_track_count"] = _safe_log1p(df["track_count"].to_numpy())

    # Trend direction: recent score vs baseline (is momentum building?)
    out["score_trend_7d"]  = (df["rising_score_lag7d"]  - df["stream_velocity"]).clip(-1, 1)
    out["score_trend_30d"] = (df["rising_score_lag30d"] - df["stream_velocity"]).clip(-1, 1)

    # Acceleration: 7d trend minus 30d trend (second derivative of momentum)
    out["score_acceleration"] = (out["score_trend_7d"] - out["score_trend_30d"]).clip(-1, 1)

    # Interaction: multi-track presence × stream velocity (writing output converting to streams)
    out["presence_stream_synergy"] = (
        df["multi_track_presence"] * df["stream_velocity"]
    ).clip(0, 1)

    # Interaction: UGC × multi-track (creator's output going viral across tracks)
    out["ugc_presence_synergy"] = (
        df["ugc_momentum"] * df["multi_track_presence"]
    ).clip(0, 1)

    # Unsigned high-momentum flag (most valuable discovery signal)
    out["unsigned_momentum"] = (
        (1 - df["is_signed"]) * df["stream_velocity"]
    ).clip(0, 1)

    # Missingness indicators for key signals (0 = no data, not zero activity)
    for col in ["multi_track_presence", "ugc_momentum", "collaboration_score"]:
        src_col = col
        out[f"{col}_observed"] = (
            pd.DataFrame.from_records(records)[src_col].notna().astype(float)
            if src_col in pd.DataFrame.from_records(records).columns
            else 0.0
        )

    feature_names = list(out.columns)
    X = out.to_numpy(dtype=float)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    X_scaled, _ = transform_with_scaler(X, name="writer_producer_features", fit_if_missing=True)
    return X_scaled, feature_names
