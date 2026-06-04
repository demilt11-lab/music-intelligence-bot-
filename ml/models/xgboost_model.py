"""XGBoost ensemble model with feature importance and SHAP support."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd


@dataclass
class XGBoostConfig:
    # Core XGBoost params
    n_estimators: int = 500
    max_depth: int = 6
    learning_rate: float = 0.05
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    min_child_weight: int = 5
    reg_alpha: float = 0.1
    reg_lambda: float = 1.0
    gamma: float = 0.0
    scale_pos_weight: float = 10.0   # handles class imbalance
    n_jobs: int = -1
    random_state: int = 42
    early_stopping_rounds: int = 50
    eval_metric: str = "auc"
    # metadata
    feature_names: Optional[List[str]] = None
    task: str = "viral_classification"


@dataclass
class XGBPrediction:
    viral_prob: np.ndarray         # (N,) float
    is_viral: np.ndarray           # (N,) bool
    days_to_viral: np.ndarray      # (N,) float
    peak_score: np.ndarray         # (N,) float
    feature_importance: Optional[pd.DataFrame] = None


class ViralXGBoost:
    """Three XGBoost models covering all viral prediction tasks."""

    def __init__(self, cfg: XGBoostConfig) -> None:
        self.cfg = cfg
        try:
            from xgboost import XGBClassifier, XGBRegressor
        except ImportError as e:
            raise ImportError("xgboost required: pip install xgboost") from e

        shared = dict(
            n_estimators=cfg.n_estimators,
            max_depth=cfg.max_depth,
            learning_rate=cfg.learning_rate,
            subsample=cfg.subsample,
            colsample_bytree=cfg.colsample_bytree,
            min_child_weight=cfg.min_child_weight,
            reg_alpha=cfg.reg_alpha,
            reg_lambda=cfg.reg_lambda,
            gamma=cfg.gamma,
            n_jobs=cfg.n_jobs,
            random_state=cfg.random_state,
        )

        self.clf_viral = XGBClassifier(
            **shared,
            scale_pos_weight=cfg.scale_pos_weight,
            eval_metric="auc",
            use_label_encoder=False,
        )
        self.reg_days = XGBRegressor(**shared, eval_metric="mae")
        self.reg_peak = XGBRegressor(**shared, eval_metric="rmse")

    def fit(
        self,
        X_train: np.ndarray,
        y_viral: np.ndarray,
        y_days: np.ndarray,
        y_peak: np.ndarray,
        eval_set: Optional[Tuple[np.ndarray, np.ndarray]] = None,
    ) -> "ViralXGBoost":
        """Train all three models with optional early stopping."""
        es = self.cfg.early_stopping_rounds

        if eval_set is not None:
            X_val, y_val_viral = eval_set
            # We only have viral labels for the val set here; regression eval omitted
            self.clf_viral.fit(
                X_train, y_viral,
                eval_set=[(X_val, y_val_viral)],
                early_stopping_rounds=es,
                verbose=False,
            )
        else:
            self.clf_viral.fit(X_train, y_viral, verbose=False)

        # Regression on viral samples only for days prediction
        viral_mask = y_viral == 1
        if viral_mask.sum() > 0:
            self.reg_days.fit(X_train[viral_mask], y_days[viral_mask], verbose=False)
        else:
            self.reg_days.fit(X_train, y_days, verbose=False)

        self.reg_peak.fit(X_train, y_peak, verbose=False)
        return self

    def predict(self, X: np.ndarray) -> XGBPrediction:
        """Run all three models and return combined predictions."""
        viral_prob = self.clf_viral.predict_proba(X)[:, 1]
        is_viral = viral_prob >= 0.5
        days = self.reg_days.predict(X)
        peak = self.reg_peak.predict(X)
        return XGBPrediction(
            viral_prob=viral_prob,
            is_viral=is_viral,
            days_to_viral=days,
            peak_score=peak,
        )

    def get_feature_importance(self, importance_type: str = "gain") -> pd.DataFrame:
        """Average importance across all three models, sorted descending."""
        names = self.cfg.feature_names

        def _get(model: Any) -> dict:
            scores = model.get_booster().get_score(importance_type=importance_type)
            return scores  # {feature_name: score}

        scores_viral = _get(self.clf_viral)
        scores_days = _get(self.reg_days)
        scores_peak = _get(self.reg_peak)

        # union of all feature keys
        all_keys = sorted(set(scores_viral) | set(scores_days) | set(scores_peak))

        if names:
            # use provided names; map XGBoost's f0, f1, ... to names if needed
            feat_keys = [f"f{i}" for i in range(len(names))]
            def _arr(scores: dict) -> np.ndarray:
                return np.array([scores.get(fk, 0.0) for fk in feat_keys])
            avg = (_arr(scores_viral) + _arr(scores_days) + _arr(scores_peak)) / 3.0
            feat_names_out = names
        else:
            def _arr_keys(scores: dict) -> np.ndarray:
                return np.array([scores.get(k, 0.0) for k in all_keys])
            avg = (_arr_keys(scores_viral) + _arr_keys(scores_days) + _arr_keys(scores_peak)) / 3.0
            feat_names_out = all_keys

        total = avg.sum()
        avg = avg / total if total > 0 else avg
        df = pd.DataFrame({"feature": feat_names_out, "importance": avg})
        return df.sort_values("importance", ascending=False).reset_index(drop=True)

    def save(self, path: str) -> None:
        """Serialize all models via cloudpickle."""
        import cloudpickle
        from pathlib import Path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            cloudpickle.dump(self, f)

    @classmethod
    def load(cls, path: str) -> "ViralXGBoost":
        """Deserialize from cloudpickle file."""
        import cloudpickle
        with open(path, "rb") as f:
            return cloudpickle.load(f)
