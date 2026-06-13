"""
Multi-class Trend Classifier — Training

Classifies tracks as: NONE | TRENDING | POPULAR | VIRAL

This replaces the prior unsupervised GMM approach with a supervised
XGBoost multi-class model trained on ETL-generated labels from
jobs/etl/track_trend_labels.ts.

Primary signals: combined UGC + streaming + audio features.
Labels come from TrackTrendLabel table (via CSV/parquet export).

Training data: data/trend_training_features.parquet
Expected columns: all TrackFeatureRow fields + `label` (NONE/TRENDING/POPULAR/VIRAL).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

from ml.config import DATA_DIR, MODEL_DIR, LOG_DIR, configure_logging
from ml.features.feature_engineering import build_combined_features
from ml.models.scalers import fit_and_save_scaler
from ml.utils.splits import leakage_safe_split

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "trend_training_features.parquet"
MODEL_PATH = MODEL_DIR / "trend_classifier_xgb.json"
ENCODER_PATH = MODEL_DIR / "trend_classifier_label_encoder.joblib"
METRICS_PATH = LOG_DIR / "metrics" / "trend_training_metrics.json"

LABEL_ORDER = ["NONE", "TRENDING", "POPULAR", "VIRAL"]

XGB_PARAMS = dict(
    n_estimators=1500,
    max_depth=6,
    learning_rate=0.025,
    subsample=0.85,
    colsample_bytree=0.80,
    min_child_weight=5,
    gamma=0.1,
    reg_alpha=0.05,
    reg_lambda=1.0,
    objective="multi:softprob",
    eval_metric="mlogloss",
    tree_method="hist",
    random_state=42,
)


def _load_data() -> pd.DataFrame:
    if not FEATURES_PATH.exists():
        fallback = DATA_DIR / "viral_training_features.parquet"
        if fallback.exists():
            logger.warning("trend features not found; using viral features as fallback")
            df = pd.read_parquet(fallback)
        else:
            raise FileNotFoundError(
                f"{FEATURES_PATH} not found. Run: npm run export:track-trend-training first."
            )
    else:
        df = pd.read_parquet(FEATURES_PATH)

    logger.info("Loaded data: %d rows", len(df))

    # Normalise label column
    if "label" not in df.columns:
        if "trajectory_label" in df.columns:
            label_map = {"rising": "TRENDING", "peaking": "POPULAR", "declining": "NONE", "stable": "NONE"}
            df["label"] = df["trajectory_label"].map(label_map).fillna("NONE")
        elif "viral_label" in df.columns:
            int_map = {0: "NONE", 1: "TRENDING", 2: "POPULAR", 3: "VIRAL"}
            df["label"] = df["viral_label"].map(int_map).fillna("NONE")
        else:
            raise ValueError("No trend label column found (label / trajectory_label / viral_label)")

    # Keep only known labels
    df = df[df["label"].isin(LABEL_ORDER)].copy()

    # Merge feedback trend labels if available
    feedback_path = DATA_DIR / "feedback_trend_labels.parquet"
    if feedback_path.exists():
        feedback = pd.read_parquet(feedback_path)
        # Keep only feedback rows with known labels
        feedback = feedback[feedback["label"].isin(LABEL_ORDER)].copy()
        for c in df.columns:
            if c not in feedback.columns:
                feedback[c] = np.nan
        extra_cols = [c for c in feedback.columns if c not in df.columns and c != "sample_weight"]
        feedback = feedback.drop(columns=extra_cols, errors="ignore")
        df = pd.concat([df, feedback], ignore_index=True)
        logger.info("Merged %d feedback trend rows from %s", len(feedback), feedback_path)

    logger.info("Label distribution:\n%s", df["label"].value_counts().to_string())
    return df


def main():
    df = _load_data()

    # Temporal holdout — most recent 20% held out as true test set
    train_idx, test_idx, split_strategy = leakage_safe_split(
        df,
        date_col="snapshot_date",
        group_col="trackId",
        test_size=0.2,
    )
    logger.info("Split strategy=%s  train=%d  test=%d", split_strategy, len(train_idx), len(test_idx))

    df_train = df.iloc[train_idx].copy().reset_index(drop=True)
    df_test  = df.iloc[test_idx].copy().reset_index(drop=True)

    records_train = df_train.to_dict(orient="records")
    records_test  = df_test.to_dict(orient="records")

    logger.info("Building combined feature matrices...")
    X_train, feature_names = build_combined_features(records_train)
    X_test, _              = build_combined_features(records_test)
    logger.info("Train: %s  Test: %s  features: %d", X_train.shape, X_test.shape, len(feature_names))

    # Encode labels
    le = LabelEncoder()
    le.classes_ = np.array(LABEL_ORDER)
    y_train = le.transform(df_train["label"].to_numpy())
    y_test  = le.transform(df_test["label"].to_numpy()) if len(df_test) > 0 else np.array([], dtype=int)
    num_classes = len(le.classes_)
    logger.info("Classes: %s", le.classes_.tolist())

    # Per-row sample weights (feedback rows have weight > 1.0)
    sw_train = df_train.get("sample_weight", pd.Series(1.0, index=df_train.index)).fillna(1.0).to_numpy()

    params = {**XGB_PARAMS, "num_class": num_classes}

    # OOF cross-validation on the training portion only
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_preds = np.zeros(len(y_train), dtype=int)

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X_train, y_train)):
        m = XGBClassifier(**params)
        m.fit(
            X_train[tr_idx], y_train[tr_idx],
            eval_set=[(X_train[val_idx], y_train[val_idx])],
            early_stopping_rounds=100,
            verbose=False,
            sample_weight=sw_train[tr_idx],
        )
        oof_preds[val_idx] = m.predict(X_train[val_idx])
        logger.info("Fold %d done, best_iteration=%d", fold, m.best_iteration)

    logger.info(
        "OOF classification report:\n%s",
        classification_report(y_train, oof_preds, target_names=le.classes_.tolist()),
    )
    cm_oof = confusion_matrix(y_train, oof_preds)
    logger.info("OOF Confusion matrix:\n%s", cm_oof)

    # Final model: train on full training portion (not all data)
    final = XGBClassifier(**params)
    final.fit(
        X_train, y_train,
        eval_set=[(X_train, y_train)],
        early_stopping_rounds=150,
        verbose=False,
        sample_weight=sw_train,
    )
    final.save_model(str(MODEL_PATH))
    joblib.dump(le, ENCODER_PATH)
    logger.info("Saved model to %s, encoder to %s", MODEL_PATH, ENCODER_PATH)

    # Held-out test evaluation
    test_report = {}
    if len(y_test) > 0:
        test_preds = final.predict(X_test)
        test_report = classification_report(
            y_test, test_preds, target_names=le.classes_.tolist(), output_dict=True
        )
        logger.info(
            "Holdout test classification report:\n%s",
            classification_report(y_test, test_preds, target_names=le.classes_.tolist()),
        )
        cm_test = confusion_matrix(y_test, test_preds)
        logger.info("Holdout test confusion matrix:\n%s", cm_test)

    # Top feature importances
    importances = final.feature_importances_
    top_feats = sorted(
        zip(feature_names, importances.tolist()),
        key=lambda x: x[1], reverse=True
    )[:25]

    report = classification_report(y_train, oof_preds, target_names=le.classes_.tolist(), output_dict=True)
    metrics = {
        "split_strategy": split_strategy,
        "oof_classification_report": report,
        "oof_confusion_matrix": cm_oof.tolist(),
        "test_classification_report": test_report,
        "top_features": [{"feature": f, "importance": round(v, 4)} for f, v in top_feats],
        "label_order": LABEL_ORDER,
    }
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics saved to %s", METRICS_PATH)


if __name__ == "__main__":
    main()
