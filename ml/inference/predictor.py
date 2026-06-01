"""
Inference Predictor

Loads trained models and returns scored predictions with optional SHAP explanations.

Models served:
  - viral_predictor_{7d,14d,30d}   — XGBoost binary classifiers
  - popularity_predictor_{7d,30d,90d} — XGBoost binary classifiers
  - trend_classifier                — XGBoost multi-class (NONE/TRENDING/POPULAR/VIRAL)
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np

from ml.config import MODEL_DIR, configure_logging
from ml.features.feature_engineering import (
    build_viral_features,
    build_popularity_features,
    build_combined_features,
)

logger = configure_logging(__name__)

TREND_LABELS = ["NONE", "TRENDING", "POPULAR", "VIRAL"]


# ── model loaders (lazy, cached) ──────────────────────────────────────────────

def _load_xgb(path: Path):
    from xgboost import XGBClassifier
    m = XGBClassifier()
    m.load_model(str(path))
    return m


def _load_calibrated(path: Path):
    return joblib.load(str(path))


@lru_cache(maxsize=None)
def _get_viral_models() -> Dict[str, Any]:
    models = {}
    for horizon in ("7d", "14d", "30d"):
        cal_path = MODEL_DIR / f"viral_predictor_{horizon}_calibrated.joblib"
        raw_path = MODEL_DIR / f"viral_predictor_{horizon}_xgb.json"
        if cal_path.exists():
            models[horizon] = _load_calibrated(cal_path)
            logger.info("Loaded calibrated viral model (%s)", horizon)
        elif raw_path.exists():
            models[horizon] = _load_xgb(raw_path)
            logger.info("Loaded raw viral model (%s)", horizon)
        else:
            logger.warning("Viral model not found for horizon %s", horizon)
    return models


@lru_cache(maxsize=None)
def _get_popularity_models() -> Dict[str, Any]:
    models = {}
    for horizon in ("7d", "30d", "90d"):
        cal_path = MODEL_DIR / f"popularity_predictor_{horizon}_calibrated.joblib"
        raw_path = MODEL_DIR / f"popularity_predictor_{horizon}_xgb.json"
        if cal_path.exists():
            models[horizon] = _load_calibrated(cal_path)
        elif raw_path.exists():
            models[horizon] = _load_xgb(raw_path)
        else:
            logger.warning("Popularity model not found for horizon %s", horizon)
    return models


@lru_cache(maxsize=None)
def _get_trend_classifier() -> Optional[Tuple[Any, Any]]:
    """Returns (model, label_encoder) or None if not trained yet."""
    model_path   = MODEL_DIR / "trend_classifier_xgb.json"
    encoder_path = MODEL_DIR / "trend_classifier_label_encoder.joblib"
    if not model_path.exists():
        logger.warning("Trend classifier not found at %s", model_path)
        return None
    model = _load_xgb(model_path)
    if encoder_path.exists():
        le = joblib.load(str(encoder_path))
    else:
        le = None
    return model, le


# ── core predictor ────────────────────────────────────────────────────────────

class Predictor:
    def predict(
        self,
        record: Dict[str, Any],
        explain: bool = False,
    ) -> Dict[str, Any]:
        """
        Score a single track record.

        record: dict matching TrackFeatureRow schema.
        explain: if True, include SHAP feature attributions for the viral model.

        Returns a dict with keys:
          viral_probabilities   — {7d, 14d, 30d}
          popularity_probabilities — {7d, 30d, 90d}
          trend_prediction      — {label, probabilities: {NONE, TRENDING, POPULAR, VIRAL}}
          shap (optional)       — top feature drivers for viral 30d
        """
        records = [record]

        # ── Viral ─────────────────────────────────────────────────────────
        X_viral, viral_feat_names = build_viral_features(records)
        viral_probs: Dict[str, Optional[float]] = {}
        viral_models = _get_viral_models()
        for horizon, model in viral_models.items():
            try:
                viral_probs[horizon] = float(model.predict_proba(X_viral)[0, 1])
            except Exception as e:
                logger.warning("Viral %s prediction failed: %s", horizon, e)
                viral_probs[horizon] = None

        # ── Popularity ────────────────────────────────────────────────────
        X_pop, pop_feat_names = build_popularity_features(records)
        pop_probs: Dict[str, Optional[float]] = {}
        pop_models = _get_popularity_models()
        for horizon, model in pop_models.items():
            try:
                pop_probs[horizon] = float(model.predict_proba(X_pop)[0, 1])
            except Exception as e:
                logger.warning("Popularity %s prediction failed: %s", horizon, e)
                pop_probs[horizon] = None

        # ── Multi-class trend ─────────────────────────────────────────────
        trend_result: Dict[str, Any] = {}
        clf_bundle = _get_trend_classifier()
        if clf_bundle is not None:
            clf, le = clf_bundle
            try:
                X_comb, _ = build_combined_features(records)
                proba = clf.predict_proba(X_comb)[0]
                pred_idx = int(np.argmax(proba))
                labels = le.classes_.tolist() if le is not None else TREND_LABELS
                trend_result = {
                    "label": labels[pred_idx],
                    "probabilities": {
                        label: round(float(p), 4)
                        for label, p in zip(labels, proba)
                    },
                }
            except Exception as e:
                logger.warning("Trend classifier failed: %s", e)

        # Derive a single consensus label when trend classifier is unavailable
        if not trend_result:
            trend_result = _derive_trend_label(viral_probs, pop_probs)

        result: Dict[str, Any] = {
            "viral_probabilities": {k: _round(v) for k, v in viral_probs.items()},
            "popularity_probabilities": {k: _round(v) for k, v in pop_probs.items()},
            "trend_prediction": trend_result,
        }

        # ── SHAP explanations (viral 30d only, expensive) ─────────────────
        if explain and viral_models.get("30d") is not None:
            try:
                import shap
                raw_model = viral_models["30d"]
                # Get the underlying XGBClassifier from calibrated wrapper
                base = getattr(raw_model, "estimator", raw_model)
                explainer = shap.TreeExplainer(base)
                shap_vals = explainer.shap_values(X_viral)
                if isinstance(shap_vals, list):
                    shap_vals = shap_vals[1]
                top = sorted(
                    zip(viral_feat_names, shap_vals[0].tolist()),
                    key=lambda x: abs(x[1]),
                    reverse=True,
                )[:15]
                result["shap"] = {
                    "model": "viral_30d",
                    "features": [{"feature": f, "shap_value": round(v, 4)} for f, v in top],
                }
            except Exception as e:
                logger.warning("SHAP explanation failed: %s", e)

        return result

    def predict_batch(
        self,
        records: List[Dict[str, Any]],
        explain: bool = False,
    ) -> List[Dict[str, Any]]:
        return [self.predict(r, explain=explain) for r in records]


# ── helpers ───────────────────────────────────────────────────────────────────

def _round(v: Optional[float]) -> Optional[float]:
    return round(v, 4) if v is not None else None


def _derive_trend_label(
    viral_probs: Dict[str, Optional[float]],
    pop_probs: Dict[str, Optional[float]],
) -> Dict[str, Any]:
    """Fallback consensus label from individual model probabilities."""
    v30 = viral_probs.get("30d") or 0.0
    p30 = pop_probs.get("30d") or 0.0

    if v30 >= 0.6:
        label = "VIRAL"
    elif v30 >= 0.35 or p30 >= 0.5:
        label = "TRENDING" if v30 > p30 else "POPULAR"
    else:
        label = "NONE"

    return {
        "label": label,
        "probabilities": {
            "NONE":     round(max(0, 1.0 - v30 - p30), 4),
            "TRENDING": round(max(0, v30 * 0.5), 4),
            "POPULAR":  round(max(0, p30 * 0.6), 4),
            "VIRAL":    round(max(0, v30 * 0.5), 4),
        },
    }
