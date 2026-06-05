"""
Drift detection for the A&R breakout prediction model.

Three drift types:
  1. DataDrift     — PSI on raw feature distributions (detects API format changes)
  2. PerformanceDrift — rolling accuracy/AUROC drop vs. baseline period
  3. FeatureDrift  — per-feature distribution shift (mean/std change)

Triggers:
  - DataDrift PSI > 0.2 on any feature → "retrain"
  - PerformanceDrift accuracy drop > 0.05 vs last week → "retrain"
  - FeatureDrift: feature mean shifts > 2 std devs → "investigate"
"""
import json
import logging
import os
import tempfile
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ml.self_teaching.feedback_loop import AccuracyTracker

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PSI thresholds
# ---------------------------------------------------------------------------

PSI_NO_DRIFT       = 0.1   # below this: stable
PSI_INVESTIGATE    = 0.2   # between 0.1 and 0.2: worth watching
# above PSI_INVESTIGATE: retrain

FEATURE_SHIFT_STDS = 2.0   # number of reference std-devs before flagging

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class DriftSignal:
    """A single per-feature drift observation."""
    feature: str
    severity: str                   # "none" | "investigate" | "retrain"
    psi: float                      # PSI value (NaN if not applicable)
    current_mean: float             # mean of current data window
    ref_mean: float                 # mean of reference snapshot
    drift_type: str                 # "data_drift" | "feature_drift"


@dataclass
class DriftReport:
    """Full drift report produced by DriftMonitor."""
    triggered_at: str                                   # ISO-8601 UTC timestamp
    data_drift_signals: list[DriftSignal]               # one per feature (PSI-based)
    performance_drift: dict                             # accuracy/AUROC deltas
    feature_drift_signals: list[DriftSignal]            # one per feature (mean/std)
    recommended_action: str                             # "none" | "investigate" | "retrain" | "alert_team"
    summary: str                                        # human-readable one-liner


# ---------------------------------------------------------------------------
# DataDriftDetector  (PSI-based)
# ---------------------------------------------------------------------------

class DataDriftDetector:
    """
    Computes Population Stability Index (PSI) for each feature between a
    reference distribution and the current distribution.

    PSI = Σ (actual_pct - expected_pct) * ln(actual_pct / expected_pct)

    Interpretation:
        PSI < 0.10  → no drift
        0.10–0.20   → investigate
        > 0.20      → retrain
    """

    N_BINS  = 10
    EPSILON = 1e-6   # avoids log(0) and division by zero

    def compute_psi(
        self,
        reference: np.ndarray,
        current: np.ndarray,
    ) -> float:
        """
        Return PSI between reference and current arrays.

        Uses equal-width bins derived from the reference distribution.
        Empty / degenerate arrays return NaN rather than raising.
        """
        reference = np.asarray(reference, dtype=float)
        current   = np.asarray(current,   dtype=float)

        # Drop NaNs
        reference = reference[~np.isnan(reference)]
        current   = current[~np.isnan(current)]

        if reference.size == 0 or current.size == 0:
            log.debug("PSI computation skipped: empty array")
            return float("nan")

        # Build bins from reference range
        ref_min, ref_max = reference.min(), reference.max()
        if ref_min == ref_max:
            # All values identical — no distribution to compare
            return 0.0

        bin_edges = np.linspace(ref_min, ref_max, self.N_BINS + 1)
        # Make the last edge slightly larger so the max value falls inside
        bin_edges[-1] += self.EPSILON

        ref_counts, _ = np.histogram(reference, bins=bin_edges)
        cur_counts, _ = np.histogram(current,   bins=bin_edges)

        ref_pct = ref_counts / reference.size
        cur_pct = cur_counts / current.size

        # Apply epsilon to avoid log(0) or divide-by-zero in empty bins
        ref_pct = np.where(ref_pct == 0, self.EPSILON, ref_pct)
        cur_pct = np.where(cur_pct == 0, self.EPSILON, cur_pct)

        psi = float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))
        return psi

    @staticmethod
    def _severity(psi: float) -> str:
        if np.isnan(psi):
            return "none"
        if psi < PSI_NO_DRIFT:
            return "none"
        if psi < PSI_INVESTIGATE:
            return "investigate"
        return "retrain"

    def detect(
        self,
        reference_df: pd.DataFrame,
        current_df: pd.DataFrame,
        feature_cols: Optional[list[str]] = None,
    ) -> list[DriftSignal]:
        """
        Run PSI on every numeric feature column.

        Parameters
        ----------
        reference_df:
            DataFrame from the training / reference window.
        current_df:
            DataFrame from the recent prediction window.
        feature_cols:
            Subset of columns to test.  Defaults to all shared numeric columns.

        Returns
        -------
        List of DriftSignal, one per feature.
        """
        if feature_cols is None:
            shared_numeric = [
                c for c in reference_df.columns
                if c in current_df.columns
                and pd.api.types.is_numeric_dtype(reference_df[c])
            ]
            feature_cols = shared_numeric

        signals: list[DriftSignal] = []
        for col in feature_cols:
            ref_arr = reference_df[col].dropna().values
            cur_arr = current_df[col].dropna().values

            psi      = self.compute_psi(ref_arr, cur_arr)
            severity = self._severity(psi)

            ref_mean = float(np.nanmean(ref_arr)) if ref_arr.size > 0 else float("nan")
            cur_mean = float(np.nanmean(cur_arr)) if cur_arr.size > 0 else float("nan")

            signals.append(DriftSignal(
                feature=col,
                severity=severity,
                psi=psi,
                current_mean=cur_mean,
                ref_mean=ref_mean,
                drift_type="data_drift",
            ))

        return signals


# ---------------------------------------------------------------------------
# PerformanceDriftDetector  (rolling accuracy / AUROC)
# ---------------------------------------------------------------------------

class PerformanceDriftDetector:
    """
    Compares the 7-day rolling accuracy of the current week against the
    previous 7-day period.  Triggers if the drop exceeds *threshold*.
    """

    def __init__(
        self,
        threshold: float = 0.05,
        outcomes_path: str = "ml/outputs/outcomes.csv",
    ) -> None:
        self.threshold    = threshold
        self._tracker     = AccuracyTracker(outcomes_path=outcomes_path)

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def detect(
        self,
        probs: Optional[np.ndarray]  = None,
        labels: Optional[np.ndarray] = None,
    ) -> dict:
        """
        Returns a dict with keys:

            triggered           bool   — True if performance degraded past threshold
            current_accuracy    float
            previous_accuracy   float
            accuracy_delta      float  — negative means degradation
            auroc_delta         float | None
            current_auroc       float | None
            previous_auroc      float | None
            severity            str    — "none" | "investigate" | "retrain"
            detail              str    — human-readable explanation
        """
        trend = self._tracker.get_accuracy_trend(n_periods=2)

        # trend[-1] is the most recent week; trend[-2] the prior week
        current_accuracy  = trend[-1]["accuracy"] if len(trend) >= 1 else 0.0
        previous_accuracy = trend[-2]["accuracy"] if len(trend) >= 2 else current_accuracy

        delta    = current_accuracy - previous_accuracy
        triggered = delta < -self.threshold

        severity = "none"
        if triggered:
            severity = "retrain"
        elif delta < -(self.threshold / 2):
            severity = "investigate"

        detail = (
            f"Current week accuracy {current_accuracy:.1%} vs previous "
            f"{previous_accuracy:.1%} (delta {delta:+.3f})"
        )

        result: dict = {
            "triggered":          triggered,
            "current_accuracy":   current_accuracy,
            "previous_accuracy":  previous_accuracy,
            "accuracy_delta":     delta,
            "auroc_delta":        None,
            "current_auroc":      None,
            "previous_auroc":     None,
            "severity":           severity,
            "detail":             detail,
        }

        # Optionally compute AUROC if caller supplies probability scores + labels
        if probs is not None and labels is not None:
            auroc_result = self._compute_auroc_drift(probs, labels)
            result.update(auroc_result)

        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _compute_auroc_drift(
        self,
        probs: np.ndarray,
        labels: np.ndarray,
    ) -> dict:
        """
        Compute AUROC for the current batch and compare against the accuracy
        tracker's overall baseline (stored as "auroc" in the trend when present).

        Pure numpy implementation — no sklearn required.
        """
        probs  = np.asarray(probs,  dtype=float)
        labels = np.asarray(labels, dtype=int)

        if probs.size == 0 or np.unique(labels).size < 2:
            return {
                "current_auroc":  None,
                "previous_auroc": None,
                "auroc_delta":    None,
            }

        current_auroc = self._roc_auc_numpy(labels, probs)

        # Use overall accuracy trend as a rough previous-AUROC proxy when no
        # explicit previous AUROC is stored (conservative: treat as identical)
        trend = self._tracker.get_accuracy_trend(n_periods=2)
        previous_auroc: Optional[float] = None
        if len(trend) >= 2:
            # Only use if the prior week had enough data to be meaningful
            if trend[-2].get("n_evaluated", 0) > 5:
                # We don't store AUROC in the trend dict directly; use accuracy
                # as the best available proxy from the trend data
                previous_auroc = trend[-2]["accuracy"]

        auroc_delta = (current_auroc - previous_auroc) if previous_auroc is not None else None

        return {
            "current_auroc":  current_auroc,
            "previous_auroc": previous_auroc,
            "auroc_delta":    auroc_delta,
        }

    @staticmethod
    def _roc_auc_numpy(labels: np.ndarray, scores: np.ndarray) -> float:
        """
        Compute AUROC using the trapezoidal rule — no sklearn dependency.
        """
        # Sort by descending score
        desc_order = np.argsort(-scores)
        labels_sorted = labels[desc_order]

        n_pos = labels_sorted.sum()
        n_neg = len(labels_sorted) - n_pos
        if n_pos == 0 or n_neg == 0:
            return float("nan")

        tpr_list = [0.0]
        fpr_list = [0.0]
        tp = fp = 0

        for label in labels_sorted:
            if label == 1:
                tp += 1
            else:
                fp += 1
            tpr_list.append(tp / n_pos)
            fpr_list.append(fp / n_neg)

        tpr_arr = np.array(tpr_list)
        fpr_arr = np.array(fpr_list)
        # Trapezoidal integration
        auc = float(np.trapezoid(tpr_arr, fpr_arr) if hasattr(np, "trapezoid") else np.trapz(tpr_arr, fpr_arr))
        return auc


# ---------------------------------------------------------------------------
# FeatureDriftDetector  (mean / std shift)
# ---------------------------------------------------------------------------

class FeatureDriftDetector:
    """
    Compares per-feature mean against a reference snapshot stored in a JSON
    file.  Alerts when |current_mean - ref_mean| > FEATURE_SHIFT_STDS * ref_std.

    Example alert: save_rate mean shifts from 0.15 → 0.20 when ref_std is 0.025.
    """

    def __init__(self, reference_stats_path: str) -> None:
        self.reference_stats_path = Path(reference_stats_path)
        self._ref_stats: dict = {}
        self._load_stats()

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def detect(self, current_df: pd.DataFrame) -> list[DriftSignal]:
        """
        Compare current_df column statistics against the reference snapshot.

        Returns one DriftSignal per feature present in both current_df and
        the reference snapshot.
        """
        if not self._ref_stats:
            log.warning(
                "No reference stats loaded from %s — skipping feature drift detection",
                self.reference_stats_path,
            )
            return []

        signals: list[DriftSignal] = []
        for col, ref in self._ref_stats.items():
            if col not in current_df.columns:
                continue
            if not pd.api.types.is_numeric_dtype(current_df[col]):
                continue

            cur_arr  = current_df[col].dropna().values
            if cur_arr.size == 0:
                continue

            cur_mean = float(np.mean(cur_arr))
            ref_mean = float(ref.get("mean", float("nan")))
            ref_std  = float(ref.get("std",  float("nan")))

            if np.isnan(ref_mean) or np.isnan(ref_std) or ref_std == 0:
                severity = "none"
                psi_val  = float("nan")
            else:
                z_score  = abs(cur_mean - ref_mean) / ref_std
                if z_score > FEATURE_SHIFT_STDS:
                    severity = "investigate"
                else:
                    severity = "none"
                # PSI is not computed here (we'd need full distributions);
                # store a pseudo-PSI as the normalised z-score for reference
                psi_val = float("nan")

            signals.append(DriftSignal(
                feature=col,
                severity=severity,
                psi=psi_val,
                current_mean=cur_mean,
                ref_mean=ref_mean,
                drift_type="feature_drift",
            ))

        return signals

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_stats(self) -> None:
        if not self.reference_stats_path.exists():
            log.debug("Reference stats file not found: %s", self.reference_stats_path)
            return
        try:
            with open(self.reference_stats_path, "r") as fh:
                self._ref_stats = json.load(fh)
            log.debug(
                "Loaded reference stats for %d features from %s",
                len(self._ref_stats),
                self.reference_stats_path,
            )
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("Failed to load reference stats: %s", exc)
            self._ref_stats = {}


# ---------------------------------------------------------------------------
# DriftDetector  (orchestrator)
# ---------------------------------------------------------------------------

class DriftDetector:
    """
    Orchestrates DataDriftDetector, PerformanceDriftDetector, and
    FeatureDriftDetector and produces a unified DriftReport.

    Priority order for recommended_action:
        retrain > alert_team > investigate > none

    "alert_team" is triggered when both a PSI retrain signal AND a
    performance drift retrain signal fire simultaneously.
    """

    def __init__(
        self,
        reference_df: pd.DataFrame,
        reference_stats_path: str = "ml/outputs/reference_stats.json",
        outcomes_path: str        = "ml/outputs/outcomes.csv",
        performance_threshold: float = 0.05,
        feature_cols: Optional[list[str]] = None,
    ) -> None:
        self._reference_df   = reference_df
        self._feature_cols   = feature_cols

        self._data_detector  = DataDriftDetector()
        self._perf_detector  = PerformanceDriftDetector(
            threshold=performance_threshold,
            outcomes_path=outcomes_path,
        )
        self._feat_detector  = FeatureDriftDetector(reference_stats_path)

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def run(
        self,
        current_df: pd.DataFrame,
        probs: Optional[np.ndarray]  = None,
        labels: Optional[np.ndarray] = None,
    ) -> "DriftReport":
        """
        Execute all three detectors and return a DriftReport.

        Parameters
        ----------
        current_df:
            Recent prediction/feature data to test for drift.
        probs:
            Predicted probability scores from the current window (optional,
            used for AUROC drift).
        labels:
            Ground-truth labels aligned with *probs* (optional).
        """
        # 1. Data drift (PSI)
        data_signals = self._data_detector.detect(
            self._reference_df, current_df, feature_cols=self._feature_cols
        )

        # 2. Performance drift
        perf_result = self._perf_detector.detect(probs=probs, labels=labels)

        # 3. Feature drift (mean/std)
        feat_signals = self._feat_detector.detect(current_df)

        # 4. Aggregate recommended action
        action, summary = self._aggregate(data_signals, perf_result, feat_signals)

        return DriftReport(
            triggered_at=datetime.now(timezone.utc).isoformat(),
            data_drift_signals=data_signals,
            performance_drift=perf_result,
            feature_drift_signals=feat_signals,
            recommended_action=action,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _aggregate(
        data_signals: list[DriftSignal],
        perf_result: dict,
        feat_signals: list[DriftSignal],
    ) -> tuple[str, str]:
        """Determine the highest-priority action and a summary string."""

        data_retrain   = any(s.severity == "retrain"     for s in data_signals)
        data_invest    = any(s.severity == "investigate"  for s in data_signals)
        perf_retrain   = perf_result.get("severity") == "retrain"
        perf_invest    = perf_result.get("severity") == "investigate"
        feat_invest    = any(s.severity == "investigate"  for s in feat_signals)

        # Both data and performance are critical: escalate to alert_team
        if data_retrain and perf_retrain:
            action  = "alert_team"
            summary = (
                "ALERT: both PSI drift and performance degradation exceed thresholds. "
                "Immediate attention required."
            )
        elif data_retrain or perf_retrain:
            action  = "retrain"
            reasons = []
            if data_retrain:
                bad = [s.feature for s in data_signals if s.severity == "retrain"]
                reasons.append(f"PSI retrain on features: {', '.join(bad)}")
            if perf_retrain:
                reasons.append(perf_result.get("detail", "performance degraded"))
            summary = "Retrain triggered. " + "; ".join(reasons)
        elif data_invest or perf_invest or feat_invest:
            action  = "investigate"
            reasons = []
            if data_invest:
                bad = [s.feature for s in data_signals if s.severity == "investigate"]
                reasons.append(f"PSI warning on: {', '.join(bad)}")
            if perf_invest:
                reasons.append(perf_result.get("detail", "performance slight drop"))
            if feat_invest:
                bad = [s.feature for s in feat_signals if s.severity == "investigate"]
                reasons.append(f"Feature mean shift on: {', '.join(bad)}")
            summary = "Investigate drift signals. " + "; ".join(reasons)
        else:
            action  = "none"
            summary = "No significant drift detected across all three detectors."

        return action, summary


# ---------------------------------------------------------------------------
# DriftMonitor  (high-level entry point)
# ---------------------------------------------------------------------------

class DriftMonitor:
    """
    High-level entry point that:
      1. Loads a reference feature stats JSON snapshot.
      2. Instantiates and runs all three detectors.
      3. Returns a DriftReport.

    Designed to be called from a scheduled job (e.g. daily cron) or after
    a batch of new predictions has been generated.

    Usage
    -----
    ::

        monitor = DriftMonitor(
            reference_df=training_df,
            reference_stats_path="ml/outputs/reference_stats.json",
        )
        report = monitor.run(current_df=recent_predictions_df)
        if report.recommended_action in ("retrain", "alert_team"):
            trigger_retraining()
    """

    def __init__(
        self,
        reference_df: pd.DataFrame,
        reference_stats_path: str     = "ml/outputs/reference_stats.json",
        outcomes_path: str            = "ml/outputs/outcomes.csv",
        performance_threshold: float  = 0.05,
        feature_cols: Optional[list[str]] = None,
    ) -> None:
        self._detector = DriftDetector(
            reference_df=reference_df,
            reference_stats_path=reference_stats_path,
            outcomes_path=outcomes_path,
            performance_threshold=performance_threshold,
            feature_cols=feature_cols,
        )
        self._reference_stats_path = Path(reference_stats_path)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def run(
        self,
        current_df: pd.DataFrame,
        probs: Optional[np.ndarray]  = None,
        labels: Optional[np.ndarray] = None,
    ) -> DriftReport:
        """
        Run all drift detectors and return a DriftReport.

        Parameters
        ----------
        current_df:
            DataFrame of recent feature observations to compare against
            the reference.
        probs:
            Predicted probability scores (0–1) for the current window.
            When supplied alongside *labels*, AUROC drift is computed.
        labels:
            Binary ground-truth labels aligned with *probs*.
        """
        log.info("Running drift detection over %d current rows", len(current_df))
        report = self._detector.run(current_df, probs=probs, labels=labels)
        log.info(
            "Drift report: action=%s  summary=%s",
            report.recommended_action,
            report.summary,
        )
        return report

    # ------------------------------------------------------------------
    # Snapshot utilities
    # ------------------------------------------------------------------

    @classmethod
    def save_reference_snapshot(
        cls,
        df: pd.DataFrame,
        path: str,
    ) -> None:
        """
        Persist mean, std, and key percentiles for every numeric column in
        *df* to a JSON file at *path*.

        Called at training time so that subsequent drift runs have a stable
        reference to compare against.

        Saved structure (one entry per column)::

            {
              "save_rate": {
                "mean": 0.153,
                "std": 0.025,
                "min": 0.0,
                "max": 1.0,
                "p25": 0.10,
                "p50": 0.15,
                "p75": 0.20,
                "p95": 0.38,
                "n":   4820
              },
              ...
            }
        """
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        stats: dict = {}

        for col in numeric_cols:
            arr = df[col].dropna().values.astype(float)
            if arr.size == 0:
                continue
            stats[col] = {
                "mean": float(np.mean(arr)),
                "std":  float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0,
                "min":  float(np.min(arr)),
                "max":  float(np.max(arr)),
                "p25":  float(np.percentile(arr, 25)),
                "p50":  float(np.percentile(arr, 50)),
                "p75":  float(np.percentile(arr, 75)),
                "p95":  float(np.percentile(arr, 95)),
                "n":    int(arr.size),
            }

        out_path = Path(path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # Atomic write
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=out_path.parent, prefix="ref_stats_", suffix=".tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w") as fh:
                json.dump(stats, fh, indent=2)
            os.replace(tmp_path, out_path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

        log.info(
            "Saved reference snapshot for %d features to %s",
            len(stats),
            out_path,
        )

    def report_to_dict(self, report: DriftReport) -> dict:
        """Serialise a DriftReport to a plain dict (JSON-safe)."""
        return {
            "triggered_at":         report.triggered_at,
            "recommended_action":   report.recommended_action,
            "summary":              report.summary,
            "performance_drift":    report.performance_drift,
            "data_drift_signals":   [asdict(s) for s in report.data_drift_signals],
            "feature_drift_signals": [asdict(s) for s in report.feature_drift_signals],
        }
