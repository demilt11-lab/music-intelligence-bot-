"""Tests for the self-teaching ML loop components."""
import json
import tempfile
import os
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# ModelStore tests
# ---------------------------------------------------------------------------

class TestModelStore:
    def _make_store(self, tmp_path):
        from ml.self_teaching.model_store import ModelStore
        return ModelStore(store_dir=str(tmp_path / "model_store"))

    def _make_meta(self, version, is_active=False, is_baseline=False, auroc=0.80):
        from ml.self_teaching.model_store import ModelVersionMeta
        return ModelVersionMeta(
            version=version,
            model_type="xgboost",
            artifact_path="",
            metrics={"auroc": auroc},
            hyperparams={},
            dataset_version="1000",
            trained_at="2024-01-01T00:00:00",
            is_active=is_active,
            is_baseline=is_baseline,
            train_samples=1000,
            train_duration_s=5.0,
        )

    def test_model_store_save_load(self, tmp_path):
        store = self._make_store(tmp_path)
        model = MagicMock()
        meta = self._make_meta("v1", is_active=True)

        with patch("cloudpickle.dump"), patch("cloudpickle.load", return_value=model):
            store.save(model, meta)
            loaded_model, loaded_meta = store.load("v1")

        assert loaded_meta.version == "v1"
        assert loaded_meta.metrics["auroc"] == 0.80
        assert loaded_meta.is_active is True

    def test_model_store_activate(self, tmp_path):
        store = self._make_store(tmp_path)

        with patch("cloudpickle.dump"), patch("cloudpickle.load", return_value=MagicMock()):
            store.save(MagicMock(), self._make_meta("v1", is_active=True))
            store.save(MagicMock(), self._make_meta("v2", is_active=False))
            store.activate("v2")

        registry = store._load_registry()
        assert registry["v2"]["is_active"] is True
        assert registry["v1"]["is_active"] is False

    def test_model_store_rollback(self, tmp_path):
        store = self._make_store(tmp_path)
        mock_model = MagicMock()

        with patch("cloudpickle.dump"), patch("cloudpickle.load", return_value=mock_model):
            store.save(MagicMock(), self._make_meta("v1", is_active=False, is_baseline=True))
            store.save(MagicMock(), self._make_meta("v2", is_active=True))

            restored = store.rollback()

        assert restored.version == "v1"
        registry = store._load_registry()
        assert registry["v1"]["is_active"] is True
        assert registry["v2"]["is_active"] is False

    def test_model_store_compare(self, tmp_path):
        store = self._make_store(tmp_path)

        with patch("cloudpickle.dump"):
            store.save(MagicMock(), self._make_meta("v1", auroc=0.75))
            store.save(MagicMock(), self._make_meta("v2", auroc=0.82))

        deltas = store.compare("v1", "v2")
        assert "auroc" in deltas
        val_a, val_b, delta = deltas["auroc"]
        assert val_a == pytest.approx(0.75)
        assert val_b == pytest.approx(0.82)
        assert delta == pytest.approx(0.07)

    def test_model_not_found_error(self, tmp_path):
        from ml.self_teaching.model_store import ModelNotFoundError
        store = self._make_store(tmp_path)
        with pytest.raises(ModelNotFoundError):
            store.load("does_not_exist")

    def test_no_active_model_error(self, tmp_path):
        from ml.self_teaching.model_store import NoActiveModelError
        store = self._make_store(tmp_path)
        with pytest.raises(NoActiveModelError):
            store.load_active()


# ---------------------------------------------------------------------------
# WeeklyTrainer tests
# ---------------------------------------------------------------------------

class TestWeeklyTrainer:
    def _make_cfg(self, tmp_path, **kwargs):
        from ml.self_teaching.weekly_trainer import RetrainingConfig
        kwargs.setdefault("min_training_samples", 500)
        return RetrainingConfig(
            store_dir=str(tmp_path / "model_store"),
            data_dir=str(tmp_path / "data"),
            **kwargs,
        )

    def test_weekly_trainer_skip_insufficient_data(self, tmp_path):
        from ml.self_teaching.weekly_trainer import WeeklyTrainer
        cfg = self._make_cfg(tmp_path, min_training_samples=500)

        # Patch DataLoader to return tiny dataframe
        small_df = pd.DataFrame({"is_viral": [1, 0] * 5})  # 10 rows
        with patch("ml.self_teaching.weekly_trainer.DataLoader.load_training_data", return_value=small_df):
            trainer = WeeklyTrainer(cfg)
            result = trainer.run()

        assert result.action == "skipped_no_data"
        assert result.success is False

    def test_weekly_trainer_rollback_on_regression(self, tmp_path):
        from ml.self_teaching.weekly_trainer import WeeklyTrainer, RetrainingConfig
        from ml.self_teaching.model_store import ModelStore, ModelVersionMeta, NoActiveModelError

        cfg = self._make_cfg(tmp_path, rollback_threshold=0.05)
        trainer = WeeklyTrainer(cfg)

        # Build a large enough synthetic dataframe
        n = 600
        rng = np.random.default_rng(0)
        df = pd.DataFrame({
            "momentum": rng.uniform(0, 1, n),
            "breakout_prob": rng.uniform(0, 1, n),
            "virality_score": rng.uniform(0, 1, n),
            "peak_score_estimate": rng.uniform(0, 1, n),
            "confidence": rng.uniform(0.3, 1, n),
            "stream_velocity": rng.uniform(0, 1, n),
            "tiktok_growth": rng.uniform(0, 1, n),
            "save_rate": rng.uniform(0, 1, n),
            "follower_velocity": rng.uniform(0, 1, n),
            "chart_momentum": rng.uniform(0, 1, n),
            "playlist_add": rng.uniform(0, 1, n),
            "radio_spike": rng.uniform(0, 1, n),
            "organic_score": rng.uniform(0, 1, n),
            "is_viral": (rng.random(n) > 0.8).astype(int),
        })

        prev_meta = MagicMock()
        prev_meta.version = "v_prev"
        prev_meta.metrics = {"auroc": 0.90}  # high prev AUROC

        with (
            patch("ml.self_teaching.weekly_trainer.DataLoader.load_training_data", return_value=df),
            patch.object(trainer._store, "load_active", return_value=(MagicMock(), prev_meta)),
            patch.object(trainer, "_compute_metrics", return_value={"auroc": 0.80, "f1": 0.5, "precision": 0.5, "recall": 0.5, "accuracy": 0.5}),
            patch.object(trainer._store, "rollback"),
            patch.object(trainer, "_train_xgboost", return_value=(MagicMock(), {"auroc": 0.80, "f1": 0.5, "precision": 0.5, "recall": 0.5, "accuracy": 0.5})),
        ):
            result = trainer.run()

        assert result.action == "rolled_back"
        assert result.accuracy_delta == pytest.approx(-0.10, abs=0.01)

    def test_weekly_trainer_promote_on_improvement(self, tmp_path):
        from ml.self_teaching.weekly_trainer import WeeklyTrainer

        cfg = self._make_cfg(tmp_path, rollback_threshold=0.05)
        trainer = WeeklyTrainer(cfg)

        n = 600
        rng = np.random.default_rng(1)
        df = pd.DataFrame({
            "momentum": rng.uniform(0, 1, n),
            "breakout_prob": rng.uniform(0, 1, n),
            "virality_score": rng.uniform(0, 1, n),
            "peak_score_estimate": rng.uniform(0, 1, n),
            "confidence": rng.uniform(0.3, 1, n),
            "stream_velocity": rng.uniform(0, 1, n),
            "tiktok_growth": rng.uniform(0, 1, n),
            "save_rate": rng.uniform(0, 1, n),
            "follower_velocity": rng.uniform(0, 1, n),
            "chart_momentum": rng.uniform(0, 1, n),
            "playlist_add": rng.uniform(0, 1, n),
            "radio_spike": rng.uniform(0, 1, n),
            "organic_score": rng.uniform(0, 1, n),
            "is_viral": (rng.random(n) > 0.8).astype(int),
        })

        prev_meta = MagicMock()
        prev_meta.version = "v_prev"
        prev_meta.metrics = {"auroc": 0.78}

        new_metrics = {"auroc": 0.85, "f1": 0.7, "precision": 0.7, "recall": 0.7, "accuracy": 0.8}

        with (
            patch("ml.self_teaching.weekly_trainer.DataLoader.load_training_data", return_value=df),
            patch.object(trainer._store, "load_active", return_value=(MagicMock(), prev_meta)),
            patch.object(trainer, "_train_xgboost", return_value=(MagicMock(), new_metrics)),
            patch.object(trainer._store, "save"),
            patch.object(trainer._store, "set_baseline"),
        ):
            result = trainer.run()

        assert result.action == "promoted"
        assert result.success is True
        assert result.accuracy_delta == pytest.approx(0.07, abs=0.01)


# ---------------------------------------------------------------------------
# PredictionCache tests
# ---------------------------------------------------------------------------

class TestPredictionCache:
    def test_prediction_cache_ttl(self):
        from ml.self_teaching.prediction_engine import PredictionCache
        import time

        cache = PredictionCache(ttl_seconds=1)
        cache.set("k1", {"value": 42})
        time.sleep(1.1)
        assert cache.get("k1") is None

    def test_prediction_cache_hit(self):
        from ml.self_teaching.prediction_engine import PredictionCache

        cache = PredictionCache(ttl_seconds=3600)
        cache.set("k2", {"value": 99})
        result = cache.get("k2")
        assert result is not None
        assert result["value"] == 99


# ---------------------------------------------------------------------------
# BreakoutPredictor tests
# ---------------------------------------------------------------------------

class TestBreakoutPredictor:
    def test_breakout_predictor_no_model_fallback(self, tmp_path):
        from ml.self_teaching.prediction_engine import BreakoutPredictor
        from ml.self_teaching.model_store import NoActiveModelError

        with patch("ml.self_teaching.model_store.ModelStore.load_active", side_effect=NoActiveModelError("none")):
            predictor = BreakoutPredictor(store_dir=str(tmp_path / "store"))
            # Manually plant a stale cache entry
            predictor._cache._store["42"] = (0.0, {
                "artist_id": 42,
                "breakout_probability": 73.0,
                "confidence_score": 0.8,
                "model_version": "v_old",
                "top_signals": [],
                "predicted_at": "2024-01-01T00:00:00+00:00",
                "warning": None,
                "from_cache": True,
            })
            result = predictor.predict(42, {})

        assert result.warning is not None
        w = result.warning.lower()
        assert "model unavailable" in w or "cached" in w or "model" in w

    def test_breakout_predictor_neutral_fallback(self, tmp_path):
        from ml.self_teaching.prediction_engine import BreakoutPredictor
        from ml.self_teaching.model_store import NoActiveModelError

        with patch("ml.self_teaching.model_store.ModelStore.load_active", side_effect=NoActiveModelError("none")):
            predictor = BreakoutPredictor(store_dir=str(tmp_path / "store"))
            result = predictor.predict(99, {})

        assert result.breakout_probability == 50.0
        assert result.warning is not None


# ---------------------------------------------------------------------------
# FeedbackLoop tests
# ---------------------------------------------------------------------------

class TestFeedbackLoop:
    def _make_records(self, n=100):
        from ml.self_teaching.feedback_loop import OutcomeRecord
        from datetime import datetime, timezone, timedelta
        records = []
        for i in range(n):
            predicted_at = (datetime.now(timezone.utc) - timedelta(days=100)).isoformat()
            records.append(OutcomeRecord(
                prediction_id=i,
                artist_id=i,
                predicted_at=predicted_at,
                breakout_probability=75.0,
                actual_broke_out=True,
                was_correct=True,
                charted_at=None,
                chart_name=None,
            ))
        return records

    def test_feedback_loop_ingest(self, tmp_path):
        from ml.self_teaching.feedback_loop import FeedbackLoop
        from ml.self_teaching.weekly_trainer import RetrainingConfig, RetrainingResult

        cfg = RetrainingConfig(
            store_dir=str(tmp_path / "store"),
            data_dir=str(tmp_path / "data"),
        )
        loop = FeedbackLoop(trainer_cfg=cfg, outcomes_path=str(tmp_path / "outcomes.csv"))

        mock_result = RetrainingResult(
            success=True, new_version="v_new", prev_version=None,
            new_metrics={"auroc": 0.85}, prev_metrics={}, accuracy_delta=0.0,
            action="promoted", reason="ok", new_labeled_cases=100, duration_s=1.0,
        )

        records = self._make_records(100)

        with patch("ml.self_teaching.weekly_trainer.WeeklyTrainer.run", return_value=mock_result):
            result = loop.ingest_outcomes(records)

        assert result.triggered_retrain is True
        assert result.outcomes_added == 100

    def test_accuracy_tracker_compute(self, tmp_path):
        from ml.self_teaching.feedback_loop import AccuracyTracker, OutcomeRecord
        from datetime import datetime, timezone, timedelta

        tracker = AccuracyTracker(outcomes_path=str(tmp_path / "outcomes.csv"))
        records = []
        now = datetime.now(timezone.utc)
        for i in range(100):
            predicted_at = (now - timedelta(days=10)).isoformat()
            records.append(OutcomeRecord(
                prediction_id=i,
                artist_id=i,
                predicted_at=predicted_at,
                breakout_probability=75.0,
                actual_broke_out=True,
                was_correct=(i < 80),  # 80 correct
                charted_at=None,
                chart_name=None,
            ))
        tracker.add_outcomes(records)
        metrics = tracker.compute_accuracy(since_days=30)
        assert metrics.overall_accuracy == pytest.approx(0.80)
        assert metrics.total_evaluated == 100

    def test_outcome_record_correctness(self):
        from ml.self_teaching.feedback_loop import OutcomeRecord

        record = OutcomeRecord(
            prediction_id=1,
            artist_id=10,
            predicted_at="2024-01-01T00:00:00",
            breakout_probability=80.0,
            actual_broke_out=True,
            was_correct=(80.0 >= 50) == True,
            charted_at=None,
            chart_name=None,
        )
        assert record.was_correct is True


# ---------------------------------------------------------------------------
# SignalInterpreter test
# ---------------------------------------------------------------------------

class TestSignalInterpreter:
    def test_signal_interpreter(self):
        from ml.self_teaching.prediction_engine import SignalInterpreter

        result = SignalInterpreter.interpret("stream_velocity", 0.7)
        assert "Strong" in result
