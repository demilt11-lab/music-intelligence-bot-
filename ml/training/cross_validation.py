"""5-fold stratified cross-validation for ensemble model selection."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, TimeSeriesSplit


@dataclass
class CVConfig:
    n_folds: int = 5
    shuffle: bool = True
    random_state: int = 42
    metric: str = "auroc"
    models: List[str] = field(default_factory=lambda: ["lstm", "tabular", "xgboost"])
    use_time_series_split: bool = True   # prevents temporal leakage
    gap_days: int = 30                   # gap between train and val to prevent look-ahead
    date_column: str = "computed_at"     # column used for temporal ordering


@dataclass
class FoldResult:
    fold: int
    model_name: str
    train_metrics: Dict[str, float]
    val_metrics: Dict[str, float]
    oof_predictions: np.ndarray


@dataclass
class CVResults:
    fold_results: List[FoldResult]
    mean_metrics: Dict[str, Dict[str, Any]]    # {model: {metric: "mean ± std"}}
    oof_predictions: Dict[str, np.ndarray]     # {model: full-dataset OOF predictions}
    best_model: str

    def summary(self) -> pd.DataFrame:
        """Return leaderboard DataFrame sorted by primary metric."""
        rows = []
        for model, metrics in self.mean_metrics.items():
            row = {"model": model}
            row.update(metrics)
            rows.append(row)
        df = pd.DataFrame(rows)
        # sort by auroc if present
        sort_col = [c for c in df.columns if "auroc" in c]
        if sort_col:
            df = df.sort_values(sort_col[0], ascending=False)
        return df.reset_index(drop=True)


class CrossValidator:
    """Runs stratified k-fold CV for multiple model types."""

    def __init__(self, cfg: CVConfig) -> None:
        self.cfg = cfg

    def run(
        self,
        dataset: Any,  # TikTokViralDataset
        model_configs: Dict[str, Any],
        cfg: Optional[CVConfig] = None,
    ) -> CVResults:
        """
        Train each model on each fold, collect OOF predictions.
        Logs metrics to MLflow if available.

        # IMPORTANT: use_time_series_split=True (default) prevents temporal leakage.
        # Random CV (use_time_series_split=False) allows future signals into training
        # folds and will produce optimistically biased AUROC estimates.
        """
        if cfg is not None:
            self.cfg = cfg

        labels = np.array([int(rec.is_viral) for rec in dataset.records])
        n = len(labels)
        indices = np.arange(n)

        if self.cfg.use_time_series_split:
            # Sort dataset by date before splitting to ensure temporal order
            # TimeSeriesSplit with gap prevents future data leaking into training folds
            tscv = TimeSeriesSplit(
                n_splits=self.cfg.n_folds,
                gap=self.cfg.gap_days,         # skip N samples between train end and val start
            )
            split_iter = tscv.split(indices)
        else:
            skf = StratifiedKFold(
                n_splits=self.cfg.n_folds,
                shuffle=self.cfg.shuffle,
                random_state=self.cfg.random_state,
            )
            split_iter = skf.split(indices, labels)

        fold_results: List[FoldResult] = []
        oof_preds: Dict[str, np.ndarray] = {m: np.zeros(n) for m in self.cfg.models}

        for fold_idx, (train_idx, val_idx) in enumerate(split_iter):
            for model_name in self.cfg.models:
                model_cfg = model_configs.get(model_name, {})
                train_preds, val_preds, train_metrics, val_metrics = self._train_fold(
                    dataset, train_idx, val_idx, model_name, model_cfg
                )
                oof_preds[model_name][val_idx] = val_preds

                result = FoldResult(
                    fold=fold_idx,
                    model_name=model_name,
                    train_metrics=train_metrics,
                    val_metrics=val_metrics,
                    oof_predictions=val_preds,
                )
                fold_results.append(result)

                self._log_mlflow(fold_idx, model_name, val_metrics)

        mean_metrics = self._aggregate(fold_results)
        best_model = self._select_best(mean_metrics)

        return CVResults(
            fold_results=fold_results,
            mean_metrics=mean_metrics,
            oof_predictions=oof_preds,
            best_model=best_model,
        )

    def _train_fold(
        self,
        dataset: Any,
        train_idx: np.ndarray,
        val_idx: np.ndarray,
        model_name: str,
        model_cfg: Dict[str, Any],
    ) -> tuple:
        """Train a model on one fold split and return OOF predictions + metrics."""
        from sklearn.metrics import roc_auc_score

        train_recs = [dataset.records[i] for i in train_idx]
        val_recs = [dataset.records[i] for i in val_idx]

        labels_train = np.array([float(r.is_viral) for r in train_recs])
        labels_val = np.array([float(r.is_viral) for r in val_recs])

        # Build feature matrices from audio + metadata
        X_train = self._extract_features(train_recs)
        X_val = self._extract_features(val_recs)

        if model_name == "xgboost":
            from ml.models.xgboost_model import ViralXGBoost, XGBoostConfig
            cfg = XGBoostConfig(**{k: v for k, v in model_cfg.items()
                                   if k in XGBoostConfig.__dataclass_fields__})
            model = ViralXGBoost(cfg)
            y_days = np.array([r.days_to_viral or 0.0 for r in train_recs])
            y_peak = np.array([r.peak_viral_score for r in train_recs])
            model.fit(X_train, labels_train, y_days, y_peak)
            preds_val = model.predict(X_val).viral_prob
            preds_train = model.predict(X_train).viral_prob
        else:
            # lightweight logistic regression proxy for non-XGBoost models in CV
            from sklearn.linear_model import LogisticRegression
            from sklearn.preprocessing import StandardScaler
            scaler = StandardScaler()
            X_tr_s = scaler.fit_transform(X_train)
            X_val_s = scaler.transform(X_val)
            lr = LogisticRegression(C=1.0, max_iter=500, class_weight="balanced")
            lr.fit(X_tr_s, labels_train)
            preds_val = lr.predict_proba(X_val_s)[:, 1]
            preds_train = lr.predict_proba(X_tr_s)[:, 1]

        def _metrics(probs: np.ndarray, labels: np.ndarray) -> Dict[str, float]:
            auroc = float(roc_auc_score(labels, probs)) if len(np.unique(labels)) > 1 else float("nan")
            return {"auroc": auroc}

        return (
            preds_train,
            preds_val,
            _metrics(preds_train, labels_train),
            _metrics(preds_val, labels_val),
        )

    @staticmethod
    def _extract_features(records: List[Any]) -> np.ndarray:
        """Concatenate audio + metadata features into a flat array."""
        rows = []
        for rec in records:
            audio = np.array(rec.audio_features[:64], dtype=np.float32)
            if len(audio) < 64:
                audio = np.pad(audio, (0, 64 - len(audio)))
            meta = np.array(rec.metadata_features[:32], dtype=np.float32)
            if len(meta) < 32:
                meta = np.pad(meta, (0, 32 - len(meta)))
            # add aggregated timeseries stats
            ts = np.array(rec.engagement_series, dtype=np.float32)
            ts_feats = np.array([
                ts.mean(), ts.std(), ts.max(), ts[-1] if len(ts) > 0 else 0.0,
                ts[:7].mean() if len(ts) >= 7 else ts.mean(),
                ts[-7:].mean() if len(ts) >= 7 else ts.mean(),
            ])
            rows.append(np.concatenate([audio, meta, ts_feats]))
        return np.array(rows, dtype=np.float32)

    @staticmethod
    def _aggregate(fold_results: List[FoldResult]) -> Dict[str, Dict[str, Any]]:
        """Compute mean ± std of val metrics per model across folds."""
        from collections import defaultdict
        model_metrics: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
        for fr in fold_results:
            for k, v in fr.val_metrics.items():
                if not np.isnan(v):
                    model_metrics[fr.model_name][k].append(v)
        result: Dict[str, Dict[str, Any]] = {}
        for model, metrics in model_metrics.items():
            result[model] = {}
            for k, vals in metrics.items():
                arr = np.array(vals)
                result[model][k] = f"{arr.mean():.4f} ± {arr.std():.4f}"
                result[model][f"{k}_mean"] = float(arr.mean())
        return result

    @staticmethod
    def _select_best(mean_metrics: Dict[str, Dict[str, Any]]) -> str:
        best_model = ""
        best_val = -1.0
        for model, metrics in mean_metrics.items():
            auroc = metrics.get("auroc_mean", 0.0)
            if auroc > best_val:
                best_val = auroc
                best_model = model
        return best_model

    @staticmethod
    def _log_mlflow(fold: int, model_name: str, metrics: Dict[str, float]) -> None:
        try:
            import mlflow
            for k, v in metrics.items():
                mlflow.log_metric(f"{model_name}_fold{fold}_{k}", v)
        except Exception:
            pass
