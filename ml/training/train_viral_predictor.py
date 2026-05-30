# ml/training/train_viral_predictor.py
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split

from ml.config import DATA_DIR, MODEL_DIR, configure_logging
from ml.features.feature_engineering import build_feature_matrix
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "viral_training_features.parquet"
MODEL_PATH = MODEL_DIR / "viral_predictor_xgb.json"
TARGET_COL = "is_viral"

def main():
    df = pd.read_parquet(FEATURES_PATH)
    records = df.to_dict(orient="records")
    feat_df = build_feature_matrix(records)
    feature_cols = [c for c in feat_df.columns if c not in ("sound_id", "snapshot_at", TARGET_COL)]
    X = feat_df[feature_cols].to_numpy(dtype=float)
    y = df[TARGET_COL].to_numpy(dtype=int)

    X_scaled, _ = transform_with_scaler(X, name="viral_features", fit_if_missing=True)

    X_train, X_val, y_train, y_val = train_test_split(
        X_scaled, y, test_size=0.2, shuffle=True, stratify=y, random_state=42
    )

    model = XGBClassifier(
        n_estimators=2000,
        max_depth=6,
        learning_rate=0.02,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
    )

    logger.info("Training viral predictor with early stopping")
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        early_stopping_rounds=100,
        verbose=50,
    )

    best_ntrees = model.best_ntree_limit
    logger.info("Best ntrees from early stopping: %d", best_ntrees)

    model.save_model(str(MODEL_PATH))
    logger.info("Saved viral predictor model to %s", MODEL_PATH)

if __name__ == "__main__":
    main()
