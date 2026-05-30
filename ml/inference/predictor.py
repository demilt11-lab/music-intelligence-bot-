# ml/inference/predictor.py
from pathlib import Path
from typing import Dict, Any, List

import joblib
import numpy as np
import shap

from ml.config import MODEL_DIR, configure_logging
from ml.features.feature_engineering import build_feature_matrix
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)

VIRAL_MODEL_PATH = MODEL_DIR / "viral_predictor_xgb.json"
TRAJ_MODEL_PATH = MODEL_DIR / "trajectory_model_xgb.json"
TREND_GMM_PATH = MODEL_DIR / "trend_archetype_gmm.joblib"

class Predictor:
    def __init__(self):
        from xgboost import XGBClassifier, XGBRegressor

        logger.info("Loading models for Predictor")
        self.viral_model = XGBClassifier()
        self.viral_model.load_model(str(VIRAL_MODEL_PATH))

        self.trajectory_model = XGBRegressor()
        self.trajectory_model.load_model(str(TRAJ_MODEL_PATH))

        gmm_bundle = joblib.load(TREND_GMM_PATH)
        self.trend_gmm = gmm_bundle["model"]
        self.trend_audio_cols = gmm_bundle["audio_cols"]

        # SHAP explainers (lazy init)
        self._viral_explainer = None
        self._traj_explainer = None

    def _ensure_explainers(self, X_background: np.ndarray):
        if self._viral_explainer is None:
            logger.info("Initializing SHAP explainer for viral model")
            self._viral_explainer = shap.TreeExplainer(self.viral_model)
        if self._traj_explainer is None:
            logger.info("Initializing SHAP explainer for trajectory model")
            self._traj_explainer = shap.TreeExplainer(self.trajectory_model)

    def _build_features(self, record: Dict[str, Any]):
        feat_df = build_feature_matrix([record])
        feature_cols = [
            c for c in feat_df.columns if c not in ("sound_id", "snapshot_at", "is_viral", "future_velocity_score")
        ]
        X = feat_df[feature_cols].to_numpy(dtype=float)
        X_scaled, _ = transform_with_scaler(X, name="inference_features", fit_if_missing=True)
        return X_scaled, feature_cols

    def predict(self, record: Dict[str, Any], explain: bool = False):
        X, feature_cols = self._build_features(record)

        viral_prob = float(self.viral_model.predict_proba(X)[0, 1])
        trajectory_pred = float(self.trajectory_model.predict(X)[0])

        # Trend archetype: use only pre-defined audio columns subset
        audio_idx = [feature_cols.index(c) for c in feature_cols if c in self.trend_audio_cols]
        if audio_idx:
            X_audio = X[:, audio_idx]
            archetype = int(self.trend_gmm.predict(X_audio)[0])
        else:
            archetype = -1

        result = {
            "viral_probability": viral_prob,
            "trajectory_future_velocity": trajectory_pred,
            "trend_archetype": archetype,
        }

        if explain:
            self._ensure_explainers(X_background=X)
            viral_shap = self._viral_explainer.shap_values(X)[0]
            traj_shap = self._traj_explainer.shap_values(X)[0]

            # Pair with feature names
            viral_expl = sorted(
                [{"feature": f, "shap_value": float(v)} for f, v in zip(feature_cols, viral_shap)],
                key=lambda d: abs(d["shap_value"]),
                reverse=True,
            )[:20]

            traj_expl = sorted(
                [{"feature": f, "shap_value": float(v)} for f, v in zip(feature_cols, traj_shap)],
                key=lambda d: abs(d["shap_value"]),
                reverse=True,
            )[:20]

            result["shap"] = {
                "viral": viral_expl,
                "trajectory": traj_expl,
            }

        return result
