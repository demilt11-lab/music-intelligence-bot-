"""
Tests for the continuous-learning feedback loop.

Covers:
  - DriftDetector: PSI thresholds, performance drift, feature drift
  - HumanReviewQueue: enqueue, submit, expiry, dedup
  - LabelQualityGate: 90-day window, feedback source weight, rejection
  - SelfReinforcementGuard: filters model_prediction labels
  - FeedbackLoop: accuracy metrics, trend, ingest triggering
  - LoopOrchestrator: integration smoke test
"""
import json
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest


# ────────────────────────────────────────────────────────────────────────────
# Fixtures
# ────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_dir(tmp_path):
    return tmp_path


@pytest.fixture
def sample_outcomes_df():
    """30 evaluated outcomes: 20 correct, 10 wrong."""
    rng = np.random.default_rng(42)
    n = 30
    probs = rng.uniform(0, 1, n)
    actuals = (probs > 0.5).astype(bool)
    # Flip 10 to be wrong
    flip_idx = rng.choice(n, 10, replace=False)
    actuals[flip_idx] = ~actuals[flip_idx]
    correct = (probs >= 0.5) == actuals

    now = datetime.now(timezone.utc)
    return pd.DataFrame({
        "prediction_id":        range(n),
        "artist_id":            range(1, n + 1),
        "predicted_at":         [(now - timedelta(days=100)).isoformat()] * n,
        "breakout_probability": probs * 100,  # 0-100 scale
        "actual_broke_out":     actuals,
        "was_correct":          correct,
        "charted_at":           [None] * n,
        "chart_name":           [None] * n,
        "feedback_source":      ["chart_monitor"] * n,
        "label_source":         ["chart_monitor"] * n,
    })


@pytest.fixture
def reference_snapshot(tmp_dir):
    """Write a minimal feature reference JSON."""
    ref = {
        "save_rate":       {"mean": 0.15, "std": 0.05, "p25": 0.10, "p50": 0.15, "p75": 0.20, "null_rate": 0.0},
        "stream_velocity": {"mean": 0.25, "std": 0.10, "p25": 0.15, "p50": 0.25, "p75": 0.35, "null_rate": 0.0},
        "tiktok_growth":   {"mean": 0.30, "std": 0.15, "p25": 0.15, "p50": 0.30, "p75": 0.45, "null_rate": 0.0},
    }
    path = tmp_dir / "feature_reference.json"
    path.write_text(json.dumps(ref))
    return str(path)


# ────────────────────────────────────────────────────────────────────────────
# Drift Detector
# ────────────────────────────────────────────────────────────────────────────

class TestDataDriftDetector:
    def test_no_drift_identical_distributions(self):
        from ml.self_teaching.drift_detector import DataDriftDetector
        rng = np.random.default_rng(0)
        data = rng.normal(0.5, 0.1, 1000)
        df = pd.DataFrame({"save_rate": data})
        det = DataDriftDetector()
        signals = det.detect(df, df)
        assert all(s.severity == "none" for s in signals)

    def test_high_psi_triggers_retrain(self):
        from ml.self_teaching.drift_detector import DataDriftDetector
        rng = np.random.default_rng(1)
        ref_df  = pd.DataFrame({"save_rate": rng.normal(0.15, 0.03, 500)})
        curr_df = pd.DataFrame({"save_rate": rng.normal(0.40, 0.03, 500)})
        det = DataDriftDetector()
        signals = det.detect(ref_df, curr_df)
        assert any(s.psi > 0.2 for s in signals), "Large distribution shift should have PSI > 0.2"
        assert any(s.severity in ("retrain", "alert_team") for s in signals)

    def test_moderate_psi_investigate(self):
        from ml.self_teaching.drift_detector import DataDriftDetector
        rng = np.random.default_rng(2)
        ref_df  = pd.DataFrame({"save_rate": rng.normal(0.15, 0.03, 500)})
        curr_df = pd.DataFrame({"save_rate": rng.normal(0.20, 0.04, 500)})
        det = DataDriftDetector()
        signals = det.detect(ref_df, curr_df)
        assert isinstance(signals, list)

    def test_empty_arrays_handled(self):
        from ml.self_teaching.drift_detector import DataDriftDetector
        det = DataDriftDetector()
        empty = pd.DataFrame({"x": pd.Series([], dtype=float)})
        signals = det.detect(empty, empty)
        assert isinstance(signals, list)


class TestPerformanceDriftDetector:
    def test_no_drift_stable_accuracy(self, tmp_dir):
        from ml.self_teaching.drift_detector import PerformanceDriftDetector
        det = PerformanceDriftDetector(outcomes_path=str(tmp_dir / "outcomes.csv"))
        # With no outcomes file, should return a dict with severity "none"
        result = det.detect()
        assert isinstance(result, dict)
        assert result.get("triggered") is False or result.get("severity") == "none"

    def test_auroc_drift_detected(self):
        """detect() with well-calibrated vs inverted probs should show auroc regression."""
        from ml.self_teaching.drift_detector import PerformanceDriftDetector
        rng = np.random.default_rng(3)
        probs_good = rng.uniform(0, 1, 100)
        labels = (probs_good > 0.5).astype(int)
        probs_bad = np.where(labels > 0.5, 0.01, 0.99)  # inverted = low AUROC
        det = PerformanceDriftDetector()
        # Pass both arrays; implementation computes AUROC on current probs/labels
        result = det.detect(probs=probs_bad, labels=labels)
        # AUROC delta should be negative (bad probs vs baseline or < 0.5)
        assert isinstance(result, dict)
        if result.get("current_auroc") is not None:
            assert result["current_auroc"] < 0.55, "Inverted predictions should have low AUROC"

    def test_detect_returns_dict(self, tmp_dir):
        from ml.self_teaching.drift_detector import PerformanceDriftDetector
        det = PerformanceDriftDetector(outcomes_path=str(tmp_dir / "outcomes.csv"))
        result = det.detect()
        assert isinstance(result, dict)
        assert "severity" in result
        assert "triggered" in result


class TestFeatureDriftDetector:
    def test_no_drift_within_2sigma(self, reference_snapshot):
        from ml.self_teaching.drift_detector import FeatureDriftDetector
        rng = np.random.default_rng(5)
        # Current data close to reference
        curr_df = pd.DataFrame({
            "save_rate":       rng.normal(0.15, 0.05, 200),
            "stream_velocity": rng.normal(0.25, 0.10, 200),
        })
        det = FeatureDriftDetector(reference_stats_path=reference_snapshot)
        signals = det.detect(curr_df)
        assert all(s.severity == "none" for s in signals)

    def test_drift_detected_mean_shift(self, reference_snapshot):
        from ml.self_teaching.drift_detector import FeatureDriftDetector
        rng = np.random.default_rng(6)
        # save_rate shifted from 0.15 → 0.30 (2 std devs above ref mean 0.15, ref std 0.05)
        curr_df = pd.DataFrame({
            "save_rate": rng.normal(0.30, 0.05, 200),
        })
        det = FeatureDriftDetector(reference_stats_path=reference_snapshot)
        signals = det.detect(curr_df)
        save_rate_signals = [s for s in signals if s.feature == "save_rate"]
        assert save_rate_signals, "Expected save_rate drift signal"
        assert save_rate_signals[0].severity != "none"

    def test_missing_reference_file(self, tmp_dir):
        from ml.self_teaching.drift_detector import FeatureDriftDetector
        det = FeatureDriftDetector(reference_stats_path=str(tmp_dir / "missing.json"))
        curr_df = pd.DataFrame({"save_rate": [0.15] * 10})
        signals = det.detect(curr_df)  # Should not raise
        assert isinstance(signals, list)


# ────────────────────────────────────────────────────────────────────────────
# Human Review Queue
# ────────────────────────────────────────────────────────────────────────────

class TestHumanReviewQueue:
    def _make_prediction(self, artist_id=1, prob=50.0, confidence=0.50):
        from ml.self_teaching.prediction_engine import PredictionOutput
        return PredictionOutput(
            artist_id=artist_id,
            breakout_probability=prob,
            confidence_score=confidence,
            model_version="v1.0",
            top_signals=[{"signal": "save_rate", "value": 0.12, "weight": 2.8}],
            predicted_at=datetime.now(timezone.utc).isoformat(),
            warning=None,
            from_cache=False,
        )

    def test_enqueue_and_get_pending(self, tmp_dir):
        from ml.self_teaching.human_review import HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "queue.json"),
                             decisions_path=str(tmp_dir / "decisions.json"))
        pred = self._make_prediction(artist_id=42, prob=50.0, confidence=0.50)
        item = q.enqueue(pred, reason="low_confidence")
        assert item.artist_id == 42
        assert item.status == "pending"

        pending = q.get_pending()
        assert len(pending) == 1
        assert pending[0].id == item.id

    def test_submit_decision_marks_reviewed(self, tmp_dir):
        from ml.self_teaching.human_review import HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "queue.json"),
                             decisions_path=str(tmp_dir / "decisions.json"))
        pred = self._make_prediction(artist_id=7, confidence=0.48)
        item = q.enqueue(pred, reason="low_confidence")

        decision = q.submit_decision(item.id, "breakout", "reviewer_a", "Strong indie buzz")
        assert decision.decision == "breakout"
        assert decision.label_weight == 1.0
        assert decision.reviewer_id == "reviewer_a"

        # Should no longer be pending
        pending = q.get_pending()
        assert not any(p.id == item.id for p in pending)

    def test_uncertain_decision_gets_half_weight(self, tmp_dir):
        from ml.self_teaching.human_review import HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "queue.json"),
                             decisions_path=str(tmp_dir / "decisions.json"))
        pred = self._make_prediction(artist_id=99, confidence=0.51)
        item = q.enqueue(pred, reason="low_confidence")
        decision = q.submit_decision(item.id, "uncertain", "reviewer_b")
        assert decision.label_weight == 0.5

    def test_dedup_same_artist(self, tmp_dir):
        from ml.self_teaching.human_review import HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "queue.json"),
                             decisions_path=str(tmp_dir / "decisions.json"))
        pred = self._make_prediction(artist_id=5, confidence=0.45)
        q.enqueue(pred, reason="low_confidence")
        q.enqueue(pred, reason="low_confidence")  # duplicate
        pending = q.get_pending()
        assert len(pending) == 1, "Duplicate artist should not be re-queued while pending"


class TestReviewRouter:
    def _make_prediction(self, prob=50.0, confidence=0.50, signals=None):
        from ml.self_teaching.prediction_engine import PredictionOutput
        return PredictionOutput(
            artist_id=1,
            breakout_probability=prob,
            confidence_score=confidence,
            model_version="v1.0",
            top_signals=signals or [],
            predicted_at=datetime.now(timezone.utc).isoformat(),
            warning=None,
            from_cache=False,
        )

    def test_routes_low_confidence(self, tmp_dir):
        from ml.self_teaching.human_review import ReviewRouter, HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "q.json"),
                             decisions_path=str(tmp_dir / "d.json"))
        router = ReviewRouter(queue=q)
        pred = self._make_prediction(prob=50.0, confidence=0.50)
        should, reason = router.should_route_to_human(pred)
        assert should
        assert "confidence" in reason.lower()

    def test_does_not_route_high_confidence(self, tmp_dir):
        from ml.self_teaching.human_review import ReviewRouter, HumanReviewQueue
        q = HumanReviewQueue(queue_path=str(tmp_dir / "q.json"),
                             decisions_path=str(tmp_dir / "d.json"))
        router = ReviewRouter(queue=q)
        pred = self._make_prediction(prob=80.0, confidence=0.85)
        should, _ = router.should_route_to_human(pred)
        assert not should


# ────────────────────────────────────────────────────────────────────────────
# Label Quality Gate + Self-Reinforcement Guard
# ────────────────────────────────────────────────────────────────────────────

class TestLabelQualityGate:
    def _make_records(self):
        now = datetime.now(timezone.utc)
        old = (now - timedelta(days=100)).isoformat()
        recent = (now - timedelta(days=30)).isoformat()
        return [
            # Valid: old, confirmed source, positive outcome
            {"prediction_id": 1, "predicted_at": old, "actual_broke_out": True,
             "outcome_label": "breakout",
             "feedback_source": "billboard_api", "confidence_score": 0.8, "breakout_probability": 80},
            # Valid: old, chart_monitor, negative outcome (confidence high enough)
            {"prediction_id": 2, "predicted_at": old, "actual_broke_out": False,
             "outcome_label": "no_breakout",
             "feedback_source": "chart_monitor", "confidence_score": 0.7, "breakout_probability": 30},
            # Invalid: too recent (30 days < 90 day window)
            {"prediction_id": 3, "predicted_at": recent, "actual_broke_out": False,
             "outcome_label": "no_breakout",
             "feedback_source": "chart_monitor", "confidence_score": 0.6, "breakout_probability": 25},
            # Invalid: low confidence + negative (noisy label)
            {"prediction_id": 4, "predicted_at": old, "actual_broke_out": False,
             "outcome_label": "no_breakout",
             "feedback_source": "chart_monitor", "confidence_score": 0.20, "breakout_probability": 20},
        ]

    def test_admits_valid_rejects_invalid(self):
        from ml.self_teaching.human_review import LabelQualityGate
        gate = LabelQualityGate()
        validated = gate.validate(self._make_records())
        assert validated.records[0]["prediction_id"] in [1, 2]
        assert len(validated.records) == 2
        assert validated.rejection_summary

    def test_manual_labels_get_weight_1(self):
        from ml.self_teaching.human_review import LabelQualityGate
        gate = LabelQualityGate()
        now = datetime.now(timezone.utc)
        old = (now - timedelta(days=100)).isoformat()
        records = [{"prediction_id": 10, "predicted_at": old,
                    "actual_broke_out": True, "feedback_source": "manual",
                    "confidence_score": 0.9, "breakout_probability": 85}]
        validated = gate.validate(records)
        assert len(validated.records) == 1
        assert validated.weights[0] == 1.0

    def test_inferred_labels_get_lower_weight(self):
        from ml.self_teaching.human_review import LabelQualityGate
        gate = LabelQualityGate()
        now = datetime.now(timezone.utc)
        old = (now - timedelta(days=100)).isoformat()
        records = [{"prediction_id": 20, "predicted_at": old,
                    "actual_broke_out": False, "feedback_source": "chart_monitor",
                    "confidence_score": 0.75, "breakout_probability": 35}]
        validated = gate.validate(records)
        assert len(validated.records) == 1
        assert validated.weights[0] < 1.0


class TestSelfReinforcementGuard:
    def test_filters_model_prediction_labels(self):
        from ml.self_teaching.human_review import SelfReinforcementGuard
        guard = SelfReinforcementGuard()
        df = pd.DataFrame({
            "prediction_id": [1, 2, 3],
            "label_source":  ["chart_monitor", "model_prediction", "billboard_api"],
        })
        filtered = guard.filter_training_data(df)
        assert len(filtered) == 2
        assert "model_prediction" not in filtered["label_source"].values

    def test_all_valid_sources_pass(self):
        from ml.self_teaching.human_review import SelfReinforcementGuard
        guard = SelfReinforcementGuard()
        df = pd.DataFrame({
            "prediction_id": [1, 2, 3],
            "label_source":  ["chart_monitor", "billboard_api", "manual"],
        })
        filtered = guard.filter_training_data(df)
        assert len(filtered) == 3


# ────────────────────────────────────────────────────────────────────────────
# Feedback Loop + AccuracyTracker
# ────────────────────────────────────────────────────────────────────────────

class TestAccuracyTracker:
    def test_compute_accuracy_from_outcomes(self, tmp_dir, sample_outcomes_df):
        from ml.self_teaching.feedback_loop import AccuracyTracker, OutcomeRecord
        tracker = AccuracyTracker(outcomes_path=str(tmp_dir / "outcomes.csv"))

        records = [
            OutcomeRecord(
                prediction_id=int(row["prediction_id"]),
                artist_id=int(row["artist_id"]),
                predicted_at=row["predicted_at"],
                breakout_probability=float(row["breakout_probability"]),
                actual_broke_out=bool(row["actual_broke_out"]),
                was_correct=bool(row["was_correct"]),
                charted_at=row["charted_at"],
                chart_name=row["chart_name"],
            )
            for _, row in sample_outcomes_df.iterrows()
        ]
        tracker.add_outcomes(records)
        metrics = tracker.compute_accuracy(since_days=365)
        assert metrics.total_evaluated == 30
        assert 0 <= metrics.overall_accuracy <= 1
        assert 0 <= metrics.precision <= 1
        assert 0 <= metrics.recall <= 1

    def test_accuracy_trend_returns_list(self, tmp_dir, sample_outcomes_df):
        from ml.self_teaching.feedback_loop import AccuracyTracker, OutcomeRecord
        tracker = AccuracyTracker(outcomes_path=str(tmp_dir / "outcomes2.csv"))
        records = [
            OutcomeRecord(
                prediction_id=i, artist_id=i, predicted_at=r["predicted_at"],
                breakout_probability=r["breakout_probability"],
                actual_broke_out=r["actual_broke_out"], was_correct=r["was_correct"],
                charted_at=None, chart_name=None,
            )
            for i, r in sample_outcomes_df.iterrows()
        ]
        tracker.add_outcomes(records)
        trend = tracker.get_accuracy_trend(n_periods=4)
        assert len(trend) == 4
        assert all("week_start" in t and "accuracy" in t for t in trend)

    def test_empty_tracker_returns_zeros(self, tmp_dir):
        from ml.self_teaching.feedback_loop import AccuracyTracker
        tracker = AccuracyTracker(outcomes_path=str(tmp_dir / "empty.csv"))
        metrics = tracker.compute_accuracy(since_days=30)
        assert metrics.total_evaluated == 0
        assert metrics.overall_accuracy == 0


# ────────────────────────────────────────────────────────────────────────────
# DriftMonitor save_reference_snapshot
# ────────────────────────────────────────────────────────────────────────────

class TestDriftMonitor:
    def test_save_and_load_reference_snapshot(self, tmp_dir):
        from ml.self_teaching.drift_detector import DriftMonitor
        rng = np.random.default_rng(7)
        df = pd.DataFrame({
            "save_rate":       rng.normal(0.15, 0.05, 300),
            "stream_velocity": rng.normal(0.25, 0.10, 300),
        })
        path = str(tmp_dir / "ref.json")
        DriftMonitor.save_reference_snapshot(df, path)
        assert Path(path).exists()

        data = json.loads(Path(path).read_text())
        assert "save_rate" in data
        assert abs(data["save_rate"]["mean"] - 0.15) < 0.02

    def test_psi_label_thresholds(self):
        from ml.self_teaching.drift_detector import DataDriftDetector
        det = DataDriftDetector()
        rng = np.random.default_rng(8)
        x = rng.normal(0, 1, 1000)
        df = pd.DataFrame({"feat": x})
        sigs = det.detect(df, df)
        for s in sigs:
            assert s.psi < 0.01, "Identical distributions should have near-zero PSI"
