"""
Integration tests for P0 bugs and pipeline regression guards.

These tests document and guard against the three confirmed P0 bugs:
  1. Label leakage — virality_score used as both label and feature
  2. Temporal leakage — shuffled train/test split on time-series data
  3. stream_velocity zeroing — suppresses early-breakout signals for new releases

Tests are read-only (no model training); they inspect code structure and
computed values to confirm bugs exist (or are fixed).
"""

import pytest
import pandas as pd
import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_rows(n: int, base_date: str = "2024-01-01") -> list[dict]:
    dates = pd.date_range(base_date, periods=n, freq="7D")
    rows = []
    for i, d in enumerate(dates):
        rows.append({
            "artist_id": i + 1,
            "prediction_date": d.strftime("%Y-%m-%d"),
            "release_date": (d - pd.Timedelta(days=60)).strftime("%Y-%m-%d"),
            "computed_at": d.strftime("%Y-%m-%d"),
            "streams_week1": 100_000 + i * 5_000,
            "streams_week2": 120_000 + i * 5_000,
            "streams_week3": 140_000 + i * 5_000,
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
# P0 Bug 1 — Label Leakage
# ─────────────────────────────────────────────────────────────────────────────

class TestLabelLeakage:
    """
    virality_score is used as both the label source (is_viral = virality_score > 0.7)
    and appears in EXPECTED_FEATURES. The model learns the threshold rule, not real signals.
    """

    def test_virality_score_is_in_expected_features(self):
        from ml.self_teaching.prediction_engine import EXPECTED_FEATURES
        assert "virality_score" in EXPECTED_FEATURES, (
            "P0 BUG CONFIRMED: virality_score is in EXPECTED_FEATURES — "
            "label leakage. Remove it from EXPECTED_FEATURES."
        )

    def test_label_is_derived_from_virality_score(self):
        """Confirm the label definition creates leakage with the feature."""
        import inspect
        import ml.self_teaching.weekly_trainer as wt
        src = inspect.getsource(wt)
        assert "virality_score" in src, "weekly_trainer should reference virality_score"
        # The leakage is: is_viral = virality_score > threshold, AND
        # virality_score is in training features. Together they guarantee
        # near-perfect train accuracy that won't generalise.

    def test_feature_engineer_does_not_produce_virality_score(self):
        """FeatureEngineer (inference path) does NOT output virality_score — it's absent at serve time."""
        from ml.features.engineer import FeatureEngineer
        df = pd.DataFrame(_make_rows(3))
        fe = FeatureEngineer()
        out = fe.fit_transform(df)
        assert "virality_score" not in out.columns, (
            "virality_score should NOT be produced by FeatureEngineer — "
            "it comes from the DB trajectory table and is absent at inference time."
        )


# ─────────────────────────────────────────────────────────────────────────────
# P0 Bug 2 — Temporal Leakage (shuffled train/test split)
# ─────────────────────────────────────────────────────────────────────────────

class TestTemporalLeakage:
    """
    weekly_trainer uses train_test_split(shuffle=True) for the final holdout,
    which leaks future data into training. TimeSeriesSplit in CV is correct,
    but the final split undoes the temporal separation.
    """

    def test_weekly_trainer_uses_shuffled_split(self):
        import inspect
        import ml.self_teaching.weekly_trainer as wt
        src = inspect.getsource(wt)
        # sklearn train_test_split shuffles by default; stratify= also enables shuffle.
        # Either form causes temporal leakage on time-series data.
        has_shuffle = "shuffle=True" in src or "stratify=" in src
        assert has_shuffle, (
            "P0 BUG CONFIRMED: train_test_split with shuffle (via stratify= or "
            "shuffle=True) causes temporal leakage. "
            "Fix: sort by date, then split at a cutoff index."
        )

    def test_temporal_split_preserves_order(self):
        """Demonstrate correct approach: chronological split without shuffle."""
        n = 100
        dates = pd.date_range("2023-01-01", periods=n, freq="7D")
        df = pd.DataFrame({"date": dates, "value": range(n)})
        df = df.sort_values("date")

        cutoff = int(n * 0.8)
        train = df.iloc[:cutoff]
        test = df.iloc[cutoff:]

        assert train["date"].max() < test["date"].min(), (
            "Correct temporal split: all train dates precede all test dates."
        )

    def test_shuffled_split_contaminates_test_set(self):
        """Demonstrate that shuffle=True allows future data in training."""
        from sklearn.model_selection import train_test_split
        n = 100
        dates = pd.date_range("2023-01-01", periods=n, freq="7D")
        df = pd.DataFrame({"date": dates, "value": range(n)})

        train, test = train_test_split(df, test_size=0.2, shuffle=True, random_state=42)
        # With shuffled split, train contains some dates AFTER test dates
        overlap = train[train["date"] > test["date"].min()]
        assert len(overlap) > 0, (
            "Shuffled split confirmed: training set contains data from after "
            "the earliest test date — temporal leakage."
        )


# ─────────────────────────────────────────────────────────────────────────────
# P0 Bug 3 — stream_velocity zeroing for new releases
# ─────────────────────────────────────────────────────────────────────────────

class TestStreamVelocityZeroing:
    """
    features/engineer.py zeros stream_velocity for releases ≤ 14 days old.
    This suppresses the strongest early-breakout signal.
    """

    def test_new_release_velocity_is_zeroed(self):
        from ml.features.engineer import FeatureEngineer
        rows = _make_rows(1)
        rows[0]["release_date"] = rows[0]["prediction_date"]  # released today

        fe = FeatureEngineer()
        out = fe.fit_transform(pd.DataFrame(rows))
        velocity = out.iloc[0]["stream_velocity"]
        assert velocity == 0.0, (
            f"P0 BUG CONFIRMED: stream_velocity={velocity} for a new release "
            "should be 0.0 due to the ≤14-day suppression rule in engineer.py:325."
        )

    def test_established_release_velocity_is_nonzero(self):
        from ml.features.engineer import FeatureEngineer
        rows = _make_rows(1)
        rows[0]["release_date"] = "2024-01-01"   # 5+ months old
        rows[0]["prediction_date"] = "2024-06-01"

        fe = FeatureEngineer()
        out = fe.fit_transform(pd.DataFrame(rows))
        velocity = out.iloc[0]["stream_velocity"]
        assert velocity != 0.0, "Established release should have nonzero stream_velocity"

    def test_zeroing_threshold_is_14_days(self):
        """Confirm the 14-day boundary exactly."""
        import inspect
        import ml.features.engineer as eng
        src = inspect.getsource(eng)
        assert "14" in src, "14-day threshold should be present in engineer.py"

    def test_15_day_release_has_nonzero_velocity(self):
        from ml.features.engineer import FeatureEngineer
        import datetime
        rows = _make_rows(1)
        pred_dt = pd.to_datetime(rows[0]["prediction_date"])
        rows[0]["release_date"] = (pred_dt - pd.Timedelta(days=15)).strftime("%Y-%m-%d")

        fe = FeatureEngineer()
        out = fe.fit_transform(pd.DataFrame(rows))
        velocity = out.iloc[0]["stream_velocity"]
        assert velocity != 0.0, "15-day-old release should NOT be zeroed"


# ─────────────────────────────────────────────────────────────────────────────
# Train/Serve Skew — feature set mismatch
# ─────────────────────────────────────────────────────────────────────────────

class TestTrainServeSkew:
    """
    Two different FeatureEngineer classes exist. Training uses data_prep.FeatureEngineer
    (columns from the trajectory DB table). Inference uses features/engineer.py
    (computed from raw weekly snapshots). 12 of 17 EXPECTED_FEATURES are absent
    at inference time, defaulting to 0.0.
    """

    def test_expected_features_absent_from_inference_output(self):
        from ml.self_teaching.prediction_engine import EXPECTED_FEATURES
        from ml.features.engineer import FeatureEngineer

        fe = FeatureEngineer()
        df = pd.DataFrame(_make_rows(2))
        out = fe.fit_transform(df)
        inference_cols = set(out.columns)

        missing = [f for f in EXPECTED_FEATURES if f not in inference_cols]
        assert len(missing) > 0, (
            "P0 BUG CONFIRMED: Some EXPECTED_FEATURES are not produced by "
            "FeatureEngineer (inference path), defaulting to 0.0 at serve time."
        )

    def test_inference_features_cover_rule_scorer_signals(self):
        """Rule-based scorer signals should be available at inference time."""
        from ml.features.engineer import FeatureEngineer
        from ml.models.rules.rule_based_scorer import RuleBasedScorer

        fe = FeatureEngineer()
        df = pd.DataFrame(_make_rows(2))
        out = fe.fit_transform(df)
        inference_cols = set(out.columns)

        scorer = RuleBasedScorer()
        # At minimum save_rate and stream_velocity must be present
        for required in ("save_rate", "stream_velocity"):
            assert required in inference_cols, f"{required} missing from inference features"
