"""
Survival analysis for days-to-viral prediction.

Replaces the Huber regression approach which incorrectly treats right-censored
observations (artists that haven't broken out yet) as if they will never break out.

Two methods:
  1. Cox Proportional Hazards (lifelines) — interpretable hazard ratios
  2. XGBoost AFT (Accelerated Failure Time) — handles large datasets, no lifelines dep

Usage:
    model = SurvivalModel(method="aft_xgboost")
    model.fit(X_train, durations_train, events_train)
    predictions = model.predict_median_survival(X_test)
"""

import logging
from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


@dataclass
class SurvivalLabel:
    duration: float    # days observed (to breakout or to censoring)
    event: bool        # True = broke out, False = censored (still watching)


@dataclass
class SurvivalPrediction:
    median_days: np.ndarray           # predicted median time to breakout
    prob_breakout_30d: np.ndarray     # P(breakout within 30 days)
    prob_breakout_90d: np.ndarray     # P(breakout within 90 days)
    hazard_ratios: Optional[dict]     # Cox only — feature-level interpretability


class SurvivalModel:
    def __init__(
        self,
        method: Literal["cox", "aft_xgboost"] = "aft_xgboost",
        xgb_params: Optional[dict] = None,
    ):
        self.method = method
        self._model = None
        self._feature_names: list[str] = []
        self._xgb_params = xgb_params or {
            "objective": "survival:aft",
            "eval_metric": "aft-nloglik",
            "aft_loss_distribution": "logistic",
            "aft_loss_distribution_scale": 1.0,
            "learning_rate": 0.05,
            "max_depth": 6,
            "n_estimators": 300,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "early_stopping_rounds": 30,
        }

    def fit(
        self,
        X: np.ndarray,
        labels: list[SurvivalLabel],
        feature_names: list[str] = None,
    ) -> "SurvivalModel":
        """Fit the survival model on labelled data."""
        self._feature_names = feature_names or [f"f{i}" for i in range(X.shape[1])]
        durations = np.array([l.duration for l in labels], dtype=np.float64)
        events = np.array([int(l.event) for l in labels], dtype=np.int32)

        if self.method == "cox":
            try:
                from lifelines import CoxPHFitter
                df_cox = pd.DataFrame(X, columns=self._feature_names)
                df_cox["duration"] = durations
                df_cox["event"] = events
                self._model = CoxPHFitter()
                self._model.fit(df_cox, duration_col="duration", event_col="event")
                log.info("CoxPHFitter fitted; concordance=%.4f", self._model.concordance_index_)
                return self
            except ImportError:
                log.warning("lifelines not installed; falling back to aft_xgboost")
                self.method = "aft_xgboost"

        # AFT XGBoost
        import xgboost as xgb

        # Censored: y_lower = observed duration, y_upper = +inf
        # Uncensored (event): y_lower = y_upper = duration
        y_lower = durations.copy()
        y_upper = np.where(events == 1, durations, np.inf)

        dtrain = xgb.DMatrix(X)
        dtrain.set_float_info("label_lower_bound", y_lower)
        dtrain.set_float_info("label_upper_bound", y_upper)

        params = {k: v for k, v in self._xgb_params.items()
                  if k not in ("n_estimators", "early_stopping_rounds")}
        n_estimators = self._xgb_params.get("n_estimators", 300)
        early_stopping = self._xgb_params.get("early_stopping_rounds", 30)

        self._model = xgb.train(
            params,
            dtrain,
            num_boost_round=n_estimators,
            evals=[(dtrain, "train")],
            early_stopping_rounds=early_stopping,
            verbose_eval=False,
        )
        log.info("XGBoost AFT model fitted with %d rounds.", self._model.best_iteration or n_estimators)
        return self

    def predict(self, X: np.ndarray) -> SurvivalPrediction:
        """Predict survival outcomes for each sample."""
        if self._model is None:
            raise RuntimeError("Call fit() before predict()")

        if self.method == "cox":
            df_X = pd.DataFrame(X, columns=self._feature_names)
            median_days = self._model.predict_median(df_X).values
            sf_30 = self._model.predict_survival_function(df_X, times=[30])
            sf_90 = self._model.predict_survival_function(df_X, times=[90])
            # prob_breakout = 1 - survival_prob
            prob_30 = 1.0 - sf_30.iloc[0].values
            prob_90 = 1.0 - sf_90.iloc[0].values
            return SurvivalPrediction(
                median_days=median_days,
                prob_breakout_30d=prob_30,
                prob_breakout_90d=prob_90,
                hazard_ratios=self.get_hazard_ratios(),
            )

        # AFT XGBoost: predict log(T), convert to T = exp(pred)
        import xgboost as xgb
        dtest = xgb.DMatrix(X)
        log_t = self._model.predict(dtest)
        t_pred = np.exp(log_t)

        # Log-logistic CDF: P(T < t) = 1 / (1 + (t/exp(log_t))^{-1/scale})
        # Using scale=1.0 (logistic distribution): P(T < t) = sigmoid(log(t) - log_t)
        def logistic_cdf(t_threshold: float) -> np.ndarray:
            return 1.0 / (1.0 + np.exp(-(np.log(t_threshold) - log_t)))

        prob_30 = logistic_cdf(30.0)
        prob_90 = logistic_cdf(90.0)

        return SurvivalPrediction(
            median_days=t_pred,
            prob_breakout_30d=prob_30,
            prob_breakout_90d=prob_90,
            hazard_ratios=None,
        )

    def get_hazard_ratios(self) -> Optional[dict]:
        """Cox only: returns {feature: exp(coef)} sorted by magnitude."""
        if self.method != "cox" or self._model is None:
            return None
        try:
            summary = self._model.summary
            hr = np.exp(summary["coef"])
            return dict(sorted(zip(self._feature_names, hr.values), key=lambda x: abs(x[1] - 1), reverse=True))
        except Exception:
            return None

    def save(self, path: str) -> None:
        import cloudpickle
        with open(path, "wb") as f:
            cloudpickle.dump(self, f)

    @classmethod
    def load(cls, path: str) -> "SurvivalModel":
        import cloudpickle
        with open(path, "rb") as f:
            return cloudpickle.load(f)

    @classmethod
    def prepare_labels_from_df(
        cls,
        df: pd.DataFrame,
        days_col: str = "label_days",
        viral_col: str = "label_viral",
    ) -> list[SurvivalLabel]:
        """
        Convert a DataFrame to SurvivalLabel list.

        For viral=1: event=True, duration=days_col value.
        For viral=0: event=False, duration=max(days_col, 90) (right-censored at 90 days).
        """
        labels = []
        for _, row in df.iterrows():
            is_viral = bool(row[viral_col])
            days = float(row[days_col]) if not pd.isna(row[days_col]) else 90.0
            if is_viral:
                labels.append(SurvivalLabel(duration=days, event=True))
            else:
                labels.append(SurvivalLabel(duration=max(days, 90.0), event=False))
        return labels
