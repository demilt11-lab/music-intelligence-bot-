"""
Integration tests for pipeline idempotency.

Verifies that running the same data through the ML pipeline multiple times
produces identical results (deterministic feature engineering, stable predictions).
"""

import pytest
import pandas as pd
import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _base_rows(n: int = 5) -> list[dict]:
    rows = []
    for i in range(n):
        rows.append({
            "artist_id": i + 1,
            "prediction_date": "2024-06-01",
            "release_date": "2024-04-01",
            "computed_at": "2024-05-28",
            "streams_week1": 100_000 + i * 10_000,
            "streams_week2": 128_000 + i * 10_000,
            "streams_week3": 150_000 + i * 10_000,
            "saves_week2": 18_000,
            "followers_week1": 50_000,
            "followers_week2": 55_000,
            "new_followers_week1": 2_000,
            "unique_listeners_week1": 40_000,
            "tiktok_videos_week1": 12,
            "tiktok_videos_week2": 45,
            "first_tiktok_viral_date": None,
            "skip_rate": 0.20,
            "streams_reaching_100pct": 64_000,
            "pre_saves": 5_000,
            "algo_streams": 60_000,
            "playlist_streams": 40_000,
            "total_streams": 128_000,
            "youtube_views": 0,
            "playlist_addition_rate": 0.05,
            "radio_stations_week1": 10,
            "radio_stations_week2": 15,
        })
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Feature Engineering Idempotency
# ─────────────────────────────────────────────────────────────────────────────

class TestFeatureEngineerIdempotency:

    def test_fit_transform_twice_same_result(self):
        from ml.features.engineer import FeatureEngineer
        df = pd.DataFrame(_base_rows())
        fe1 = FeatureEngineer()
        fe2 = FeatureEngineer()
        out1 = fe1.fit_transform(df.copy())
        out2 = fe2.fit_transform(df.copy())
        pd.testing.assert_frame_equal(
            out1.reset_index(drop=True),
            out2.reset_index(drop=True),
            check_dtype=False,
        )

    def test_same_instance_repeated_same_result(self):
        from ml.features.engineer import FeatureEngineer
        df = pd.DataFrame(_base_rows())
        fe = FeatureEngineer()
        out1 = fe.fit_transform(df.copy())
        out2 = fe.fit_transform(df.copy())
        numeric1 = out1.select_dtypes(include="number")
        numeric2 = out2.select_dtypes(include="number")
        pd.testing.assert_frame_equal(
            numeric1.reset_index(drop=True),
            numeric2.reset_index(drop=True),
        )

    def test_row_order_does_not_affect_individual_values(self):
        from ml.features.engineer import FeatureEngineer
        rows = _base_rows(4)
        df_orig = pd.DataFrame(rows)
        df_rev = pd.DataFrame(rows[::-1])
        fe = FeatureEngineer()
        out_orig = fe.fit_transform(df_orig).sort_values("artist_id").reset_index(drop=True)
        out_rev = fe.fit_transform(df_rev).sort_values("artist_id").reset_index(drop=True)
        for col in ("save_rate", "stream_velocity", "ugc_growth_rate"):
            if col in out_orig.columns:
                np.testing.assert_array_almost_equal(
                    out_orig[col].values, out_rev[col].values, decimal=6
                )

    def test_extra_columns_in_input_are_ignored(self):
        from ml.features.engineer import FeatureEngineer
        rows = _base_rows(2)
        df_plain = pd.DataFrame(rows)
        df_extra = df_plain.copy()
        df_extra["extra_col_xyz"] = 999
        fe = FeatureEngineer()
        out_plain = fe.fit_transform(df_plain)
        out_extra = fe.fit_transform(df_extra)
        shared_cols = [c for c in out_plain.columns if c in out_extra.columns]
        pd.testing.assert_frame_equal(
            out_plain[shared_cols].reset_index(drop=True),
            out_extra[shared_cols].reset_index(drop=True),
            check_dtype=False,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Rule-Based Scorer Idempotency
# ─────────────────────────────────────────────────────────────────────────────

class TestScorerIdempotency:

    def _signals(self, **overrides):
        s = {
            "save_rate": 0.18,
            "stream_velocity": 0.28,
            "tiktok_growth": 0.45,
            "follower_growth": 0.10,
            "playlist_rate": 0.08,
            "ugc_count": 50,
            "chart_rank": 45,
            "radio_stations": 23,
        }
        s.update(overrides)
        return s

    def test_same_signals_same_score(self):
        from ml.models.rules.rule_based_scorer import RuleBasedScorer
        scorer = RuleBasedScorer()
        s = self._signals()
        r1 = scorer.score(s)
        r2 = scorer.score(s)
        assert r1.score == r2.score

    def test_score_stable_across_instances(self):
        from ml.models.rules.rule_based_scorer import RuleBasedScorer
        s = self._signals()
        r1 = RuleBasedScorer().score(s)
        r2 = RuleBasedScorer().score(s)
        assert r1.score == r2.score

    def test_independent_calls_do_not_accumulate_state(self):
        from ml.models.rules.rule_based_scorer import RuleBasedScorer
        scorer = RuleBasedScorer()
        s = self._signals()
        scores = [scorer.score(s).score for _ in range(5)]
        assert len(set(scores)) == 1, "Scorer accumulated state across calls"


# ─────────────────────────────────────────────────────────────────────────────
# Prediction Engine Idempotency (no model)
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictionIdempotency:

    def test_same_input_same_probability(self):
        from ml.self_teaching.prediction_engine import BreakoutPredictor
        p = BreakoutPredictor(store_dir="/tmp/nonexistent_store_qa_idempotency")
        features = {"save_rate": 0.18, "stream_velocity": 0.28}
        r1 = p.predict(1, features)
        # Flush the cache to force a fresh compute
        p._cache.invalidate("1")
        r2 = p.predict(1, features)
        assert r1.breakout_probability == r2.breakout_probability

    def test_batch_consistent_with_single(self):
        from ml.self_teaching.prediction_engine import BreakoutPredictor
        p = BreakoutPredictor(store_dir="/tmp/nonexistent_store_qa_idempotency2")
        features = {"save_rate": 0.18, "stream_velocity": 0.28}
        single = p.predict(99, features)
        p._cache.clear()
        batch = p.predict_batch([{"artist_id": 99, "features": features}])
        assert single.breakout_probability == batch[0].breakout_probability


# ─────────────────────────────────────────────────────────────────────────────
# Validator Idempotency
# ─────────────────────────────────────────────────────────────────────────────

class TestValidatorIdempotency:
    """Python mirror of TypeScript validateArtistMetrics — applied twice yields same result."""

    def _validate(self, m: dict) -> list[str]:
        violations = []
        aid = m.get("artistId")
        if not (isinstance(aid, int) and aid > 0):
            violations.append("artistId must be a positive integer")
        sv = m.get("streamVelocity")
        if sv is not None and not (-1 <= sv <= 100):
            violations.append("streamVelocity out of range [-1, 100]")
        sr = m.get("saveRate")
        if sr is not None and not (0 <= sr <= 1):
            violations.append("saveRate out of range [0, 1]")
        return violations

    def test_valid_record_validates_identically_twice(self):
        m = {"artistId": 42, "streamVelocity": 0.28, "saveRate": 0.18}
        assert self._validate(m) == self._validate(m)

    def test_invalid_record_same_violations_twice(self):
        m = {"artistId": -1, "streamVelocity": 200.0}
        v1 = self._validate(m)
        v2 = self._validate(m)
        assert v1 == v2

    def test_valid_then_mutated_detects_new_violation(self):
        m = {"artistId": 1, "streamVelocity": 0.5, "saveRate": 0.2}
        assert self._validate(m) == []
        m["saveRate"] = 5.0  # now invalid
        assert len(self._validate(m)) > 0
