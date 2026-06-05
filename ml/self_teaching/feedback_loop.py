"""
Feedback loop: tracks prediction outcomes and triggers retraining
when enough new labeled cases accumulate.

Label source: Billboard/chart data compared against predictions made 90+ days ago.
Auto-triggers WeeklyTrainer when >= RETRAIN_THRESHOLD new cases labeled.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

RETRAIN_THRESHOLD = 100   # new labeled cases before auto-retrain
OUTCOME_WINDOW_DAYS = 90  # days to wait before evaluating a prediction


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class OutcomeRecord:
    prediction_id: int
    artist_id: int
    predicted_at: str
    breakout_probability: float
    actual_broke_out: bool
    was_correct: bool
    charted_at: Optional[str]
    chart_name: Optional[str]


@dataclass
class AccuracyMetrics:
    overall_accuracy: float
    precision: float
    recall: float
    f1: float
    total_evaluated: int
    correct: int
    false_positives: int
    false_negatives: int
    period_days: int


@dataclass
class IngestResult:
    outcomes_added: int
    triggered_retrain: bool
    new_total_labeled: int
    retrain_result: Optional[object]   # RetrainingResult | None


# ---------------------------------------------------------------------------
# AccuracyTracker
# ---------------------------------------------------------------------------

class AccuracyTracker:
    """Persists outcome records and computes accuracy metrics."""

    def __init__(self, outcomes_path: str = "ml/outputs/outcomes.csv") -> None:
        self.outcomes_path = Path(outcomes_path)
        self.outcomes_path.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add_outcomes(self, records: list[OutcomeRecord]) -> None:
        if not records:
            return
        new_df = pd.DataFrame([self._record_to_dict(r) for r in records])
        if self.outcomes_path.exists():
            existing = self._read_outcomes()
            combined = pd.concat([existing, new_df], ignore_index=True)
        else:
            combined = new_df
        self._write_outcomes(combined)
        log.info("Appended %d outcome records", len(records))

    # ------------------------------------------------------------------
    # Read / metrics
    # ------------------------------------------------------------------

    def compute_accuracy(self, since_days: int = 90) -> AccuracyMetrics:
        df = self._load_since(since_days)
        if df.empty:
            return AccuracyMetrics(0, 0, 0, 0, 0, 0, 0, 0, since_days)

        total = len(df)
        correct = int(df["was_correct"].sum())
        predicted_positive = df["breakout_probability"] >= 50
        actual_positive = df["actual_broke_out"]

        tp = int((predicted_positive & actual_positive).sum())
        fp = int((predicted_positive & ~actual_positive).sum())
        fn = int((~predicted_positive & actual_positive).sum())

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0.0)

        return AccuracyMetrics(
            overall_accuracy=correct / total,
            precision=precision,
            recall=recall,
            f1=f1,
            total_evaluated=total,
            correct=correct,
            false_positives=fp,
            false_negatives=fn,
            period_days=since_days,
        )

    def count_new_labeled(self, since_last_retrain_at: str) -> int:
        """Count outcome records added since the last retraining run.

        Uses a row-count file to track how many records existed at last retrain.
        """
        if not self.outcomes_path.exists():
            return 0
        df = self._read_outcomes()
        if df.empty:
            return 0
        # Count total current records minus the baseline count at last retrain
        total = len(df)
        baseline_path = self.outcomes_path.parent / ".outcomes_baseline_count"
        try:
            baseline = int(baseline_path.read_text())
        except Exception:
            baseline = 0
        return max(0, total - baseline)

    def _save_baseline_count(self) -> None:
        """Record current row count as the new baseline after retraining."""
        if not self.outcomes_path.exists():
            count = 0
        else:
            try:
                df = self._read_outcomes()
                count = len(df)
            except Exception:
                count = 0
        baseline_path = self.outcomes_path.parent / ".outcomes_baseline_count"
        try:
            baseline_path.write_text(str(count))
        except Exception:
            pass

    def get_accuracy_trend(self, n_periods: int = 8) -> list[dict]:
        if not self.outcomes_path.exists():
            return []
        df = self._read_outcomes()
        if df.empty:
            return []
        df["predicted_at"] = pd.to_datetime(df["predicted_at"], utc=True, errors="coerce")
        df = df.dropna(subset=["predicted_at"])

        trend = []
        now = pd.Timestamp.now("UTC")
        for i in range(n_periods - 1, -1, -1):
            week_end   = now - timedelta(weeks=i)
            week_start = week_end - timedelta(weeks=1)
            week_df = df[(df["predicted_at"] >= week_start) & (df["predicted_at"] < week_end)]
            if week_df.empty:
                trend.append({
                    "week_start": week_start.isoformat(),
                    "accuracy": 0.0,
                    "n_evaluated": 0,
                    "precision": 0.0,
                    "recall": 0.0,
                })
                continue

            n = len(week_df)
            correct = int(week_df["was_correct"].sum())
            predicted_pos = week_df["breakout_probability"] >= 50
            actual_pos    = week_df["actual_broke_out"]
            tp = int((predicted_pos & actual_pos).sum())
            fp = int((predicted_pos & ~actual_pos).sum())
            fn = int((~predicted_pos & actual_pos).sum())
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0

            trend.append({
                "week_start": week_start.isoformat(),
                "accuracy":   correct / n,
                "n_evaluated": n,
                "precision":  precision,
                "recall":     recall,
            })
        return trend

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _read_outcomes(self) -> pd.DataFrame:
        """Read outcomes, preferring parquet but falling back to CSV."""
        path = self.outcomes_path
        try:
            if str(path).endswith(".parquet"):
                return pd.read_parquet(path)
            return pd.read_csv(path)
        except Exception:
            return pd.DataFrame()

    def _write_outcomes(self, df: pd.DataFrame) -> None:
        """Write outcomes, preferring parquet but falling back to CSV."""
        path = self.outcomes_path
        try:
            if str(path).endswith(".parquet"):
                df.to_parquet(path, index=False)
            else:
                df.to_csv(path, index=False)
        except ImportError:
            csv_path = Path(str(path).replace(".parquet", ".csv"))
            self.outcomes_path = csv_path
            df.to_csv(csv_path, index=False)

    def _load_since(self, since_days: int) -> pd.DataFrame:
        if not self.outcomes_path.exists():
            return pd.DataFrame()
        df = self._read_outcomes()
        if df.empty:
            return df
        cutoff = pd.Timestamp.now("UTC") - pd.Timedelta(days=since_days)
        df["predicted_at"] = pd.to_datetime(df["predicted_at"], utc=True, errors="coerce")
        return df[df["predicted_at"] >= cutoff].copy()

    @staticmethod
    def _record_to_dict(r: OutcomeRecord) -> dict:
        return {
            "prediction_id":       r.prediction_id,
            "artist_id":           r.artist_id,
            "predicted_at":        r.predicted_at,
            "breakout_probability": r.breakout_probability,
            "actual_broke_out":    r.actual_broke_out,
            "was_correct":         r.was_correct,
            "charted_at":          r.charted_at,
            "chart_name":          r.chart_name,
        }


# ---------------------------------------------------------------------------
# FeedbackLoop
# ---------------------------------------------------------------------------

class FeedbackLoop:
    """Ingests outcomes, monitors accuracy drift, and auto-triggers retraining."""

    def __init__(
        self,
        trainer_cfg,        # RetrainingConfig
        outcomes_path: str = "ml/outputs/outcomes.csv",
    ) -> None:
        self.trainer_cfg = trainer_cfg
        self._tracker = AccuracyTracker(outcomes_path=outcomes_path)
        self._last_retrain_at: str = datetime.now(timezone.utc).isoformat()

    def ingest_outcomes(self, records: list[OutcomeRecord]) -> IngestResult:
        self._tracker.add_outcomes(records)
        new_count = self._tracker.count_new_labeled(self._last_retrain_at)

        if new_count >= RETRAIN_THRESHOLD:
            log.info("Accumulated %d new labeled cases — triggering retraining", new_count)
            from ml.self_teaching.weekly_trainer import WeeklyTrainer
            trainer = WeeklyTrainer(self.trainer_cfg)
            retrain_result = trainer.run(new_labeled_cases=new_count)
            self._last_retrain_at = datetime.now(timezone.utc).isoformat()
            self._tracker._save_baseline_count()
            return IngestResult(
                outcomes_added=len(records),
                triggered_retrain=True,
                new_total_labeled=new_count,
                retrain_result=retrain_result,
            )

        return IngestResult(
            outcomes_added=len(records),
            triggered_retrain=False,
            new_total_labeled=new_count,
            retrain_result=None,
        )

    def evaluate_pending(
        self, predictions: list[dict], chart_data: list[dict]
    ) -> list[OutcomeRecord]:
        """Cross-reference old predictions against chart results."""
        charted_ids: dict[int, dict] = {}
        for entry in chart_data:
            aid = entry.get("artist_id") or entry.get("artistId")
            if aid is not None:
                charted_ids[int(aid)] = entry

        cutoff = datetime.now(timezone.utc) - timedelta(days=OUTCOME_WINDOW_DAYS)
        resolved: list[OutcomeRecord] = []

        for pred in predictions:
            predicted_at_str = pred.get("predicted_at") or pred.get("predictedAt", "")
            try:
                predicted_at = datetime.fromisoformat(predicted_at_str.replace("Z", "+00:00"))
                if predicted_at.tzinfo is None:
                    predicted_at = predicted_at.replace(tzinfo=timezone.utc)
            except (ValueError, AttributeError):
                continue

            if predicted_at > cutoff:
                continue  # Too recent to evaluate

            artist_id = int(pred.get("artist_id") or pred.get("artistId", 0))
            breakout_prob = float(pred.get("breakout_probability", pred.get("breakoutProbability", 50)))
            chart_entry = charted_ids.get(artist_id)
            actual_broke_out = chart_entry is not None

            was_correct = (breakout_prob >= 50) == actual_broke_out

            resolved.append(OutcomeRecord(
                prediction_id=int(pred.get("prediction_id", pred.get("id", 0))),
                artist_id=artist_id,
                predicted_at=predicted_at_str,
                breakout_probability=breakout_prob,
                actual_broke_out=actual_broke_out,
                was_correct=was_correct,
                charted_at=chart_entry.get("charted_at") if chart_entry else None,
                chart_name=chart_entry.get("chart_name") if chart_entry else None,
            ))

        return resolved

    def get_accuracy_report(self) -> dict:
        """Overall accuracy, trend, and drift detection."""
        overall = self._tracker.compute_accuracy(since_days=365)
        recent_30 = self._tracker.compute_accuracy(since_days=30)
        trend = self._tracker.get_accuracy_trend(n_periods=8)

        drift_alert = False
        drift_detail = None
        if overall.total_evaluated > 0 and recent_30.total_evaluated > 0:
            drop = overall.overall_accuracy - recent_30.overall_accuracy
            if drop > 0.10:
                drift_alert = True
                drift_detail = (
                    f"30-day accuracy {recent_30.overall_accuracy:.1%} is "
                    f"{drop:.1%} below overall {overall.overall_accuracy:.1%}"
                )

        return {
            "overall": {
                "accuracy":    overall.overall_accuracy,
                "precision":   overall.precision,
                "recall":      overall.recall,
                "f1":          overall.f1,
                "total":       overall.total_evaluated,
                "period_days": overall.period_days,
            },
            "recent_30d": {
                "accuracy":    recent_30.overall_accuracy,
                "total":       recent_30.total_evaluated,
                "period_days": 30,
            },
            "trend":       trend,
            "drift_alert": drift_alert,
            "drift_detail": drift_detail,
        }
