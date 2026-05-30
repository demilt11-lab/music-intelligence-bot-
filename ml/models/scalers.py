# ml/models/scalers.py
from pathlib import Path
from typing import Optional, Tuple
import joblib
import numpy as np
from sklearn.preprocessing import StandardScaler

from ml.config import MODEL_DIR, configure_logging

logger = configure_logging(__name__)

SCALER_DIR = MODEL_DIR / "scalers"
SCALER_DIR.mkdir(parents=True, exist_ok=True)

def get_scaler_path(name: str) -> Path:
    return SCALER_DIR / f"{name}_scaler.joblib"

def fit_and_save_scaler(
    X: np.ndarray, name: str
) -> StandardScaler:
    logger.info("Fitting scaler '%s' on shape %s", name, X.shape)
    scaler = StandardScaler()
    scaler.fit(X)
    path = get_scaler_path(name)
    joblib.dump(scaler, path)
    logger.info("Saved scaler '%s' to %s", name, path)
    return scaler

def load_scaler(name: str) -> Optional[StandardScaler]:
    path = get_scaler_path(name)
    if not path.exists():
        logger.warning("Scaler '%s' not found at %s", name, path)
        return None
    scaler: StandardScaler = joblib.load(path)
    logger.info("Loaded scaler '%s' from %s", name, path)
    return scaler

def transform_with_scaler(
    X: np.ndarray, name: str, fit_if_missing: bool = False
) -> Tuple[np.ndarray, StandardScaler]:
    scaler = load_scaler(name)
    if scaler is None:
        if not fit_if_missing:
            raise RuntimeError(f"Scaler '{name}' not found and fit_if_missing=False")
        scaler = fit_and_save_scaler(X, name)
    return scaler.transform(X), scaler
