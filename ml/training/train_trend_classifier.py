# ml/training/train_trend_classifier.py
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
import pandas as pd
from sklearn.mixture import GaussianMixture

from ml.config import DATA_DIR, MODEL_DIR, configure_logging
from ml.features.feature_engineering import build_feature_matrix
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)

FEATURES_PATH = DATA_DIR / "trend_archetype_features.parquet"
MODEL_PATH = MODEL_DIR / "trend_archetype_gmm.joblib"

def load_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PATH)
    return df

def extract_audio_matrix(df: pd.DataFrame) -> np.ndarray:
    audio_cols = [c for c in df.columns if c.startswith("audio_vec_")]
    if not audio_cols:
        raise ValueError("No audio_vec_* columns found for trend classifier")
    X = df[audio_cols].to_numpy(dtype=float)
    return X, audio_cols

def main():
    logger.info("Loading trend archetype data from %s", FEATURES_PATH)
    df = load_data()
    X_audio, audio_cols = extract_audio_matrix(df)

    logger.info("Scaling audio features for trend classifier")
    X_scaled, _ = transform_with_scaler(
        X_audio, name="trend_audio_features", fit_if_missing=True
    )

    logger.info("Training GMM for trend archetypes")
    gmm = GaussianMixture(
        n_components=8,
        covariance_type="full",
        random_state=42,
        n_init=5,
        reg_covar=1e-3,
    )
    gmm.fit(X_scaled)

    import joblib
    joblib.dump(
        {
            "model": gmm,
            "audio_cols": audio_cols,
        },
        MODEL_PATH,
    )
    logger.info("Saved trend archetype GMM to %s", MODEL_PATH)

if __name__ == "__main__":
    main()
