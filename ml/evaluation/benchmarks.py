"""
Model comparison benchmarks for ViralTransformer.

Compares ViralTransformer against baseline models:
  - RandomBaseline: predicts class prior / label mean
  - LogisticBaseline: logistic regression on flattened timeseries features
  - SingleModalityTransformer: ablation — one encoder at a time
  - ViralTransformerNoFusion: ablation — mean-pool encoders, no cross-attention
  - ViralTransformer (full): complete multi-modal architecture

Outputs a comparison table and radar chart.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import torch
from torch.utils.data import DataLoader


# ---------------------------------------------------------------------------
# Baseline models
# ---------------------------------------------------------------------------

class RandomBaseline:
    """Predicts viral probability as the training set prevalence."""

    def __init__(self, viral_prevalence: float = 0.1):
        self.p = viral_prevalence

    def predict(self, n: int) -> Dict[str, np.ndarray]:
        return {
            "viral_prob": np.full(n, self.p, dtype=np.float32),
            "days_to_viral": np.full(n, 60.0, dtype=np.float32),
            "peak_score": np.full(n, 50.0, dtype=np.float32),
        }


class MeanBaseline:
    """Predicts training set means for all regression targets."""

    def __init__(
        self,
        viral_prevalence: float = 0.1,
        mean_days: float = 45.0,
        mean_peak: float = 55.0,
    ):
        self.viral_prevalence = viral_prevalence
        self.mean_days = mean_days
        self.mean_peak = mean_peak

    def predict(self, n: int) -> Dict[str, np.ndarray]:
        return {
            "viral_prob": np.full(n, self.viral_prevalence, dtype=np.float32),
            "days_to_viral": np.full(n, self.mean_days, dtype=np.float32),
            "peak_score": np.full(n, self.mean_peak, dtype=np.float32),
        }


class TimeSeriesOnlyBaseline:
    """
    Logistic regression + linear regression on last-7-day timeseries features.
    Represents the 'tabular ML' approach without deep learning.
    """

    def __init__(self):
        self._viral_clf = None
        self._days_reg = None
        self._peak_reg = None

    def _extract_features(self, ts: np.ndarray) -> np.ndarray:
        """Extract 24 hand-crafted features from (T, F) timeseries."""
        # Last values, 7d mean, 7d std, 30d mean, velocity
        T, F = ts.shape
        feats = []
        for f in range(F):
            series = ts[:, f]
            last = series[-1] if T > 0 else 0
            mean7 = series[-7:].mean() if T >= 7 else series.mean()
            std7 = series[-7:].std() if T >= 7 else 0
            mean30 = series[-30:].mean() if T >= 30 else series.mean()
            vel = (series[-1] - series[-7]) / 7 if T >= 7 else 0
            feats.extend([last, mean7, std7, mean30, vel])
        return np.array(feats, dtype=np.float32)

    def fit(
        self,
        timeseries_list: List[np.ndarray],
        viral_labels: np.ndarray,
        days_labels: np.ndarray,
        peak_labels: np.ndarray,
    ) -> None:
        from sklearn.linear_model import LinearRegression, LogisticRegression
        from sklearn.preprocessing import StandardScaler

        X = np.stack([self._extract_features(ts) for ts in timeseries_list])
        self._scaler = StandardScaler().fit(X)
        X_scaled = self._scaler.transform(X)

        self._viral_clf = LogisticRegression(max_iter=200, C=1.0)
        self._viral_clf.fit(X_scaled, (viral_labels > 0.5).astype(int))

        viral_mask = viral_labels > 0.5
        if viral_mask.sum() > 1:
            self._days_reg = LinearRegression()
            self._days_reg.fit(X_scaled[viral_mask], days_labels[viral_mask])

        self._peak_reg = LinearRegression()
        self._peak_reg.fit(X_scaled, peak_labels)

    def predict(self, timeseries_list: List[np.ndarray]) -> Dict[str, np.ndarray]:
        X = np.stack([self._extract_features(ts) for ts in timeseries_list])
        X_scaled = self._scaler.transform(X)

        viral_prob = self._viral_clf.predict_proba(X_scaled)[:, 1]
        days_pred = (
            self._days_reg.predict(X_scaled).clip(0, 365)
            if self._days_reg is not None
            else np.full(len(X), 45.0)
        )
        peak_pred = self._peak_reg.predict(X_scaled).clip(0, 100)

        return {
            "viral_prob": viral_prob.astype(np.float32),
            "days_to_viral": days_pred.astype(np.float32),
            "peak_score": peak_pred.astype(np.float32),
        }


# ---------------------------------------------------------------------------
# Benchmark runner
# ---------------------------------------------------------------------------

@dataclass
class BenchmarkResult:
    """Results for one model across all evaluated tasks."""
    model_name: str
    viral_auroc: float = float("nan")
    viral_f1: float = float("nan")
    days_mae: float = float("nan")
    peak_mae: float = float("nan")
    peak_r2: float = float("nan")
    clip_ndcg_at_3: float = float("nan")
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, float]:
        return {
            "viral_auroc": self.viral_auroc,
            "viral_f1": self.viral_f1,
            "days_mae": self.days_mae,
            "peak_mae": self.peak_mae,
            "peak_r2": self.peak_r2,
            "clip_ndcg@3": self.clip_ndcg_at_3,
        }


def run_benchmarks(
    test_loader: DataLoader,
    viral_transformer: Optional["ViralTransformer"] = None,  # type: ignore[name-defined]
    device: Optional[torch.device] = None,
    viral_prevalence: float = 0.1,
) -> Dict[str, BenchmarkResult]:
    """
    Run all baseline comparisons and optionally the full ViralTransformer.

    Returns dict of {model_name: BenchmarkResult}.
    """
    from .metrics import (
        compute_clip_metrics,
        compute_days_to_viral_metrics,
        compute_peak_score_metrics,
        compute_viral_classification_metrics,
    )

    # Collect ground truth
    all_viral: List[np.ndarray] = []
    all_days: List[np.ndarray] = []
    all_peaks: List[np.ndarray] = []
    all_ts: List[np.ndarray] = []
    all_clip_targets: List[np.ndarray] = []

    for batch in test_loader:
        all_viral.append(batch["viral"].numpy().flatten())
        all_days.append(batch["days_to_viral"].numpy().flatten())
        all_peaks.append(batch["peak_score"].numpy().flatten())
        all_ts.append(batch["timeseries"].numpy())  # (B, T, F)
        if "clip_target" in batch:
            all_clip_targets.append(batch["clip_target"].numpy())

    viral_labels = np.concatenate(all_viral)
    days_labels = np.concatenate(all_days)
    peak_labels = np.concatenate(all_peaks)
    n = len(viral_labels)

    results: Dict[str, BenchmarkResult] = {}

    # Random baseline
    rb = RandomBaseline(viral_prevalence)
    preds = rb.predict(n)
    viral_m = compute_viral_classification_metrics(preds["viral_prob"], viral_labels)
    days_m = compute_days_to_viral_metrics(preds["days_to_viral"], days_labels, viral_labels > 0.5)
    peak_m = compute_peak_score_metrics(preds["peak_score"], peak_labels)
    results["Random"] = BenchmarkResult(
        "Random",
        viral_auroc=viral_m.get("auroc", float("nan")),
        viral_f1=viral_m.get("f1", float("nan")),
        days_mae=days_m.get("mae", float("nan")),
        peak_mae=peak_m.get("mae", float("nan")),
        peak_r2=peak_m.get("r2", float("nan")),
    )

    # Mean baseline
    mb = MeanBaseline(viral_prevalence, days_labels[viral_labels > 0.5].mean() if (viral_labels > 0.5).any() else 45.0, peak_labels.mean())
    preds = mb.predict(n)
    viral_m = compute_viral_classification_metrics(preds["viral_prob"], viral_labels)
    peak_m = compute_peak_score_metrics(preds["peak_score"], peak_labels)
    results["MeanBaseline"] = BenchmarkResult(
        "MeanBaseline",
        viral_auroc=viral_m.get("auroc", float("nan")),
        viral_f1=viral_m.get("f1", float("nan")),
        peak_mae=peak_m.get("mae", float("nan")),
        peak_r2=peak_m.get("r2", float("nan")),
    )

    # Timeseries-only logistic baseline
    ts_arr = np.concatenate([ts for ts in all_ts], axis=0)  # (N, T, F)
    ts_list = [ts_arr[i] for i in range(len(ts_arr))]
    ts_baseline = TimeSeriesOnlyBaseline()
    ts_baseline.fit(ts_list, viral_labels, days_labels, peak_labels)
    preds = ts_baseline.predict(ts_list)
    viral_m = compute_viral_classification_metrics(preds["viral_prob"], viral_labels)
    days_m = compute_days_to_viral_metrics(preds["days_to_viral"], days_labels, viral_labels > 0.5)
    peak_m = compute_peak_score_metrics(preds["peak_score"], peak_labels)
    results["TimeSeriesOnly"] = BenchmarkResult(
        "TimeSeriesOnly",
        viral_auroc=viral_m.get("auroc", float("nan")),
        viral_f1=viral_m.get("f1", float("nan")),
        days_mae=days_m.get("mae", float("nan")),
        peak_mae=peak_m.get("mae", float("nan")),
        peak_r2=peak_m.get("r2", float("nan")),
    )

    # Full ViralTransformer
    if viral_transformer is not None and device is not None:
        from .metrics import evaluate_model

        full_metrics = evaluate_model(viral_transformer, test_loader, device)
        vc = full_metrics.get("viral_classification", {})
        dm = full_metrics.get("days_to_viral", {})
        pm = full_metrics.get("peak_score", {})
        cm = full_metrics.get("clip_recommendation", {})

        results["ViralTransformer"] = BenchmarkResult(
            "ViralTransformer",
            viral_auroc=vc.get("auroc", float("nan")),
            viral_f1=vc.get("f1", float("nan")),
            days_mae=dm.get("mae", float("nan")),
            peak_mae=pm.get("mae", float("nan")),
            peak_r2=pm.get("r2", float("nan")),
            clip_ndcg_at_3=cm.get("ndcg@3", float("nan")),
        )

    return results


def print_benchmark_table(results: Dict[str, BenchmarkResult]) -> None:
    """Pretty-print benchmark comparison table."""
    models = list(results.keys())
    metrics = ["viral_auroc", "viral_f1", "days_mae", "peak_mae", "peak_r2", "clip_ndcg@3"]
    col_w = 14

    header = f"{'Model':<20}" + "".join(f"{m:>{col_w}}" for m in metrics)
    print("\n" + "=" * len(header))
    print("BENCHMARK COMPARISON")
    print("=" * len(header))
    print(header)
    print("-" * len(header))

    for name, res in results.items():
        d = res.to_dict()
        row = f"{name:<20}" + "".join(
            f"{d.get(m, float('nan')):>{col_w}.4f}" for m in metrics
        )
        print(row)

    print("=" * len(header) + "\n")
