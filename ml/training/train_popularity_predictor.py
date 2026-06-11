"""
Popularity Predictor — Training

Predicts whether a track will sustain mainstream popularity:
  - popular_7d:  will reach/sustain Spotify popularity ≥ 60 within 7 days
  - popular_30d: will sustain > 500k streams/week within 30 days
  - popular_90d: will appear on major editorial playlists within 90 days

Primary signals: Spotify streams, stream velocity, editorial playlist adds,
radio spins, chart presence, geo breadth.

Training data: data/popularity_training_features.parquet
Expected columns: all TrackFeatureRow fields + popular_7d, popular_30d, popular_90d (int 0/1).
Falls back to `trajectory_label == "popular"` if explicit labels are absent.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    classification_report,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from xgboost import XGBClassifier

from ml.config import DATA_DIR, MODEL_DIR, LOG_DIR, configure_logging
from ml.features.feature_engineering import build_popularity_features

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "popularity_training_features.parquet"
METRICS_PATH = LOG_DIR / "metrics" / "popularity_training_metrics.json"

HORIZONS = {
    "7d":  "popular_7d",
    "30d": "popular_30d",
    "90d": "popular_90d",
}

XGB_PARAMS = dict(
    n_estimators=2000,
    max_depth=5,
    learning_rate=0.02,
    subsample=0.85,
    colsample_bytree=0.80,
    min_child_weight=10,
    gamma=0.2,
    reg_alpha=0.05,
    reg_lambda=1.0,
    objective="binary:logistic",
    eval_metric="aucpr",
    tree_method="hist",
    random_state=42,
)


def _load_data() -> pd.DataFrame:
    if not FEATURES_PATH.exists():
        # Fall back to viral features if popularity-specific data not yet collected
        fallback = DATA_DIR / "viral_training_features.parquet"
        if fallback.exists():
            logger.warning("popularity features not found; using viral features as fallback")
            df = pd.read_parquet(fallback)
        else:
            raise FileNotFoundError(
                f"{FEATURES_PATH} not found. "
                "Run: npm run export:popularity-training first."
            )
    else:
        df = pd.read_parquet(FEATURES_PATH)

    logger.info("Loaded data: %d rows", len(df))

    # Build labels if missing
    if "popular_30d" not in df.columns:
        if "trajectory_label" in df.columns:
            df["popular_30d"] = (df["trajectory_label"].isin(["popular", "peaking"])).astype(int)
        elif "viral_label" in df.columns:
            # Treat POPULAR tracks as positive (label == 2 in old schema)
            df["popular_30d"] = (df["viral_label"] == 2).astype(int)
        else:
            raise ValueError("No popularity label column found")

    if "popular_7d" not in df.columns:
        # Tracks with very high Spotify popularity already
        df["popular_7d"] = (
            (df["popular_30d"] == 1) &
            (df.get("spotify_popularity", pd.Series(0, index=df.index)) >= 70)
        ).astype(int)

    if "popular_90d" not in df.columns:
        # Approximate using editorial playlist presence
        df["popular_90d"] = (
            (df["popular_30d"] == 1) &
            (df.get("spotify_editorial_playlist_count", pd.Series(0, index=df.index)) > 0)
        ).astype(int)

    return df


def _train_horizon(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: List[str],
    horizon: str,
) -> Dict:
    logger.info("[%s] Positives=%d / Total=%d", horizon, y.sum(), len(y))

    n_neg = (y == 0).sum()
    n_pos = (y == 1).sum()
    pos_weight = float(n_neg / n_pos) if n_pos else 1.0
    params = {**XGB_PARAMS, "scale_pos_weight": pos_weight}

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_probs = np.zeros(len(y))

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X, y)):
        m = XGBClassifier(**params)
        m.fit(
            X[tr_idx], y[tr_idx],
            eval_set=[(X[val_idx], y[val_idx])],
            early_stopping_rounds=100,
            verbose=False,
        )
        oof_probs[val_idx] = m.predict_proba(X[val_idx])[:, 1]

    roc_auc = roc_auc_score(y, oof_probs)
    avg_prec = average_precision_score(y, oof_probs)
    logger.info("[%s] OOF ROC-AUC=%.4f  Avg-Precision=%.4f", horizon, roc_auc, avg_prec)

    # Hold out a stratified slice for early stopping + calibration so the
    # final model is never calibrated on its own training data.
    X_fit, X_cal, y_fit, y_cal = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    final = XGBClassifier(**params)
    final.fit(X_fit, y_fit, eval_set=[(X_cal, y_cal)], early_stopping_rounds=150, verbose=False)

    calibrated = CalibratedClassifierCV(final, cv="prefit", method="sigmoid")
    calibrated.fit(X_cal, y_cal)

    model_path = MODEL_DIR / f"popularity_predictor_{horizon}_xgb.json"
    cal_path = MODEL_DIR / f"popularity_predictor_{horizon}_calibrated.joblib"
    final.save_model(str(model_path))
    joblib.dump(calibrated, cal_path)
    logger.info("[%s] Saved to %s", horizon, model_path)

    importances = final.feature_importances_
    top_feats = sorted(
        zip(feature_names, importances.tolist()),
        key=lambda x: x[1], reverse=True
    )[:20]

    return {
        "horizon": horizon,
        "roc_auc": round(roc_auc, 4),
        "avg_precision": round(avg_prec, 4),
        "pos_weight": round(pos_weight, 2),
        "n_pos": int(y.sum()),
        "n_total": len(y),
        "top_features": [{"feature": f, "importance": round(v, 4)} for f, v in top_feats],
    }


def main():
    df = _load_data()
    records = df.to_dict(orient="records")

    logger.info("Building popularity feature matrix...")
    X, feature_names = build_popularity_features(records)
    logger.info("Feature matrix: %s with %d features", X.shape, len(feature_names))

    all_metrics = []
    for horizon, col in HORIZONS.items():
        if col not in df.columns:
            logger.warning("Skipping %s — no column %s", horizon, col)
            continue
        y = df[col].fillna(0).astype(int).to_numpy()
        metrics = _train_horizon(X, y, feature_names, horizon)
        all_metrics.append(metrics)

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(all_metrics, f, indent=2)
    logger.info("Metrics saved to %s", METRICS_PATH)


if __name__ == "__main__":
    main()
