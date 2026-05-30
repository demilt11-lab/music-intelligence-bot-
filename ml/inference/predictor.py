# ml/inference/predictor.py
"""
Inference engine. Loads all trained models and serves:
- Viral probability score (0-1)
- Trajectory state (rising/peaking/declining/resurging/stable)
- Regional trend predictions per trigger market
- Audio archetype classification
- Pre-viral flag (early detection signal)
"""

import os
import sys
import json
import logging
import numpy as np
import joblib
from typing import Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../training"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = os.environ.get("MODEL_DIR", "output/models")

TRIGGER_REGIONS = ["US", "BR", "PH", "NG", "GB", "MX", "ID"]

LABEL_MAP_INVERSE = {
    0: "low_signal",
    1: "stable",
    2: "rising",
    3: "peaking",
    4: "declining",
    5: "resurging",
}


class ViralPredictor:
    def __init__(self):
        self.stack = None
        self.feature_names: List[str] = []
        self.scaler = None
        self.kmeans = None
        self.region_models: Dict = {}
        self.trajectory_model = None
        self._loaded = False

    def load(self):
        if self._loaded:
            return

        def _try_load(path):
            return joblib.load(path) if os.path.exists(path) else None

        self.stack = _try_load(f"{MODEL_DIR}/viral_predictor_stack.pkl")
        self.feature_names = _try_load(f"{MODEL_DIR}/feature_names.pkl") or []
        self.scaler = _try_load(f"{MODEL_DIR}/scaler.pkl")
        self.kmeans = _try_load(f"{MODEL_DIR}/audio_archetype_kmeans.pkl")
        self.region_models = _try_load(f"{MODEL_DIR}/regional_trend_models.pkl") or {}
        self.trajectory_model = _try_load(f"{MODEL_DIR}/trajectory_model.pkl")

        self._loaded = True
        logger.info(f"Models loaded. Stack={'yes' if self.stack else 'no'} | "
                    f"Regions={list(self.region_models.keys())} | "
                    f"Trajectory={'yes' if self.trajectory_model else 'no'}")

    def _to_vector(self, features: Dict) -> np.ndarray:
        from feature_engineering import engineer_features
        engineered = engineer_features(features)
        vec = [float(engineered.get(f, 0.0)) for f in self.feature_names] \
              if self.feature_names else list(engineered.values())
        X = np.array(vec, dtype=np.float32).reshape(1, -1)
        if self.scaler:
            X = self.scaler.transform(X)
        return X

    def _audio_vector(self, features: Dict) -> np.ndarray:
        from feature_engineering import encode_bpm, encode_key
        bpm = encode_bpm(features.get("bpm"))
        key = encode_key(features.get("musical_key"), features.get("mode"))
        vec = [
            bpm.get("bpm_raw", 0.0),
            key.get("key_pitch_class", 0.0),
            key.get("key_mode", 0.0),
            float(features.get("energy") or 0.0),
            float(features.get("danceability") or 0.0),
            float(features.get("valence") or 0.0),
            float(features.get("loudness") or 0.0),
            float(features.get("duration_ms") or 0.0) / 1000.0,
        ]
        return np.array(vec, dtype=np.float32).reshape(1, -1)

    def predict_viral(self, features: Dict) -> Dict:
        self.load()
        if not self.stack:
            return {
                "viral_probability": None,
                "viral_label": None,
                "pre_viral_flag": False,
                "error": "Viral predictor model not loaded. Run train_viral_predictor.py first.",
            }

        X = self._to_vector(features)

        xgb_prob = float(np.mean([
            m.predict_proba(X)[0, 1] for m in self.stack["xgb_models"]
        ]))
        lgbm_prob = float(np.mean([
            m.predict_proba(X)[0, 1] for m in self.stack["lgbm_models"]
        ]))
        mlp_prob = float(np.mean([
            m.predict_proba(X)[0, 1] for m in self.stack["mlp_models"]
        ]))

        meta_X = np.array([[xgb_prob, lgbm_prob, mlp_prob]])
        final_prob = float(self.stack["meta_learner"].predict_proba(meta_X)[0, 1])

        label = "viral" if final_prob >= 0.6 else "not_viral"
        pre_viral = (
            final_prob >= 0.4
            and float(features.get("tiktok_growth_rate_7d") or 0) > 0.1
            and float(features.get("playlist_adds_7d") or 0) >= 1
        )

        return {
            "viral_probability": round(final_prob, 4),
            "viral_label": label,
            "pre_viral_flag": pre_viral,
            "model_breakdown": {
                "xgb": round(xgb_prob, 4),
                "lgbm": round(lgbm_prob, 4),
                "mlp": round(mlp_prob, 4),
            },
        }

    def predict_trajectory(self, features: Dict) -> Dict:
        self.load()
        if not self.trajectory_model:
            from feature_engineering import engineer_features
            from features.trajectory import aggregateTrajectory_py
            return {"state": "unknown", "error": "Trajectory model not trained yet"}

        X = self._to_vector(features)
        label_idx = int(self.trajectory_model.predict(X)[0])
        probs = self.trajectory_model.predict_proba(X)[0]
        confidence = float(probs[label_idx])
        state = LABEL_MAP_INVERSE.get(label_idx, "unknown")

        return {
            "state": state,
            "confidence": round(confidence, 4),
            "all_probs": {
                LABEL_MAP_INVERSE[i]: round(float(p), 4)
                for i, p in enumerate(probs)
            },
        }

    def predict_regional_trends(self, features: Dict) -> Dict:
        self.load()
        if not self.region_models:
            return {"regions": {}, "error": "Regional models not trained yet"}

        from feature_engineering import encode_language, encode_genre, encode_bpm, encode_key
        import numpy as np

        audio_vec = self._audio_vector(features).flatten().tolist()
        lang_feats = list(encode_language(features.get("language")).values())
        genre_feats = list(encode_genre(features.get("genre_primary")).values())

        if self.kmeans:
            archetype_idx = int(self.kmeans.predict(
                np.array(audio_vec, dtype=np.float32).reshape(1, -1)
            )[0])
            archetype_onehot = [
                1.0 if archetype_idx == c else 0.0
                for c in range(self.kmeans.n_clusters)
            ]
        else:
            archetype_onehot = [0.0] * 8

        X_region = np.array(
            audio_vec + lang_feats + genre_feats + archetype_onehot,
            dtype=np.float32
        ).reshape(1, -1)

        results = {}
        for region, model in self.region_models.items():
            prob = float(model.predict_proba(X_region)[0, 1])
            results[region] = {
                "trend_probability": round(prob, 4),
                "will_trend": prob >= 0.5,
            }

        top_region = max(results, key=lambda r: results[r]["trend_probability"]) \
            if results else None

        return {
            "regions": results,
            "top_predicted_region": top_region,
        }

    def predict_audio_archetype(self, features: Dict) -> Dict:
        self.load()
        if not self.kmeans:
            return {"archetype": None, "error": "Archetype model not trained yet"}

        audio_vec = self._audio_vector(features)
        archetype_idx = int(self.kmeans.predict(audio_vec)[0])
        center = self.kmeans.cluster_centers_[archetype_idx]

        return {
            "archetype_id": archetype_idx,
            "profile": {
                "bpm": round(float(center[0]), 1),
                "key_pitch_class": round(float(center[1]), 1),
                "mode": "major" if center[2] > 0.5 else "minor",
                "energy": round(float(center[3]), 2),
                "danceability": round(float(center[4]), 2),
                "valence": round(float(center[5]), 2),
            },
        }

    def predict_all(self, features: Dict) -> Dict:
        """
        Master prediction call: runs all models and returns a unified result.
        This is what your /api/v1/tracks/:id/trajectory and
        /api/v1/tracks/:id/features routes should call.
        """
        viral = self.predict_viral(features)
        trajectory = self.predict_trajectory(features)
        regional = self.predict_regional_trends(features)
        archetype = self.predict_audio_archetype(features)

        overall_score = round(
            (viral.get("viral_probability") or 0) * 0.5 +
            (1.0 if trajectory.get("state") in ("rising", "resurging") else 0.0) * 0.3 +
            (regional.get("regions", {}).get(
                regional.get("top_predicted_region", ""), {}
            ).get("trend_probability", 0)) * 0.2,
            4,
        )

        return {
            "overall_score": overall_score,
            "viral": viral,
            "trajectory": trajectory,
            "regional": regional,
            "archetype": archetype,
        }


_predictor_instance: Optional[ViralPredictor] = None


def get_predictor() -> ViralPredictor:
    global _predictor_instance
    if _predictor_instance is None:
        _predictor_instance = ViralPredictor()
        _predictor_instance.load()
    return _predictor_instance
