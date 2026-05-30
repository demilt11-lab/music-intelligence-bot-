# ml/training/train_trajectory_model.py
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBRegressor

from ml.config import DATA_DIR, MODEL_DIR, configure_logging
from ml.features.feature_engineering import build_feature_matrix
from ml.models.scalers import transform_with_scaler
from ml.models.trajectory_model import save_trajectory_model

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "trajectory_features.parquet"
MODEL_PATH = MODEL_DIR / "trajectory_model_xgb.json"

TARGET_COL = "future_velocity_score"

def load_training_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PATH)
    expected_cols = {"sound_id", "snapshot_at", TARGET_COL}
    missing = expected_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    return df

def build_design_matrix(df: pd.DataFrame):
    records: List[Dict[str, Any]] = df.to_dict(orient="records")
    feat_df = build_feature_matrix(records)
    # Ensure consistent ordering and columns
    feature_cols = [c for c in feat_df.columns if c not in ("sound_id", "snapshot_at", TARGET_COL)]
    X = feat_df[feature_cols].to_numpy(dtype=float)
    y = df[TARGET_COL].to_numpy(dtype=float)
    return X, y, feature_cols

def time_series_cv_score(X: np.ndarray, y: np.ndarray, n_splits: int = 5) -> float:
    tscv = TimeSeriesSplit(n_splits=n_splits)
    scores = []
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X), start=1):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]

        model = XGBRegressor(
            n_estimators=500,
            max_depth=6,
            learning_rate=0.03,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            tree_method="hist",
        )
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        val_pred = model.predict(X_val)
        rmse = np.sqrt(((val_pred - y_val) ** 2).mean())
        logger.info("Fold %d RMSE: %.4f", fold, rmse)
        scores.append(rmse)
    mean_rmse = float(np.mean(scores))
    logger.info("Time-series CV mean RMSE: %.4f", mean_rmse)
    return mean_rmse

def main():
    logger.info("Loading training data from %s", FEATURES_PATH)
    df = load_training_data()
    X, y, feature_cols = build_design_matrix(df)

    # Persist scaler for trajectory model (reuse from feature_engineering if needed)
    X_scaled, _ = transform_with_scaler(X, name="trajectory_features", fit_if_missing=True)

    logger.info("Running time-series cross-validation")
    _ = time_series_cv_score(X_scaled, y, n_splits=5)

    logger.info("Training final time-series aware model")
    model = XGBRegressor(
        n_estimators=800,
        max_depth=7,
        learning_rate=0.02,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        tree_method="hist",
    )
    model.fit(X_scaled, y)

    # Save with metadata
    save_trajectory_model(model, feature_cols, MODEL_PATH)
    logger.info("Saved trajectory model to %s", MODEL_PATH)

if __name__ == "__main__":
    main()
