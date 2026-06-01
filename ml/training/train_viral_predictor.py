"""
Viral Track Predictor — Training

Predicts whether a track will go viral within 7, 14, and 30 days.
"Viral" = sustained UGC explosion (TikTok videos >200% growth) and/or
streaming velocity exceeding 2× its rolling baseline within the window.

Primary signals: TikTok UGC velocity, geo spread, early editorial adds,
YouTube Shorts crossover, Spotify stream acceleration.

Training data: parquet at data/viral_training_features.parquet
Expected columns: all fields from TrackFeatureRow + viral_7d, viral_14d, viral_30d (int 0/1).
If only `viral_label` (int) exists, it is used as viral_30d.
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
    classification_report,
    roc_auc_score,
    average_precision_score,
)
from sklearn.model_selection import StratifiedKFold
from xgboost import XGBClassifier

from ml.config import DATA_DIR, MODEL_DIR, LOG_DIR, configure_logging
from ml.features.feature_engineering import build_viral_features
from ml.models.scalers import fit_and_save_scaler, transform_with_scaler

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "viral_training_features.parquet"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
METRICS_PATH = LOG_DIR / "metrics" / "viral_training_metrics.json"

HORIZONS = {
    "7d":  "viral_7d",
    "14d": "viral_14d",
    "30d": "viral_30d",
}

XGB_PARAMS = dict(
    n_estimators=2000,
    max_depth=6,
    learning_rate=0.02,
    subsample=0.85,
    colsample_bytree=0.85,
    min_child_weight=5,
    gamma=0.1,
    reg_alpha=0.1,
    reg_lambda=1.0,
    objective="binary:logistic",
    eval_metric="aucpr",           # average precision is best for imbalanced viral data
    tree_method="hist",
    random_state=42,
)


def _load_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PATH)
    logger.info("Loaded training data: %d rows, columns: %s", len(df), list(df.columns))

    # Normalise label columns — support both naming conventions
    if "viral_30d" not in df.columns:
        if "viral_label" in df.columns:
            df["viral_30d"] = df["viral_label"].astype(int)
        elif "is_viral" in df.columns:
            df["viral_30d"] = df["is_viral"].astype(int)
        else:
            raise ValueError("No viral label column found (viral_30d / viral_label / is_viral)")

    if "viral_7d" not in df.columns:
        # Approximate: tracks labelled viral AND with very high 7d TikTok growth
        df["viral_7d"] = (
            (df["viral_30d"] == 1) &
            (df.get("tiktok_growth_rate_7d", pd.Series(0, index=df.index)) > 1.0)
        ).astype(int)

    if "viral_14d" not in df.columns:
        df["viral_14d"] = (
            (df["viral_30d"] == 1) &
            (df.get("tiktok_growth_rate_7d", pd.Series(0, index=df.index)) > 0.5)
        ).astype(int)

    return df


def _compute_class_weight(y: np.ndarray) -> float:
    """Scale pos_weight for XGBoost to handle class imbalance."""
    n_neg = (y == 0).sum()
    n_pos = (y == 1).sum()
    if n_pos == 0:
        return 1.0
    return float(n_neg / n_pos)


def _train_single_horizon(
    X: np.ndarray,
    y: np.ndarray,
    feature_names: List[str],
    horizon: str,
) -> Dict:
    """Train one XGBoost model for the given horizon with CV evaluation."""
    logger.info("[%s] Class distribution: %d positives / %d total", horizon, y.sum(), len(y))

    pos_weight = _compute_class_weight(y)
    logger.info("[%s] pos_weight=%.2f", horizon, pos_weight)

    params = {**XGB_PARAMS, "scale_pos_weight": pos_weight}

    # 5-fold stratified CV for evaluation
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_probs = np.zeros(len(y))

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X, y)):
        X_tr, X_val = X[tr_idx], X[val_idx]
        y_tr, y_val = y[tr_idx], y[val_idx]

        fold_model = XGBClassifier(**params)
        fold_model.fit(
            X_tr, y_tr,
            eval_set=[(X_val, y_val)],
            early_stopping_rounds=100,
            verbose=False,
        )
        oof_probs[val_idx] = fold_model.predict_proba(X_val)[:, 1]
        logger.info("[%s] Fold %d best_iteration=%d", horizon, fold, fold_model.best_iteration)

    roc_auc = roc_auc_score(y, oof_probs)
    avg_prec = average_precision_score(y, oof_probs)
    logger.info("[%s] OOF ROC-AUC=%.4f  Avg-Precision=%.4f", horizon, roc_auc, avg_prec)

    # Final model on all data
    final_model = XGBClassifier(**params)
    final_model.fit(
        X, y,
        eval_set=[(X, y)],
        early_stopping_rounds=150,
        verbose=False,
    )

    # Calibrate probabilities via Platt scaling
    calibrated = CalibratedClassifierCV(final_model, cv="prefit", method="sigmoid")
    calibrated.fit(X, y)

    model_path = MODEL_DIR / f"viral_predictor_{horizon}_xgb.json"
    cal_path = MODEL_DIR / f"viral_predictor_{horizon}_calibrated.joblib"
    final_model.save_model(str(model_path))
    joblib.dump(calibrated, cal_path)
    logger.info("[%s] Saved model to %s", horizon, model_path)

    # Feature importance
    importances = final_model.feature_importances_
    top_feats = sorted(
        zip(feature_names, importances.tolist()),
        key=lambda x: x[1],
        reverse=True,
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

    logger.info("Building viral feature matrix...")
    X, feature_names = build_viral_features(records)
    logger.info("Feature matrix shape: %s, %d features", X.shape, len(feature_names))

    all_metrics = []

    for horizon, col in HORIZONS.items():
        if col not in df.columns:
            logger.warning("Skipping horizon %s — column %s not in data", horizon, col)
            continue
        y = df[col].fillna(0).astype(int).to_numpy()
        metrics = _train_single_horizon(X, y, feature_names, horizon)
        all_metrics.append(metrics)

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(all_metrics, f, indent=2)
    logger.info("Training metrics saved to %s", METRICS_PATH)

    for m in all_metrics:
        logger.info(
            "Horizon %s — ROC-AUC=%.4f  Avg-Precision=%.4f",
            m["horizon"], m["roc_auc"], m["avg_precision"],
        )


if __name__ == "__main__":
    main()
