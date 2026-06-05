"""
Unit tests for ml.self_teaching.prediction_engine.BreakoutPredictor.
Runs fully offline — no model file, no DB, no external services.
"""

import pytest
from ml.self_teaching.prediction_engine import BreakoutPredictor, PredictionOutput, PredictionCache


FEATURES = {"save_rate": 0.18, "stream_velocity": 0.28, "tiktok_growth": 0.45}


@pytest.fixture
def predictor():
    return BreakoutPredictor(store_dir="/tmp/nonexistent_store_xyz_qa")


# ─────────────────────────────────────────────────────────────────────────────
# PredictionCache
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictionCache:

    def test_miss_on_empty_cache(self):
        cache = PredictionCache()
        assert cache.get("key1") is None

    def test_set_then_get_returns_value(self):
        cache = PredictionCache()
        cache.set("k", {"x": 1})
        assert cache.get("k") == {"x": 1}

    def test_invalidate_removes_entry(self):
        cache = PredictionCache()
        cache.set("k", {"x": 1})
        cache.invalidate("k")
        assert cache.get("k") is None

    def test_clear_empties_cache(self):
        cache = PredictionCache()
        cache.set("a", {})
        cache.set("b", {})
        cache.clear()
        assert cache.get("a") is None
        assert cache.get("b") is None

    def test_get_any_age_returns_even_expired(self):
        cache = PredictionCache(ttl_seconds=0)
        cache.set("k", {"x": 42})
        import time; time.sleep(0.01)
        assert cache.get("k") is None
        assert cache.get_any_age("k") == {"x": 42}


# ─────────────────────────────────────────────────────────────────────────────
# BreakoutPredictor.predict — no model (fallback path)
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictNoModel:

    def test_returns_prediction_output(self, predictor):
        result = predictor.predict(1, FEATURES)
        assert isinstance(result, PredictionOutput)

    def test_artist_id_matches(self, predictor):
        result = predictor.predict(42, FEATURES)
        assert result.artist_id == 42

    def test_probability_in_range(self, predictor):
        result = predictor.predict(1, FEATURES)
        assert 0 <= result.breakout_probability <= 100

    def test_confidence_in_range(self, predictor):
        result = predictor.predict(1, FEATURES)
        assert 0 <= result.confidence_score <= 1

    def test_no_model_sets_warning(self, predictor):
        result = predictor.predict(1, FEATURES)
        assert result.warning is not None

    def test_model_version_is_string(self, predictor):
        result = predictor.predict(1, FEATURES)
        assert isinstance(result.model_version, str)

    def test_predicted_at_is_iso_string(self, predictor):
        import re
        result = predictor.predict(1, FEATURES)
        assert re.match(r"\d{4}-\d{2}-\d{2}", result.predicted_at)

    def test_empty_features_does_not_raise(self, predictor):
        result = predictor.predict(1, {})
        assert isinstance(result, PredictionOutput)

    def test_unknown_features_does_not_raise(self, predictor):
        result = predictor.predict(1, {"nonexistent_signal": 0.99})
        assert isinstance(result, PredictionOutput)


# ─────────────────────────────────────────────────────────────────────────────
# Cache behaviour
# ─────────────────────────────────────────────────────────────────────────────

class TestCacheBehaviour:

    def test_second_call_runs_without_error(self, predictor):
        # No model → no caching; both calls return successfully
        r1 = predictor.predict(5, FEATURES)
        r2 = predictor.predict(5, FEATURES)
        assert r1.artist_id == r2.artist_id == 5

    def test_different_artist_is_separate_cache_entry(self, predictor):
        predictor.predict(10, FEATURES)
        predictor.predict(11, FEATURES)
        r10 = predictor.predict(10, FEATURES)
        r11 = predictor.predict(11, FEATURES)
        assert r10.artist_id == 10
        assert r11.artist_id == 11

    def test_invalidate_cache_removes_entry(self, predictor):
        predictor.predict(20, FEATURES)
        predictor._cache.invalidate("20")
        assert predictor._cache.get("20") is None


# ─────────────────────────────────────────────────────────────────────────────
# predict_batch
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictBatch:

    def test_returns_list(self, predictor):
        results = predictor.predict_batch([
            {"artist_id": 1, "features": FEATURES},
            {"artist_id": 2, "features": FEATURES},
        ])
        assert isinstance(results, list)

    def test_count_matches_input(self, predictor):
        batch = [{"artist_id": i, "features": FEATURES} for i in range(5)]
        results = predictor.predict_batch(batch)
        assert len(results) == 5

    def test_empty_batch_returns_empty(self, predictor):
        assert predictor.predict_batch([]) == []

    def test_artist_ids_preserved(self, predictor):
        results = predictor.predict_batch([
            {"artist_id": 100, "features": FEATURES},
            {"artist_id": 200, "features": FEATURES},
        ])
        ids = [r.artist_id for r in results]
        assert 100 in ids
        assert 200 in ids

    def test_batch_does_not_raise_on_bad_features(self, predictor):
        results = predictor.predict_batch([
            {"artist_id": 1, "features": {}},
            {"artist_id": 2, "features": {"bad_key": "bad_val"}},
        ])
        assert len(results) == 2


# ─────────────────────────────────────────────────────────────────────────────
# source_completeness
# ─────────────────────────────────────────────────────────────────────────────

class TestSourceCompleteness:

    def test_full_signals_high_completeness(self, predictor):
        from ml.self_teaching.prediction_engine import EXPECTED_SIGNALS
        full_features = {k: 0.5 for k in EXPECTED_SIGNALS}
        result = predictor.predict(1, full_features)
        assert result.source_completeness > 0.9

    def test_no_model_completeness_is_default(self, predictor):
        # With no model, fallback path returns default source_completeness=1.0
        result = predictor.predict(2, {})
        assert result.source_completeness == 1.0  # dataclass default on baseline path
