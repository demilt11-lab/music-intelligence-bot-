"""
Inference Predictor

Loads trained models and returns scored predictions with optional SHAP explanations.

Models served:
  - viral_predictor_{7d,14d,30d}   — XGBoost binary classifiers
  - popularity_predictor_{7d,30d,90d} — XGBoost binary classifiers
  - trend_classifier                — XGBoost multi-class (NONE/TRENDING/POPULAR/VIRAL)
"""

from __future__ import annotations

import threading
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


@lru_cache(maxsize=1)
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


@lru_cache(maxsize=1)
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


@lru_cache(maxsize=1)
def _get_trend_classifier() -> Optional[Tuple[Any, Any]]:
    """Returns (model, label_encoder) or None if not trained yet."""
    model_path   = MODEL_DIR / "trend_classifier_xgb.json"
    encoder_path = MODEL_DIR / "trend_classifier_label_encoder.joblib"
    if not model_path.exists():
        logger.warning("Trend classifier not found at %s", model_path)
        return None
    model = _load_xgb(model_path)
    le = joblib.load(str(encoder_path)) if encoder_path.exists() else None
    return model, le


# SHAP explainer is expensive to construct — cache it once per process.
_shap_explainer_lock = threading.Lock()
_shap_explainer_cache: Optional[Any] = None


def _get_shap_explainer(model: Any) -> Optional[Any]:
    global _shap_explainer_cache
    if _shap_explainer_cache is not None:
        return _shap_explainer_cache
    with _shap_explainer_lock:
        if _shap_explainer_cache is None:
            try:
                import shap
                base = getattr(model, "estimator", model)
                _shap_explainer_cache = shap.TreeExplainer(base)
            except Exception as e:
                logger.warning("SHAP explainer init failed: %s", e)
                return None
    return _shap_explainer_cache


# ── core predictor ────────────────────────────────────────────────────────────

class Predictor:
    def predict(
        self,
        record: Dict[str, Any],
        explain: bool = False,
    ) -> Dict[str, Any]:
        """Score a single track. Delegates to predict_batch for consistency."""
        return self.predict_batch([record], explain=explain)[0]

    def predict_batch(
        self,
        records: List[Dict[str, Any]],
        explain: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Vectorized batch scoring — builds each feature matrix once across
        all records, then calls predict_proba once per model.
        """
        if not records:
            return []

        # Build all three feature matrices in one pass each
        X_viral,   viral_feat_names = build_viral_features(records)
        X_pop,     _                = build_popularity_features(records)
        X_comb,    _                = build_combined_features(records)

        viral_models = _get_viral_models()
        pop_models   = _get_popularity_models()
        clf_bundle   = _get_trend_classifier()

        # Batch predict_proba for every model — one call per model, not one per record
        viral_proba:  Dict[str, Optional[np.ndarray]] = {}
        for h, m in viral_models.items():
            try:
                viral_proba[h] = m.predict_proba(X_viral)[:, 1]
            except Exception as e:
                logger.warning("Viral %s batch prediction failed: %s", h, e)
                viral_proba[h] = None

        pop_proba: Dict[str, Optional[np.ndarray]] = {}
        for h, m in pop_models.items():
            try:
                pop_proba[h] = m.predict_proba(X_pop)[:, 1]
            except Exception as e:
                logger.warning("Popularity %s batch prediction failed: %s", h, e)
                pop_proba[h] = None

        trend_proba_matrix: Optional[np.ndarray] = None
        trend_labels_list: List[str] = TREND_LABELS
        if clf_bundle is not None:
            clf, le = clf_bundle
            try:
                trend_proba_matrix = clf.predict_proba(X_comb)
                if le is not None:
                    trend_labels_list = le.classes_.tolist()
            except Exception as e:
                logger.warning("Trend classifier batch failed: %s", e)

        # SHAP — computed once for the full batch, not per record
        shap_matrix: Optional[np.ndarray] = None
        if explain and viral_models.get("30d") is not None:
            explainer = _get_shap_explainer(viral_models["30d"])
            if explainer is not None:
                try:
                    shap_vals = explainer.shap_values(X_viral)
                    shap_matrix = shap_vals[1] if isinstance(shap_vals, list) else shap_vals
                except Exception as e:
                    logger.warning("SHAP batch explanation failed: %s", e)

        # Assemble per-record results
        results = []
        for i in range(len(records)):
            vp = {h: _round(float(arr[i])) if arr is not None else None
                  for h, arr in viral_proba.items()}
            pp = {h: _round(float(arr[i])) if arr is not None else None
                  for h, arr in pop_proba.items()}

            if trend_proba_matrix is not None:
                proba_row = trend_proba_matrix[i]
                pred_idx  = int(np.argmax(proba_row))
                trend_result: Dict[str, Any] = {
                    "label": trend_labels_list[pred_idx],
                    "probabilities": {
                        lbl: round(float(p), 4)
                        for lbl, p in zip(trend_labels_list, proba_row)
                    },
                }
            else:
                trend_result = _derive_trend_label(vp, pp)

            rec: Dict[str, Any] = {
                "viral_probabilities":       vp,
                "popularity_probabilities":  pp,
                "trend_prediction":          trend_result,
            }

            if shap_matrix is not None:
                top = sorted(
                    zip(viral_feat_names, shap_matrix[i].tolist()),
                    key=lambda x: abs(x[1]),
                    reverse=True,
                )[:15]
                rec["shap"] = {
                    "model": "viral_30d",
                    "features": [{"feature": f, "shap_value": round(v, 4)} for f, v in top],
                }

            results.append(rec)

        return results


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
