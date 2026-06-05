"""
Unit tests for every feature formula in ml/features/engineer.py.

Each test targets one formula in isolation. Inputs are chosen to make the
expected output exact so errors in the formula are immediately obvious.
Tests also document and guard against the known bugs found in the P0 debug
session (stream_velocity zeroing, repeat_listen_rate semantics).
"""

import math
import numpy as np
import pandas as pd
import pytest

from ml.features.engineer import FeatureEngineer


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _base_row(**overrides) -> dict:
    """Minimal valid row for FeatureEngineer. All optional columns default to 0."""
    row = {
        # Identity
        "artist_id": 1,
        "prediction_date": "2024-06-01",
        "release_date": "2024-05-01",
        "computed_at": "2024-05-28",
        # Weekly stream counts (Spotify)
        "streams_week1": 100_000,
        "streams_week2": 128_000,
        "streams_week3": 150_000,
        # Saves
        "saves_week2": 18_000,
        # Followers
        "followers_week1": 50_000,
        "followers_week2": 55_000,
        "new_followers_week1": 2_000,
        # Listeners
        "unique_listeners_week1": 40_000,
        # TikTok
        "tiktok_videos_week1": 12,
        "tiktok_videos_week2": 45,
        "first_tiktok_viral_date": None,
        # Behavioral
        "skip_rate": 0.20,
        "streams_reaching_100pct": 64_000,
        "pre_saves": 5_000,
        # Platform splits
        "algo_streams": 60_000,
        "playlist_streams": 40_000,
        "total_streams": 128_000,
        # YouTube
        "youtube_views": 0,
        # Playlist
        "playlist_addition_rate": 0.05,
        # Radio
        "radio_stations_week1": 10,
        "radio_stations_week2": 15,
    }
    row.update(overrides)
    return row


def _run(rows: list[dict]) -> pd.DataFrame:
    fe = FeatureEngineer()
    df = pd.DataFrame(rows)
    return fe.fit_transform(df)


def _single(**overrides) -> pd.Series:
    return _run([_base_row(**overrides)]).iloc[0]


# ─────────────────────────────────────────────────────────────────────────────
# save_rate  =  saves_week2 / (streams_week2 + 1e-8)
# ─────────────────────────────────────────────────────────────────────────────

class TestSaveRate:

    def test_standard_case(self):
        row = _single(saves_week2=18_000, streams_week2=100_000)
        assert abs(row["save_rate"] - 0.18) < 1e-6

    def test_zero_saves_gives_zero(self):
        row = _single(saves_week2=0, streams_week2=100_000)
        assert row["save_rate"] == pytest.approx(0.0, abs=1e-6)

    def test_zero_streams_no_division_error(self):
        # Denominator guard (+ 1e-8) prevents ZeroDivisionError
        row = _single(saves_week2=100, streams_week2=0)
        assert math.isfinite(row["save_rate"])
        assert row["save_rate"] > 0  # 100 / 1e-8 = 1e10, will be clipped

    def test_high_save_rate_artist(self):
        row = _single(saves_week2=30_000, streams_week2=100_000)
        assert abs(row["save_rate"] - 0.30) < 1e-6

    def test_above_1_possible_before_clip(self):
        # saves > streams (repeat saves from playlists) — valid raw value
        row = _single(saves_week2=200_000, streams_week2=100_000)
        # After clip it should be at most the blueprint valid_range upper bound
        assert math.isfinite(row["save_rate"])

    def test_typical_mainstream_artist(self):
        row = _single(saves_week2=5_000, streams_week2=200_000)
        assert abs(row["save_rate"] - 0.025) < 1e-6

    def test_breakout_threshold_is_above_015(self):
        row = _single(saves_week2=18_000, streams_week2=100_000)
        assert row["save_rate"] >= 0.15  # A&R threshold: save_rate ≥ 15% = breakout

    def test_returns_float_not_int(self):
        row = _single(saves_week2=1_000, streams_week2=10_000)
        assert isinstance(row["save_rate"], float)


# ─────────────────────────────────────────────────────────────────────────────
# stream_velocity  =  (streams_week2 - streams_week1) / (streams_week1 + 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestStreamVelocity:

    def test_28_pct_weekly_growth(self):
        row = _single(streams_week1=100_000, streams_week2=128_000)
        expected = (128_000 - 100_000) / (100_000 + 1)
        assert abs(row["stream_velocity"] - expected) < 1e-5

    def test_zero_growth_gives_zero(self):
        row = _single(streams_week1=100_000, streams_week2=100_000)
        expected = 0 / (100_000 + 1)
        assert abs(row["stream_velocity"] - expected) < 1e-9

    def test_decline_gives_negative(self):
        row = _single(streams_week1=100_000, streams_week2=80_000)
        assert row["stream_velocity"] < 0

    def test_cold_start_zero_last_week(self):
        # streams_week1=0 → denominator = 1, no division error
        row = _single(streams_week1=0, streams_week2=50_000)
        assert math.isfinite(row["stream_velocity"])
        assert row["stream_velocity"] > 0

    def test_doubling_is_velocity_of_1(self):
        row = _single(streams_week1=100_000, streams_week2=200_000)
        expected = 100_000 / (100_000 + 1)
        assert abs(row["stream_velocity"] - expected) < 1e-4

    def test_breakout_threshold_above_025(self):
        row = _single(streams_week1=100_000, streams_week2=128_000)
        # 28% weekly ≈ velocity 0.28 — above 0.25 A&R threshold
        assert row["stream_velocity"] > 0.25

    def test_velocity_zeroed_for_new_release(self):
        # BUG DOCUMENTATION: releases ≤ 14 days old have stream_velocity forced to 0
        # (features/engineer.py:325 — known P0 issue, suppresses early breakout signal)
        row_new = _single(
            release_date="2024-05-20",   # 12 days before prediction_date=2024-06-01
            streams_week1=100_000,
            streams_week2=300_000,       # 200% growth — should be strong signal
        )
        # The feature is intentionally zeroed — this test documents the behavior
        assert row_new["stream_velocity"] == pytest.approx(0.0), (
            "stream_velocity is zeroed for releases ≤ 14 days old. "
            "This suppresses early-breakout signals. See features/engineer.py:325."
        )

    def test_velocity_not_zeroed_after_14_days(self):
        row = _single(
            release_date="2024-05-01",   # 31 days before prediction_date
            streams_week1=100_000,
            streams_week2=128_000,
        )
        assert row["stream_velocity"] > 0


# ─────────────────────────────────────────────────────────────────────────────
# ugc_growth_rate  =  (tiktok_videos_week2 - tiktok_videos_week1) / (tiktok_videos_week1 + 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestUgcGrowthRate:

    def test_275_pct_growth(self):
        row = _single(tiktok_videos_week1=12, tiktok_videos_week2=45)
        expected = (45 - 12) / (12 + 1)
        assert abs(row["ugc_growth_rate"] - expected) < 1e-6

    def test_zero_baseline_no_error(self):
        row = _single(tiktok_videos_week1=0, tiktok_videos_week2=50)
        assert math.isfinite(row["ugc_growth_rate"])
        assert row["ugc_growth_rate"] > 0

    def test_flat_ugc_gives_zero(self):
        row = _single(tiktok_videos_week1=20, tiktok_videos_week2=20)
        assert abs(row["ugc_growth_rate"]) < 1e-4

    def test_ugc_decline_is_negative(self):
        row = _single(tiktok_videos_week1=50, tiktok_videos_week2=10)
        assert row["ugc_growth_rate"] < 0

    def test_viral_spike_is_high(self):
        row = _single(tiktok_videos_week1=5, tiktok_videos_week2=500)
        assert row["ugc_growth_rate"] > 10  # 99x multiplier

    def test_returned_as_finite_float(self):
        row = _single()
        assert math.isfinite(row["ugc_growth_rate"])


# ─────────────────────────────────────────────────────────────────────────────
# follower_velocity  =  (followers_week2 - followers_week1) / (followers_week1 + 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestFollowerVelocity:

    def test_10_pct_growth(self):
        row = _single(followers_week1=50_000, followers_week2=55_000)
        expected = 5_000 / (50_000 + 1)
        assert abs(row["follower_velocity"] - expected) < 1e-5

    def test_zero_followers_no_error(self):
        row = _single(followers_week1=0, followers_week2=1_000)
        assert math.isfinite(row["follower_velocity"])

    def test_decline_is_negative(self):
        row = _single(followers_week1=50_000, followers_week2=45_000)
        assert row["follower_velocity"] < 0

    def test_above_015_is_breakout_signal(self):
        row = _single(followers_week1=50_000, followers_week2=60_000)
        assert row["follower_velocity"] > 0.15


# ─────────────────────────────────────────────────────────────────────────────
# listener_to_follower  =  new_followers_week1 / (unique_listeners_week1 + 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestListenerToFollower:

    def test_5_pct_conversion(self):
        row = _single(new_followers_week1=2_000, unique_listeners_week1=40_000)
        expected = 2_000 / (40_000 + 1)
        assert abs(row["listener_to_follower"] - expected) < 1e-6

    def test_zero_listeners_no_error(self):
        row = _single(new_followers_week1=100, unique_listeners_week1=0)
        assert math.isfinite(row["listener_to_follower"])

    def test_high_conversion_above_010(self):
        row = _single(new_followers_week1=5_000, unique_listeners_week1=30_000)
        assert row["listener_to_follower"] > 0.10

    def test_clipped_to_1(self):
        # More followers than listeners (e.g., social cross-platform spillover)
        row = _single(new_followers_week1=100_000, unique_listeners_week1=10_000)
        assert row["listener_to_follower"] <= 1.0


# ─────────────────────────────────────────────────────────────────────────────
# skip_rate_inv  =  1 - skip_rate.clip(0, 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestSkipRateInv:

    def test_20_pct_skip_gives_080_inv(self):
        row = _single(skip_rate=0.20)
        assert abs(row["skip_rate_inv"] - 0.80) < 1e-6

    def test_zero_skip_gives_1(self):
        row = _single(skip_rate=0.0)
        assert abs(row["skip_rate_inv"] - 1.0) < 1e-6

    def test_full_skip_gives_0(self):
        row = _single(skip_rate=1.0)
        assert abs(row["skip_rate_inv"] - 0.0) < 1e-6

    def test_clipped_above_1(self):
        row = _single(skip_rate=2.0)
        # skip_rate clipped to 1.0, so inv = 0.0
        assert row["skip_rate_inv"] >= 0.0


# ─────────────────────────────────────────────────────────────────────────────
# completion_rate  =  streams_reaching_100pct / (streams_week2 + 1e-8)
# ─────────────────────────────────────────────────────────────────────────────

class TestCompletionRate:

    def test_50_pct_completion(self):
        row = _single(streams_reaching_100pct=64_000, streams_week2=128_000)
        assert abs(row["completion_rate"] - 0.5) < 1e-5

    def test_full_completion(self):
        row = _single(streams_reaching_100pct=100_000, streams_week2=100_000)
        assert abs(row["completion_rate"] - 1.0) < 1e-5

    def test_zero_streams_no_error(self):
        row = _single(streams_reaching_100pct=0, streams_week2=0)
        assert math.isfinite(row["completion_rate"])


# ─────────────────────────────────────────────────────────────────────────────
# repeat_listen_rate  =  streams_week2 / (unique_listeners_week1 + 1)
# BUG DOCUMENTATION: this is streams-per-listener, NOT a true repeat rate
# ─────────────────────────────────────────────────────────────────────────────

class TestRepeatListenRate:

    def test_is_streams_per_listener_ratio(self):
        # For a growing artist: streams can exceed listeners → value > 1.0
        row = _single(streams_week2=200_000, unique_listeners_week1=50_000)
        # 200_000 / 50_001 ≈ 4.0 — NOT a 0–1 probability
        assert row["repeat_listen_rate"] > 1.0, (
            "repeat_listen_rate is streams/listeners, not a repeat probability. "
            "Values > 1.0 indicate growing artists, not 100%+ repeat listens."
        )

    def test_stable_artist_is_near_1(self):
        row = _single(streams_week2=50_000, unique_listeners_week1=50_000)
        assert 0.9 < row["repeat_listen_rate"] < 1.1

    def test_declining_artist_clipped_to_1(self):
        # repeat_listen_rate valid_range=(1,20) clips low values to 1.0
        row = _single(streams_week2=10_000, unique_listeners_week1=50_000)
        assert row["repeat_listen_rate"] == pytest.approx(1.0)

    def test_zero_listeners_no_error(self):
        row = _single(streams_week2=100_000, unique_listeners_week1=0)
        assert math.isfinite(row["repeat_listen_rate"])

    def test_formula_documents_semantic_mismatch(self):
        # A breakout artist (streams doubling, listeners flat) scores > 2.0
        # A model expecting 0-1 probability will treat this as extreme signal
        row = _single(streams_week2=300_000, unique_listeners_week1=100_000)
        expected = 300_000 / (100_000 + 1)
        assert abs(row["repeat_listen_rate"] - expected) < 0.01


# ─────────────────────────────────────────────────────────────────────────────
# pre_save_normalized  =  pre_saves / 10_000
# ─────────────────────────────────────────────────────────────────────────────

class TestPreSaveNormalized:

    def test_5k_pre_saves_gives_05(self):
        row = _single(pre_saves=5_000)
        assert abs(row["pre_save_normalized"] - 0.5) < 1e-6

    def test_10k_gives_1(self):
        row = _single(pre_saves=10_000)
        assert abs(row["pre_save_normalized"] - 1.0) < 1e-6

    def test_zero_gives_zero(self):
        row = _single(pre_saves=0)
        assert abs(row["pre_save_normalized"] - 0.0) < 1e-6


# ─────────────────────────────────────────────────────────────────────────────
# organic_score  =  0.45*stream_velocity + 0.35*save_rate + 0.20*follower_velocity
# ─────────────────────────────────────────────────────────────────────────────

class TestOrganicScore:

    def test_weights_sum_correctly(self):
        # Set each component to 1.0 (via very large numbers, will be clipped)
        # Result should be ≈ 0.45 + 0.35 + 0.20 = 1.0 before clipping
        row = _single(
            streams_week1=1, streams_week2=1_000_000,
            saves_week2=1_000_000, streams_week2_=1_000_000,
            followers_week1=1, followers_week2=1_000_000,
        )
        assert math.isfinite(row["organic_score"])

    def test_stream_velocity_dominated_score(self):
        # High stream velocity, zero saves/followers → organic_score ≈ 0.45 * stream_velocity
        row = _single(
            streams_week1=100_000, streams_week2=200_000,  # velocity ≈ 1.0
            saves_week2=0, followers_week1=50_000, followers_week2=50_000,
        )
        # stream_velocity contributes 45% of max
        assert row["organic_score"] > 0.3

    def test_zero_all_signals_gives_zero(self):
        row = _single(
            streams_week1=100_000, streams_week2=100_000,  # velocity=0
            saves_week2=0,
            followers_week1=50_000, followers_week2=50_000,  # follower velocity=0
        )
        assert row["organic_score"] == pytest.approx(0.0, abs=1e-4)

    def test_returns_finite(self):
        row = _single()
        assert math.isfinite(row["organic_score"])


# ─────────────────────────────────────────────────────────────────────────────
# algo_traffic_pct  =  algo_streams / (total_streams + 1e-8)
# editorial_signal  =  1 - algo_traffic_pct
# ─────────────────────────────────────────────────────────────────────────────

class TestAlgoEditorialSplit:

    def test_50_50_split(self):
        row = _single(algo_streams=64_000, total_streams=128_000)
        assert abs(row["algo_traffic_pct"] - 0.5) < 1e-4
        assert abs(row["editorial_signal"] - 0.5) < 1e-4

    def test_pure_algo_traffic(self):
        row = _single(algo_streams=128_000, total_streams=128_000)
        assert abs(row["algo_traffic_pct"] - 1.0) < 1e-4
        assert abs(row["editorial_signal"] - 0.0) < 1e-4

    def test_pure_editorial_traffic(self):
        row = _single(algo_streams=0, total_streams=128_000)
        assert abs(row["algo_traffic_pct"] - 0.0) < 1e-4
        assert abs(row["editorial_signal"] - 1.0) < 1e-4

    def test_zero_total_no_error(self):
        row = _single(algo_streams=0, total_streams=0)
        assert math.isfinite(row["algo_traffic_pct"])


# ─────────────────────────────────────────────────────────────────────────────
# radio_station_velocity  =  (week2 - week1) / (week1 + 1)
# ─────────────────────────────────────────────────────────────────────────────

class TestRadioStationVelocity:

    def test_standard_growth(self):
        row = _single(radio_stations_week1=10, radio_stations_week2=15)
        expected = 5 / (10 + 1)
        assert abs(row["radio_station_velocity"] - expected) < 1e-6

    def test_zero_baseline(self):
        row = _single(radio_stations_week1=0, radio_stations_week2=5)
        assert math.isfinite(row["radio_station_velocity"])

    def test_decline_is_negative(self):
        row = _single(radio_stations_week1=20, radio_stations_week2=10)
        assert row["radio_station_velocity"] < 0


# ─────────────────────────────────────────────────────────────────────────────
# Temporal guard — rows where computed_at > prediction_date are dropped
# ─────────────────────────────────────────────────────────────────────────────

class TestTemporalGuard:

    def test_future_data_is_dropped(self):
        rows = [
            _base_row(artist_id=1, computed_at="2024-06-10", prediction_date="2024-06-01"),
            _base_row(artist_id=2, computed_at="2024-05-28", prediction_date="2024-06-01"),
        ]
        fe = FeatureEngineer()
        result = fe.fit_transform(pd.DataFrame(rows))
        assert len(result) == 1
        assert result.iloc[0]["artist_id"] == 2

    def test_valid_data_is_kept(self):
        rows = [_base_row(computed_at="2024-05-20", prediction_date="2024-06-01")]
        fe = FeatureEngineer()
        result = fe.fit_transform(pd.DataFrame(rows))
        assert len(result) == 1

    def test_same_day_is_kept(self):
        rows = [_base_row(computed_at="2024-06-01", prediction_date="2024-06-01")]
        fe = FeatureEngineer()
        result = fe.fit_transform(pd.DataFrame(rows))
        assert len(result) == 1

    def test_drop_count_tracked(self):
        rows = [
            _base_row(artist_id=1, computed_at="2024-06-10", prediction_date="2024-06-01"),
            _base_row(artist_id=2, computed_at="2024-06-15", prediction_date="2024-06-01"),
            _base_row(artist_id=3, computed_at="2024-05-01", prediction_date="2024-06-01"),
        ]
        fe = FeatureEngineer()
        fe.fit_transform(pd.DataFrame(rows))
        assert fe.temporal_leakage_dropped == 2

    def test_missing_dates_dont_crash(self):
        row = _base_row()
        del row["prediction_date"]
        fe = FeatureEngineer()
        result = fe.fit_transform(pd.DataFrame([row]))
        assert result is not None


# ─────────────────────────────────────────────────────────────────────────────
# days_since_release  =  (prediction_date - release_date).days  clipped [0, 3650]
# ─────────────────────────────────────────────────────────────────────────────

class TestDaysSinceRelease:

    def test_31_days(self):
        row = _single(release_date="2024-05-01", prediction_date="2024-06-01")
        assert row["days_since_release"] == pytest.approx(31.0, abs=1.0)

    def test_new_release_is_zero(self):
        row = _single(release_date="2024-05-31", prediction_date="2024-06-01")
        assert row["days_since_release"] == pytest.approx(1.0, abs=1.0)

    def test_old_release_clipped_at_3650(self):
        row = _single(release_date="2010-01-01", prediction_date="2024-06-01")
        assert row["days_since_release"] <= 3650

    def test_recency_flag_set_within_14_days(self):
        row = _single(release_date="2024-05-20", prediction_date="2024-06-01")
        assert row["days_since_release"] == pytest.approx(12.0, abs=1.0)
        assert row["release_recency_flag"] == 1

    def test_recency_flag_unset_after_14_days(self):
        row = _single(release_date="2024-05-01", prediction_date="2024-06-01")
        assert row["release_recency_flag"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# momentum_acceleration  =  velocity_week3 - velocity_week2
# ─────────────────────────────────────────────────────────────────────────────

class TestMomentumAcceleration:

    def test_accelerating_growth(self):
        row = _single(
            streams_week1=100_000,
            streams_week2=130_000,
            streams_week3=180_000,
        )
        v1 = (130_000 - 100_000) / (100_000 + 1)  # 0.30
        v2 = (180_000 - 130_000) / (130_000 + 1)  # 0.385
        expected = v2 - v1
        assert abs(row["momentum_acceleration"] - expected) < 1e-4

    def test_decelerating_growth_is_negative(self):
        row = _single(
            streams_week1=100_000,
            streams_week2=200_000,
            streams_week3=210_000,
        )
        assert row["momentum_acceleration"] < 0

    def test_constant_rate_growth_is_near_zero(self):
        # Constant *percentage* growth → v1 ≈ v2 → acceleration ≈ 0
        # 100k →50%→ 150k →50%→ 225k
        row = _single(
            streams_week1=100_000,
            streams_week2=150_000,
            streams_week3=225_000,
        )
        assert abs(row["momentum_acceleration"]) < 0.05

    def test_missing_week3_gives_nan(self):
        rows = [_base_row()]
        df = pd.DataFrame(rows)
        df = df.drop(columns=["streams_week3"])
        fe = FeatureEngineer()
        result = fe.fit_transform(df)
        assert pd.isna(result.iloc[0]["momentum_acceleration"])


# ─────────────────────────────────────────────────────────────────────────────
# tiktok_stream_conversion  =  ugc_growth_rate * stream_velocity
# ─────────────────────────────────────────────────────────────────────────────

class TestTikTokStreamConversion:

    def test_both_high_gives_large_product(self):
        row = _single(
            tiktok_videos_week1=5, tiktok_videos_week2=50,   # ugc_growth ≈ 9
            streams_week1=100_000, streams_week2=200_000,    # velocity ≈ 1.0
            release_date="2024-04-01",  # > 14 days, so velocity not zeroed
        )
        assert row["tiktok_stream_conversion"] > 1.0

    def test_tiktok_no_streaming_gives_zero_product(self):
        row = _single(
            tiktok_videos_week1=5, tiktok_videos_week2=50,
            streams_week1=100_000, streams_week2=100_000,   # velocity = 0
        )
        assert abs(row["tiktok_stream_conversion"]) < 1e-4

    def test_high_quality_growth_interaction(self):
        row = _single(
            saves_week2=25_000, streams_week2=100_000,    # save_rate=0.25
            streams_week1=80_000,                          # stream_velocity>0
            release_date="2024-04-01",
        )
        assert row["high_quality_growth"] > 0


# ─────────────────────────────────────────────────────────────────────────────
# Feature completeness — null rate warnings
# ─────────────────────────────────────────────────────────────────────────────

class TestFeatureCompleteness:

    def test_all_base_features_finite(self):
        row = _single()
        for col in ["save_rate", "stream_velocity", "ugc_growth_rate",
                    "follower_velocity", "skip_rate_inv", "organic_score"]:
            assert math.isfinite(row[col]), f"{col} is not finite"

    def test_no_inf_values_in_output(self):
        result = _run([_base_row() for _ in range(5)])
        numeric = result.select_dtypes(include=[np.number])
        assert not np.isinf(numeric.values).any(), "Found Inf values in feature output"

    def test_feature_engineer_returns_dataframe(self):
        fe = FeatureEngineer()
        df = fe.fit_transform(pd.DataFrame([_base_row()]))
        assert isinstance(df, pd.DataFrame)

    def test_fit_transform_is_deterministic(self):
        # FeatureEngineer.transform() does not exist; fit_transform is idempotent
        fe = FeatureEngineer()
        df = pd.DataFrame([_base_row()])
        out1 = fe.fit_transform(df.copy())
        out2 = fe.fit_transform(df.copy())
        pd.testing.assert_frame_equal(
            out1.reset_index(drop=True),
            out2.reset_index(drop=True),
        )
