# ml/inference/predictor.py
"""
Inference engine.
Loads trained models and serves viral probability +
trajectory predictions for any track given its features.
"""

import os
import json
import logging
import numpy as np
import joblib
from typing import Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = os.environ.get("MODEL_DIR", "output/models")


class ViralPredictor:
    def __init__(self):
        self.stack = None
        self.feature_names = None
        self.scaler = None
        self.kmeans = None
        self.region_models = None
        self._loaded = False

    def load(self):
        """Lazy-load all models on first use."""
        if self._loaded:
            return

        stack_path = f"{MODEL_DIR}/viral_predictor_stack.pkl"
        names_path = f"{MODEL_DIR}/feature_names.pkl"
        scaler_path = f"{MODEL_DIR}/scaler.pkl"
        kmeans_path = f"{MODEL_DIR}/audio_archetype_kmeans.pkl"
        region_path = f"{MODEL_DIR}/regional_trend_models.pkl"

        if not os.path.exists(stack_path):
            logger.warning("No trained model found. Run train_viral_predictor.py first.")
            return

        self.stack = joblib.load(stack_path)
        self.feature_names = joblib.load(names_path) if os.path.exists(names_path) else []
        self.scaler = joblib.load(scaler_path) if os.path.exists(scaler_path) else None
        self.kmeans = joblib.load(kmeans_path) if os.path.exists(kmeans_path) else None
        self.region_models = joblib.load(region_path) if os.path.exists(region_path) else {}
        self._loaded = True
        logger.info("Models loaded successfully.")

    def _features_to_vector(self, features: Dict) -> np.ndarray:
        import sys
        sys.path.insert(0, "ml/training")
        from feature_engineering import engineer_features
        import pandas as pd

        engineered = engineer_features(features)
        if self.feature_names:
            vec = [engineered.get(f, 0.0) for f in self.feature_names]
        else:
            vec = list(engineered.values())

        X = np.array(vec).reshape(1, -1)
        if self.scaler:
            X = self.scaler.transform(X)
        return X

    def predict_viral(self, features: Dict) -> Dict:
        """
        Returns viral probability and label for a track.
        features: dict matching ViralFeatures shape
        """
        self.load()
        if not self.stack:
            return {"viral_probability": None, "viral_label": None, "error": "Model not loaded"}

        X = self._features_to_vector(features)

        xgb_prob = np.mean(
