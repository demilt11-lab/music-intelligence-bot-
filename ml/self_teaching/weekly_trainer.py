"""
Weekly retraining loop with automated quality gating and rollback.

Trigger:
  - Weekly cron (scheduled)
  - Or when feedback_loop reports >= 100 new labeled cases

Flow:
  1. Load historical snapshots + labeled outcomes from DB (or CSV fallback)
  2. Feature engineering
  3. Optional hyperparameter search
  4. Train new model
  5. Evaluate on holdout
  6. Compare with current active model
  7. If new AUROC < prev AUROC - 0.05: rollback, alert
  8. Otherwise: promote, set old as baseline
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config / result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RetrainingConfig:
    rollback_threshold: float = 0.05
    min_training_samples: int = 500
    run_hyperparameter_search: bool = False
    n_hp_trials: int = 20
    model_type: str = "xgboost"          # "xgboost" | "ensemble"
    experiment_name: str = "self_teaching_weekly"
    store_dir: str = "ml/outputs/model_store"
    data_dir: str = "ml/outputs/training_data"
    evaluation_metric: str = "auroc"


@dataclass
class RetrainingResult:
    success: bool
    new_version: Optional[str]
    prev_version: Optional[str]
    new_metrics: dict
    prev_metrics: dict
    accuracy_delta: float
    action: str          # "promoted" | "rolled_back" | "skipped_no_data" | "failed"
    reason: str
    new_labeled_cases: int
    duration_s: float


# ---------------------------------------------------------------------------
# Synthetic data generator (fallback)
# ---------------------------------------------------------------------------

class ViralDataSynthesizer:
    """Generates synthetic training data when no parquet file is present."""

    def generate(self, n: int = 5000, seed: int = 42) -> pd.DataFrame:
        rng = np.random.default_rng(seed)
        df = pd.DataFrame({
            "momentum":          rng.uniform(0, 1, n),
            "breakout_prob":     rng.uniform(0, 1, n),
            "virality_score":    rng.uniform(0, 1, n),
            "peak_score_estimate": rng.uniform(0, 1, n),
            "confidence":        rng.uniform(0.3, 1, n),
            "stream_velocity":   rng.uniform(0, 1, n),
            "tiktok_growth":     rng.uniform(0, 1, n),
            "save_rate":         rng.uniform(0, 1, n),
            "follower_velocity": rng.uniform(0, 1, n),
            "chart_momentum":    rng.uniform(0, 1, n),
            "playlist_add":      rng.uniform(0, 1, n),
            "radio_spike":       rng.uniform(0, 1, n),
            "organic_score":     rng.uniform(0, 1, n),
        })
        # Label: virality_score > 0.7 with some noise
        df["is_viral"] = ((df["virality_score"] > 0.7) | (rng.random(n) < 0.05)).astype(int)
        return df


# ---------------------------------------------------------------------------
# DataLoader
# ---------------------------------------------------------------------------

class DataLoader:
    """Loads training data from parquet or falls back to synthetic samples."""

    def load_training_data(self, data_dir: str, since_days: int = 365) -> pd.DataFrame:
        parquet_path = Path(data_dir) / "snapshots.parquet"
        if parquet_path.exists():
            log.info("Loading training data from %s", parquet_path)
            df = pd.read_parquet(parquet_path)
            # Filter to labeled rows
            if "is_viral" in df.columns:
                df = df[df["is_viral"].notna()].copy()
            # Filter to recent window
            if "computed_at" in df.columns:
                cutoff = pd.Timestamp.utcnow() - pd.Timedelta(days=since_days)
                df["computed_at"] = pd.to_datetime(df["computed_at"], utc=True, errors="coerce")
                df = df[df["computed_at"] >= cutoff]
            log.info("Loaded %d labeled rows from parquet", len(df))
            return df
        else:
            log.warning("No snapshots.parquet found in %s — generating synthetic data", data_dir)
            return ViralDataSynthesizer().generate(5000)


# ---------------------------------------------------------------------------
# WeeklyTrainer
# ---------------------------------------------------------------------------

class WeeklyTrainer:
    """Orchestrates the full weekly retraining loop."""

    # Feature columns used for model training
    FEATURE_COLS = [
        "momentum", "breakout_prob", "virality_score", "peak_score_estimate",
        "confidence", "stream_velocity", "tiktok_growth", "save_rate",
        "follower_velocity", "chart_momentum", "playlist_add", "radio_spike",
        "organic_score", "score_product", "confidence_weighted_score",
        "breakout_momentum_ratio", "skip_rate_inv",
    ]
    TARGET_COL = "is_viral"

    def __init__(self, cfg: RetrainingConfig) -> None:
        self.cfg = cfg
        from ml.self_teaching.model_store import ModelStore
        self._store = ModelStore(store_dir=cfg.store_dir)

    def run(self, new_labeled_cases: int = 0) -> RetrainingResult:
        import time
        t0 = time.perf_counter()

        # 1. Load data
        loader = DataLoader()
        df = loader.load_training_data(self.cfg.data_dir)

        if len(df) < self.cfg.min_training_samples:
            return RetrainingResult(
                success=False,
                new_version=None,
                prev_version=None,
                new_metrics={},
                prev_metrics={},
                accuracy_delta=0.0,
                action="skipped_no_data",
                reason=f"Only {len(df)} samples; need {self.cfg.min_training_samples}",
                new_labeled_cases=new_labeled_cases,
                duration_s=time.perf_counter() - t0,
            )

        # 2. Feature engineering
        try:
            from ml.pipeline.data_prep import FeatureEngineer
            fe = FeatureEngineer()
            df = fe.fit_transform(df)
        except Exception as exc:
            log.warning("FeatureEngineer unavailable (%s) — skipping derived features", exc)

        # 3. Train/val split (80/20 stratified)
        from sklearn.model_selection import train_test_split
        feature_cols = [c for c in self.FEATURE_COLS if c in df.columns]
        X = df[feature_cols].fillna(0).values
        y = df[self.TARGET_COL].astype(int).values

        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )

        # 4. Load current active model metrics
        from ml.self_teaching.model_store import NoActiveModelError
        prev_version = None
        prev_metrics: dict = {}
        try:
            _, prev_meta = self._store.load_active()
            prev_version = prev_meta.version
            prev_metrics = prev_meta.metrics
        except NoActiveModelError:
            log.info("No active model found — first training run.")

        # 5. Optional hyperparameter search
        hyperparams: dict = {}
        if self.cfg.run_hyperparameter_search:
            try:
                from ml.training.hyperparameter_tuning import HyperparameterTuner
                tuner = HyperparameterTuner(
                    model_type="xgboost",
                    n_trials=self.cfg.n_hp_trials,
                    metric="val_auroc",
                )
                result = tuner.tune(
                    train_data=(X_train, y_train),
                    val_data=(X_val, y_val),
                )
                hyperparams = result.best_params
                log.info("HP search best params: %s", hyperparams)
            except Exception as exc:
                log.warning("HP search failed (%s), using defaults", exc)

        # 6. Train
        new_version = self._generate_version()
        try:
            model, new_metrics = self._train_xgboost(X_train, y_train, X_val, y_val, hyperparams)
        except Exception as exc:
            log.exception("Training failed")
            return RetrainingResult(
                success=False,
                new_version=None,
                prev_version=prev_version,
                new_metrics={},
                prev_metrics=prev_metrics,
                accuracy_delta=0.0,
                action="failed",
                reason=str(exc),
                new_labeled_cases=new_labeled_cases,
                duration_s=time.perf_counter() - t0,
            )

        # 7. Compare
        new_auroc = new_metrics.get("auroc", 0.0)
        prev_auroc = prev_metrics.get("auroc", 0.0)
        delta = new_auroc - prev_auroc

        # 8. Quality gate
        if prev_version and delta < -self.cfg.rollback_threshold:
            log.warning(
                "New model AUROC %.4f dropped %.3f below previous %.4f — rolling back",
                new_auroc, delta, prev_auroc,
            )
            try:
                self._store.rollback()
            except Exception:
                pass
            return RetrainingResult(
                success=False,
                new_version=new_version,
                prev_version=prev_version,
                new_metrics=new_metrics,
                prev_metrics=prev_metrics,
                accuracy_delta=delta,
                action="rolled_back",
                reason=f"AUROC dropped {delta:.3f}",
                new_labeled_cases=new_labeled_cases,
                duration_s=time.perf_counter() - t0,
            )

        # 9. Promote new model
        import time as _time
        from ml.self_teaching.model_store import ModelVersionMeta
        duration = _time.perf_counter() - t0
        meta = ModelVersionMeta(
            version=new_version,
            model_type=self.cfg.model_type,
            artifact_path="",
            metrics=new_metrics,
            hyperparams=hyperparams,
            dataset_version=str(len(df)),
            trained_at=datetime.utcnow().isoformat(),
            is_active=True,
            is_baseline=False,
            train_samples=len(X_train),
            train_duration_s=duration,
        )
        self._store.save(model, meta)

        # Set old model as baseline
        if prev_version:
            try:
                self._store.set_baseline(prev_version)
            except Exception:
                pass

        # 10. MLflow (non-fatal)
        self._log_mlflow(new_version, new_metrics, hyperparams)

        return RetrainingResult(
            success=True,
            new_version=new_version,
            prev_version=prev_version,
            new_metrics=new_metrics,
            prev_metrics=prev_metrics,
            accuracy_delta=delta,
            action="promoted",
            reason=f"AUROC improved by {delta:.3f}" if delta >= 0 else f"AUROC change {delta:.3f} within threshold",
            new_labeled_cases=new_labeled_cases,
            duration_s=duration,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _generate_version(self) -> str:
        return f"v{datetime.now():%Y%m%d_%H%M%S}"

    def _train_xgboost(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        hyperparams: dict,
    ):
        from ml.models.xgboost_model import ViralXGBoost, XGBoostConfig

        cfg_kwargs = {k: v for k, v in hyperparams.items() if hasattr(XGBoostConfig, k)}
        xgb_cfg = XGBoostConfig(**cfg_kwargs)
        model = ViralXGBoost(xgb_cfg)

        train_df = pd.DataFrame(X_train)
        train_df["is_viral"] = y_train
        val_df = pd.DataFrame(X_val)
        val_df["is_viral"] = y_val

        model.fit(train_df, val_df)
        metrics = self._compute_metrics(model, X_val, y_val)
        return model, metrics

    def _compute_metrics(self, model, X: np.ndarray, y: np.ndarray) -> dict:
        from sklearn.metrics import (
            roc_auc_score, f1_score, precision_score, recall_score, accuracy_score
        )
        try:
            proba = model.clf_viral.predict_proba(X)[:, 1]
        except Exception:
            proba = np.full(len(y), 0.5)

        preds = (proba >= 0.5).astype(int)
        try:
            auroc = float(roc_auc_score(y, proba))
        except Exception:
            auroc = 0.5

        return {
            "auroc":     auroc,
            "f1":        float(f1_score(y, preds, zero_division=0)),
            "precision": float(precision_score(y, preds, zero_division=0)),
            "recall":    float(recall_score(y, preds, zero_division=0)),
            "accuracy":  float(accuracy_score(y, preds)),
        }

    def _log_mlflow(self, version: str, metrics: dict, hyperparams: dict) -> None:
        try:
            import mlflow
            with mlflow.start_run(run_name=version, experiment_id=None):
                mlflow.log_metrics(metrics)
                mlflow.log_params(hyperparams)
        except Exception as exc:
            log.debug("MLflow logging skipped: %s", exc)
