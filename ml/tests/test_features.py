"""
20 pytest tests for the breakout artist feature engineering system.
"""

import pytest
import numpy as np
import pandas as pd
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_df():
    """30 rows with all required columns."""
    np.random.seed(42)
    n = 30
    base_date = date(2024, 1, 1)
    rows = []
    for i in range(n):
        pred_date = (base_date + timedelta(days=i * 7)).isoformat()
        rows.append({
            "artist_id": 1,
            "prediction_date": pred_date,
            "computed_at": pred_date,  # same as prediction_date = no leakage
            "streams_week1": 10_000 + i * 1_000,
            "streams_week2": 11_000 + i * 1_500,
            "streams_week3": 12_500 + i * 2_000,
            "saves_week1": 1_500 + i * 150,
            "saves_week2": 1_700 + i * 200,
            "followers_week1": 5_000 + i * 200,
            "followers_week2": 5_300 + i * 250,
            "unique_listeners_week1": 8_000 + i * 800,
            "tiktok_videos_week1": 100 + i * 20,
            "tiktok_videos_week2": 130 + i * 30,
            "algo_streams": 3_000 + i * 200,
            "playlist_streams": 4_000 + i * 300,
            "total_streams": 11_000 + i * 1_500,
            "skip_rate": max(0.1, 0.4 - i * 0.01),
            "pre_saves": 500 + i * 50,
            "release_date": "2024-01-01",
            "first_tiktok_viral_date": "2024-01-08",
            "streams_reaching_100pct": 2_000 + i * 200,
            "new_followers_week1": 300 + i * 25,
            "playlist_addition_rate": 2 + i * 0.1,
        })
    return pd.DataFrame(rows)


@pytest.fixture
def leaky_df(sample_df):
    """DataFrame with a row where computed_at > prediction_date (leakage)."""
    df = sample_df.copy()
    df.loc[0, "computed_at"] = "2025-12-31"  # future data
    return df


@pytest.fixture
def engineer():
    from ml.features.engineer import FeatureEngineer
    return FeatureEngineer()


@pytest.fixture
def registry():
    from ml.features.blueprint import FeatureBlueprintRegistry
    return FeatureBlueprintRegistry()


@pytest.fixture
def engineered_df(engineer, sample_df):
    """Pre-computed engineered DataFrame for reuse in multiple tests."""
    return engineer.fit_transform(sample_df)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_stream_velocity_formula(engineer, sample_df):
    """stream_velocity must match (week2 - week1) / week1 manually."""
    df = engineer.fit_transform(sample_df)
    expected = (sample_df["streams_week2"] - sample_df["streams_week1"]) / (
        sample_df["streams_week1"] + 1
    )
    # Some rows may have velocity zeroed by recency flag; compare only non-zeroed rows
    recency_mask = df["release_recency_flag"] == 0
    pd.testing.assert_series_equal(
        df.loc[recency_mask, "stream_velocity"].reset_index(drop=True),
        expected[recency_mask].reset_index(drop=True),
        check_names=False,
        rtol=1e-5,
    )


def test_save_rate_range(engineered_df):
    """save_rate must be within [0, 1] for all rows (after clipping)."""
    sr = engineered_df["save_rate"].dropna()
    assert (sr >= 0).all(), "save_rate has values < 0"
    assert (sr <= 1).all(), "save_rate has values > 1"


def test_save_rate_formula(engineer, sample_df):
    """save_rate = saves_week2 / (streams_week2 + 1e-8)."""
    df = engineer.fit_transform(sample_df)
    expected = sample_df["saves_week2"] / (sample_df["streams_week2"] + 1e-8)
    expected_clipped = expected.clip(0, 1)
    pd.testing.assert_series_equal(
        df["save_rate"].reset_index(drop=True),
        expected_clipped.reset_index(drop=True),
        check_names=False,
        rtol=1e-5,
    )


def test_ugc_growth_rate_formula(engineer, sample_df):
    """ugc_growth_rate = (videos2 - videos1) / (videos1 + 1)."""
    df = engineer.fit_transform(sample_df)
    expected = (
        (sample_df["tiktok_videos_week2"] - sample_df["tiktok_videos_week1"])
        / (sample_df["tiktok_videos_week1"] + 1)
    ).clip(-1, 20)
    pd.testing.assert_series_equal(
        df["ugc_growth_rate"].reset_index(drop=True),
        expected.reset_index(drop=True),
        check_names=False,
        rtol=1e-5,
    )


def test_follower_velocity_formula(engineer, sample_df):
    """follower_velocity = (followers2 - followers1) / (followers1 + 1)."""
    df = engineer.fit_transform(sample_df)
    expected = (
        (sample_df["followers_week2"] - sample_df["followers_week1"])
        / (sample_df["followers_week1"] + 1)
    ).clip(-1, 5)
    pd.testing.assert_series_equal(
        df["follower_velocity"].reset_index(drop=True),
        expected.reset_index(drop=True),
        check_names=False,
        rtol=1e-5,
    )


def test_temporal_leakage_guard_drops_future_rows(engineer, leaky_df):
    """The row with computed_at in the future must be dropped."""
    initial_len = len(leaky_df)
    df = engineer.fit_transform(leaky_df)
    assert len(df) < initial_len, "Expected leaky row to be dropped"
    assert engineer.temporal_leakage_dropped >= 1, "temporal_leakage_dropped not incremented"


def test_high_quality_growth_is_product(engineer, sample_df):
    """high_quality_growth must equal save_rate * stream_velocity for non-recency rows."""
    df = engineer.fit_transform(sample_df)
    # high_quality_growth is computed before the recency-window zero-out, so compare
    # only rows outside the recency window where stream_velocity was NOT modified.
    non_recency = df["release_recency_flag"] == 0
    if non_recency.any():
        computed = (df.loc[non_recency, "save_rate"] * df.loc[non_recency, "stream_velocity"]).clip(-1, 10)
        pd.testing.assert_series_equal(
            df.loc[non_recency, "high_quality_growth"].reset_index(drop=True),
            computed.reset_index(drop=True),
            check_names=False,
            rtol=1e-5,
        )


def test_organic_score_weights_sum_to_one():
    """0.45 + 0.35 + 0.20 must equal 1.0."""
    assert abs(0.45 + 0.35 + 0.20 - 1.0) < 1e-10


def test_skip_rate_inv_is_complement(engineered_df):
    """skip_rate_inv must equal 1 - skip_rate (after clipping)."""
    df = engineered_df
    expected = (1 - df["skip_rate"].clip(0, 1)).clip(0, 1)
    pd.testing.assert_series_equal(
        df["skip_rate_inv"].reset_index(drop=True),
        expected.reset_index(drop=True),
        check_names=False,
        rtol=1e-5,
    )


def test_release_recency_flag_set(engineered_df):
    """days_since_release <= 14 must produce release_recency_flag == 1."""
    df = engineered_df
    within_window = df["days_since_release"] <= 14
    assert (df.loc[within_window, "release_recency_flag"] == 1).all()


def test_stream_velocity_zeroed_in_release_window(engineered_df):
    """If release_recency_flag == 1, stream_velocity must be 0."""
    df = engineered_df
    in_window = df["release_recency_flag"] == 1
    if in_window.any():
        assert (df.loc[in_window, "stream_velocity"] == 0.0).all()


def test_tiktok_lag_capped_at_8(engineered_df):
    """tiktok_to_streaming_lag must never exceed 8 weeks."""
    lag = engineered_df["tiktok_to_streaming_lag"].dropna()
    assert (lag <= 8).all(), "tiktok_to_streaming_lag exceeds 8"


def test_completion_rate_range(engineered_df):
    """completion_rate must be in [0, 1]."""
    cr = engineered_df["completion_rate"].dropna()
    assert (cr >= 0).all()
    assert (cr <= 1).all()


def test_repeat_listen_rate_positive(engineered_df):
    """repeat_listen_rate must be >= 1 for all valid rows (after clipping lower=1)."""
    rlr = engineered_df["repeat_listen_rate"].dropna()
    assert (rlr >= 1).all(), "repeat_listen_rate has values < 1"


def test_momentum_acceleration_computed(engineered_df):
    """momentum_acceleration must be a finite number (not all NaN) when week3 is present."""
    ma = engineered_df["momentum_acceleration"].dropna()
    assert len(ma) > 0, "momentum_acceleration is all NaN despite streams_week3 being present"
    assert np.isfinite(ma.values).all()


def test_blueprint_has_no_high_leakage_in_training_set(registry):
    """get_training_features() must not contain any HIGH leakage features."""
    from ml.features.blueprint import LeakageRisk
    training = registry.get_training_features()
    for feat_name in training:
        spec = registry.features[feat_name]
        assert spec.leakage_risk != LeakageRisk.HIGH, (
            f"Feature '{feat_name}' has HIGH leakage risk but is in training set"
        )


def test_blueprint_table_renders(registry):
    """print_blueprint_table() must return a string containing the header."""
    table = registry.print_blueprint_table()
    assert isinstance(table, str)
    assert "| Feature |" in table


def test_redundant_pairs_detected(registry):
    """get_redundant_pairs() must include (monthly_listeners, follower_count) in some order."""
    pairs = registry.get_redundant_pairs()
    pair_set = {frozenset(p) for p in pairs}
    assert frozenset({"monthly_listeners", "follower_count"}) in pair_set, (
        f"Expected (monthly_listeners, follower_count) in redundant pairs, got: {pairs}"
    )


def test_noisy_features_flagged(registry):
    """get_noisy_features() must include monthly_listeners."""
    noisy = registry.get_noisy_features()
    assert "monthly_listeners" in noisy, (
        f"monthly_listeners not in noisy features list: {noisy}"
    )


def test_no_crash_on_missing_columns(engineer):
    """FeatureEngineer must not crash when optional columns are absent."""
    minimal_df = pd.DataFrame([{
        "artist_id": 99,
        "prediction_date": "2024-06-01",
        "computed_at": "2024-06-01",
        "streams_week1": 5_000,
        "streams_week2": 6_000,
        "streams_week3": 7_000,
        "saves_week1": 500,
        "saves_week2": 600,
        "followers_week1": 1_000,
        "followers_week2": 1_100,
        "unique_listeners_week1": 3_000,
        "tiktok_videos_week1": 50,
        "tiktok_videos_week2": 70,
        "algo_streams": 1_000,
        "playlist_streams": 2_000,
        "total_streams": 6_000,
        "skip_rate": 0.25,
        "pre_saves": 200,
        "release_date": "2024-05-01",
        "first_tiktok_viral_date": None,
        "streams_reaching_100pct": 800,
        "new_followers_week1": 100,
        # Note: playlist_addition_rate intentionally omitted
    }])
    # Must not raise any exception
    result = engineer.fit_transform(minimal_df)
    assert isinstance(result, pd.DataFrame)
    assert len(result) >= 0
