"""
Writer/Producer Breakout Predictor — Training

Predicts whether a songwriter or producer will have a breakout track
(charting in the top 100 on any major chart) within 30 days of the
score snapshot date.

Training data: data/writer_producer_training_features.parquet
Expected columns: all fields from writer_producer_features.py + was_breakout_30d (int 0/1).

The label `was_breakout_30d` is generated retrospectively: for each
(songwriterId, date) row, was any of their tracks in the top 100 of
any chart within 30 days after `date`?

Pipeline mirrors train_viral_predictor.py:
  - Leakage-safe temporal split (train on older data, test on recent)
  - 5-fold stratified CV
  - XGBoost + Platt calibration
  - Saves calibrated model to models/writer_producer_predictor_calibrated.joblib
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from xgboost import XGBClassifier

from ml.config import DATA_DIR, MODEL_DIR, LOG_DIR, configure_logging
from ml.features.writer_producer_features import build_writer_producer_features
from ml.utils.splits import leakage_safe_split

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR  / "writer_producer_training_features.parquet"
MODEL_PATH    = MODEL_DIR / "writer_producer_predictor_xgb.json"
CAL_PATH      = MODEL_DIR / "writer_producer_predictor_calibrated.joblib"
METRICS_PATH  = LOG_DIR   / "metrics" / "writer_producer_training_metrics.json"

XGB_PARAMS = dict(
    n_estimators=1500,
    max_depth=5,
    learning_rate=0.03,
    subsample=0.85,
    colsample_bytree=0.85,
    min_child_weight=5,
    gamma=0.1,
    reg_alpha=0.1,
    reg_lambda=1.0,
    objective="binary:logistic",
    eval_metric="aucpr",
    tree_method="hist",
    random_state=42,
)


def _load_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PATH)
    logger.info("Loaded %d rows, %d columns", len(df), len(df.columns))

    if "was_breakout_30d" not in df.columns:
        raise ValueError(
            "Missing label column 'was_breakout_30d'. "
            "Run the retrospective labeller first."
        )
    return df


def _build_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute lagged rising_score values per songwriter so the model can
    see trend direction.  Requires 'songwriter_id' and 'date' columns.
    """
    if "songwriter_id" not in df.columns or "date" not in df.columns:
        df["rising_score_lag7d"]  = df.get("rising_score", 0)
        df["rising_score_lag30d"] = df.get("rising_score", 0)
        return df

    df = df.sort_values(["songwriter_id", "date"])
    df["rising_score_lag7d"]  = df.groupby("songwriter_id")["rising_score"].shift(7).fillna(0)
    df["rising_score_lag30d"] = df.groupby("songwriter_id")["rising_score"].shift(30).fillna(0)
    return df


def _compute_pos_weight(y: np.ndarray) -> float:
    n_neg = (y == 0).sum()
    n_pos = (y == 1).sum()
    return float(n_neg / n_pos) if n_pos > 0 else 1.0


def _train(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> Tuple[XGBClassifier, CalibratedClassifierCV, Dict]:
    pos_weight = _compute_pos_weight(y_train)
    logger.info("pos_weight=%.2f  positives=%d/%d", pos_weight, int(y_train.sum()), len(y_train))

    params = {**XGB_PARAMS, "scale_pos_weight": pos_weight}
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_probs = np.zeros(len(y_train))

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X_train, y_train)):
        m = XGBClassifier(**params)
        m.fit(
            X_train[tr_idx], y_train[tr_idx],
            eval_set=[(X_train[val_idx], y_train[val_idx])],
            early_stopping_rounds=100,
            verbose=False,
        )
        oof_probs[val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        logger.info("Fold %d  best_iteration=%d", fold, m.best_iteration)

    oof_roc = roc_auc_score(y_train, oof_probs)
    oof_ap  = average_precision_score(y_train, oof_probs)
    logger.info("OOF  ROC-AUC=%.4f  Avg-Precision=%.4f", oof_roc, oof_ap)

    X_fit, X_cal, y_fit, y_cal = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
    )
    final = XGBClassifier(**params)
    final.fit(X_fit, y_fit, eval_set=[(X_cal, y_cal)], early_stopping_rounds=150, verbose=False)

    calibrated = CalibratedClassifierCV(final, cv="prefit", method="sigmoid")
    calibrated.fit(X_cal, y_cal)

    metrics: Dict = {
        "oof_roc_auc":       round(oof_roc, 4),
        "oof_avg_precision": round(oof_ap,  4),
        "n_features":        X_train.shape[1],
        "pos_weight":        round(pos_weight, 2),
        "n_pos":             int(y_train.sum()),
        "n_total":           len(y_train),
    }

    if len(y_test) > 0 and y_test.sum() > 0:
        test_probs = calibrated.predict_proba(X_test)[:, 1]
        metrics["test_roc_auc"]       = round(float(roc_auc_score(y_test, test_probs)),       4)
        metrics["test_avg_precision"] = round(float(average_precision_score(y_test, test_probs)), 4)
        logger.info("Test  ROC-AUC=%.4f  Avg-Precision=%.4f", metrics["test_roc_auc"], metrics["test_avg_precision"])

    return final, calibrated, metrics


def main() -> None:
    df = _load_data()
    df = _build_lag_features(df)

    train_idx, test_idx, split_strategy = leakage_safe_split(
        df,
        date_col="date",
        group_col="songwriter_id",
        test_size=0.2,
    )
    logger.info("Split=%s  train=%d  test=%d", split_strategy, len(train_idx), len(test_idx))

    df_train = df.iloc[train_idx].copy().reset_index(drop=True)
    df_test  = df.iloc[test_idx].copy().reset_index(drop=True)

    X_train, feature_names = build_writer_producer_features(df_train.to_dict(orient="records"))
    X_test,  _             = build_writer_producer_features(df_test.to_dict(orient="records"))
    logger.info("Features: %d dims  train=%s  test=%s", len(feature_names), X_train.shape, X_test.shape)

    y_train = df_train["was_breakout_30d"].fillna(0).astype(int).to_numpy()
    y_test  = df_test["was_breakout_30d"].fillna(0).astype(int).to_numpy()

    final_model, calibrated, metrics = _train(X_train, y_train, X_test, y_test)
    metrics["split_strategy"] = split_strategy
    metrics["feature_names"]  = feature_names

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    final_model.save_model(str(MODEL_PATH))
    joblib.dump(calibrated, CAL_PATH)
    logger.info("Saved XGBoost → %s", MODEL_PATH)
    logger.info("Saved calibrated → %s", CAL_PATH)

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics → %s", METRICS_PATH)

    logger.info(
        "Done — OOF ROC-AUC=%.4f  OOF Avg-Precision=%.4f",
        metrics["oof_roc_auc"], metrics["oof_avg_precision"],
    )


if __name__ == "__main__":
    main()
