"""Tests for the time-series trend analysis engine."""

import math
import sys
import os
from datetime import date, timedelta
from dataclasses import asdict

import pytest

# Ensure ml package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from ml.timeseries import TrendAnalysisEngine, TrendAnalysisResult
from ml.timeseries.types import (
    SignalRole, SpikeType, RegimeType,
    RollingStats, SpikeEvent, Forecast,
)
from ml.timeseries.trend_detector import TrendDetector
from ml.timeseries.spike_detector import SpikeDetector
from ml.timeseries.leading_indicators import LeadingIndicatorAnalyzer
from ml.timeseries.forecaster import BreakoutForecaster
from ml.timeseries.risk_analyzer import RiskAnalyzer

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE_DATE = date(2024, 1, 1)


def _date(offset: int) -> str:
    return (BASE_DATE + timedelta(days=offset)).isoformat()


def _make_snapshot(offset: int, **kwargs) -> dict:
    defaults = {
        "date": _date(offset),
        "stream_velocity": 1.0,
        "tiktok_growth": 1.0,
        "save_rate": 0.12,
        "follower_velocity": 1.0,
        "chart_momentum": 1.0,
        "playlist_signal": 1.0,
        "radio_spike": 0.5,
        "skip_rate": 0.30,
        "listener_follower_conversion": 0.15,
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def strong_breakout_snapshots():
    """60-day series with exponentially growing tiktok_growth and stream_velocity."""
    snaps = []
    for i in range(60):
        factor = math.exp(i * 0.04)  # exponential growth
        snaps.append(_make_snapshot(
            i,
            stream_velocity=1.0 * factor,
            tiktok_growth=1.0 * factor,
            save_rate=min(0.35, 0.12 + i * 0.004),
            follower_velocity=0.5 * factor,
            playlist_signal=0.8 * factor,
        ))
    return snaps


@pytest.fixture
def plateau_snapshots():
    """60-day series with flat/declining signals."""
    snaps = []
    for i in range(60):
        snaps.append(_make_snapshot(
            i,
            stream_velocity=max(0.5, 1.0 - i * 0.005),
            tiktok_growth=max(0.3, 1.0 - i * 0.01),
            save_rate=0.08,
            follower_velocity=max(0.1, 0.5 - i * 0.005),
        ))
    return snaps


@pytest.fixture
def one_day_spike_snapshots():
    """60-day series with a single 3σ spike on day 30, then revert."""
    baseline = 1.0
    snaps = []
    for i in range(60):
        val = baseline
        if i == 30:
            val = baseline * 15.0  # large single-day spike
        snaps.append(_make_snapshot(
            i,
            stream_velocity=val,
            tiktok_growth=1.0,  # no tiktok spike
            save_rate=0.10,
            playlist_signal=0.9,
        ))
    return snaps


@pytest.fixture
def sparse_snapshots():
    """Only 7 days of data."""
    return [_make_snapshot(i) for i in range(7)]


@pytest.fixture
def engine():
    return TrendAnalysisEngine()


@pytest.fixture
def prediction_date():
    return _date(59)


# ---------------------------------------------------------------------------
# Test 1: Temporal leakage guard
# ---------------------------------------------------------------------------

def test_temporal_leakage_guard(engine):
    snaps = [_make_snapshot(i) for i in range(10)]
    future_snap = _make_snapshot(100, stream_velocity=999.0)
    snaps.append(future_snap)

    cutoff = _date(9)
    result = engine.analyze(1, "Test Artist", snaps, cutoff)

    # Should have dropped the future snapshot
    assert "warning" in result.temporal_leakage_check
    assert result.data_points_used == 10


# ---------------------------------------------------------------------------
# Test 2: Rolling MA-7 correctness
# ---------------------------------------------------------------------------

def test_rolling_ma7_correct():
    detector = TrendDetector()
    # Known values: days 0-13, stream_velocity = day index + 1
    snaps = [_make_snapshot(i, stream_velocity=float(i + 1)) for i in range(14)]
    cutoff = _date(13)

    stats = detector.compute_rolling_stats(snaps, "stream_velocity", cutoff)

    # MA-7 should be mean of last 7 values: 8,9,10,11,12,13,14 => 11.0
    assert stats.ma_7 is not None
    assert abs(stats.ma_7 - 11.0) < 0.01


# ---------------------------------------------------------------------------
# Test 3: WoW% correctness
# ---------------------------------------------------------------------------

def test_wow_pct_correct():
    detector = TrendDetector()
    # First 7 days: value=1.0, next 7 days: value=2.0 → WoW should be ~100%
    snaps = (
        [_make_snapshot(i, stream_velocity=1.0) for i in range(7)]
        + [_make_snapshot(7 + i, stream_velocity=2.0) for i in range(7)]
    )
    cutoff = _date(13)
    stats = detector.compute_rolling_stats(snaps, "stream_velocity", cutoff)

    assert stats.wow_pct is not None
    assert stats.wow_pct > 90  # ~100% WoW


# ---------------------------------------------------------------------------
# Test 4: Acceleration computed
# ---------------------------------------------------------------------------

def test_acceleration_computed():
    detector = TrendDetector()
    # 21+ days so acceleration can be calculated
    snaps = [_make_snapshot(i, stream_velocity=float(i ** 2)) for i in range(25)]
    cutoff = _date(24)
    stats = detector.compute_rolling_stats(snaps, "stream_velocity", cutoff)

    # Exponentially growing values should yield non-None acceleration
    assert stats.acceleration is not None


# ---------------------------------------------------------------------------
# Test 5: Trend direction "up"
# ---------------------------------------------------------------------------

def test_trend_direction_up():
    detector = TrendDetector()
    # Strong upward trend: values double every 7 days
    snaps = (
        [_make_snapshot(i, stream_velocity=1.0) for i in range(7)]
        + [_make_snapshot(7 + i, stream_velocity=3.0) for i in range(7)]
    )
    cutoff = _date(13)
    stats = detector.compute_rolling_stats(snaps, "stream_velocity", cutoff)

    assert stats.trend_direction == "up"
    assert stats.wow_pct is not None and stats.wow_pct > 2


# ---------------------------------------------------------------------------
# Test 6: Spike detection major
# ---------------------------------------------------------------------------

def test_spike_detection_major():
    detector = SpikeDetector()
    # 50 days baseline at 1.0, then spike at day 50 with z >> 3
    snaps = [_make_snapshot(i, stream_velocity=1.0) for i in range(50)]
    snaps.append(_make_snapshot(50, stream_velocity=100.0))
    cutoff = _date(50)

    spikes = detector.detect_spikes(snaps, "stream_velocity", cutoff, z_threshold=2.0)

    assert len(spikes) > 0
    major = [s for s in spikes if s.magnitude == "major"]
    assert len(major) > 0


# ---------------------------------------------------------------------------
# Test 7: One-day spike classified as noise
# ---------------------------------------------------------------------------

def test_one_day_spike_is_noise(one_day_spike_snapshots):
    detector = SpikeDetector()
    cutoff = _date(59)

    spikes = detector.detect_spikes(
        one_day_spike_snapshots, "stream_velocity", cutoff, z_threshold=2.0
    )

    # Day 30 spike should exist
    spike_dates = [s.date for s in spikes]
    assert _date(30) in spike_dates

    day30_spike = next(s for s in spikes if s.date == _date(30))
    assert day30_spike.spike_type == SpikeType.NOISE
    assert not day30_spike.is_sustained


# ---------------------------------------------------------------------------
# Test 8: Sustained spike with save_rate elevated → ORGANIC
# ---------------------------------------------------------------------------

def test_sustained_spike_is_organic():
    detector = SpikeDetector()
    # 30 days baseline, then spike on day 30 that sustains AND save_rate is elevated
    snaps = [_make_snapshot(i, stream_velocity=1.0, save_rate=0.10) for i in range(30)]
    # Spike on day 30 — large z-score
    snaps.append(_make_snapshot(30, stream_velocity=50.0, save_rate=0.35))
    # Sustained for 10 days
    for j in range(1, 11):
        snaps.append(_make_snapshot(30 + j, stream_velocity=10.0, save_rate=0.30))

    cutoff = _date(40)
    spikes = detector.detect_spikes(snaps, "stream_velocity", cutoff, z_threshold=2.0)

    spike_day30 = [s for s in spikes if s.date == _date(30)]
    assert len(spike_day30) > 0
    s = spike_day30[0]
    assert s.spike_type == SpikeType.ORGANIC
    assert s.breakout_signal is True


# ---------------------------------------------------------------------------
# Test 9: tiktok_growth classified as LEADING
# ---------------------------------------------------------------------------

def test_leading_indicator_tiktok_is_leading():
    analyzer = LeadingIndicatorAnalyzer()
    snaps = [_make_snapshot(i) for i in range(30)]
    cutoff = _date(29)

    results = analyzer.analyze(snaps, cutoff)
    tiktok_result = next((r for r in results if r.signal == "tiktok_growth"), None)

    assert tiktok_result is not None
    assert tiktok_result.role == SignalRole.LEADING
    assert tiktok_result.avg_lead_days == 14


# ---------------------------------------------------------------------------
# Test 10: chart_momentum classified as LAGGING
# ---------------------------------------------------------------------------

def test_lagging_indicator_chart_is_lagging():
    analyzer = LeadingIndicatorAnalyzer()
    snaps = [_make_snapshot(i) for i in range(30)]
    cutoff = _date(29)

    results = analyzer.analyze(snaps, cutoff)
    chart_result = next((r for r in results if r.signal == "chart_momentum"), None)

    assert chart_result is not None
    assert chart_result.role == SignalRole.LAGGING
    assert chart_result.avg_lead_days == -14


# ---------------------------------------------------------------------------
# Test 11: Strong signals → 30d prob > 0.6
# ---------------------------------------------------------------------------

def test_forecast_strong_signals_high_probability(strong_breakout_snapshots, engine, prediction_date):
    result = engine.analyze(1, "Strong Artist", strong_breakout_snapshots, prediction_date)
    assert result.forecast_30d.breakout_probability > 0.6


# ---------------------------------------------------------------------------
# Test 12: Plateau/weak signals → 30d prob < 0.4
# ---------------------------------------------------------------------------

def test_forecast_weak_signals_low_probability(plateau_snapshots, engine, prediction_date):
    # Use a simple forecaster with plateau-like stats
    forecaster = BreakoutForecaster()
    # Build a minimal rolling_stats_map with weak signals
    weak_stats = {}
    from ml.timeseries.types import RollingStats
    for sig in ["stream_velocity", "tiktok_growth", "save_rate", "follower_velocity",
                "playlist_signal", "chart_momentum", "radio_spike", "skip_rate",
                "listener_follower_conversion"]:
        weak_stats[sig] = RollingStats(
            signal=sig,
            ma_7=0.5, ma_14=0.5, ma_30=0.5,
            wow_pct=-5.0, mom_pct=-10.0,
            velocity=-5.0, acceleration=-1.0,
            trend_direction="down",
            trend_strength=0.05,
        )
    # Override save_rate to be low
    weak_stats["save_rate"].ma_7 = 0.05

    forecast = forecaster.forecast(weak_stats, [], horizon_days=30, data_points=60)
    assert forecast.breakout_probability < 0.4


# ---------------------------------------------------------------------------
# Test 13: 90d probability ≥ 30d probability
# ---------------------------------------------------------------------------

def test_forecast_90d_higher_than_30d(strong_breakout_snapshots, engine, prediction_date):
    result = engine.analyze(1, "Test Artist", strong_breakout_snapshots, prediction_date)
    assert result.forecast_90d.breakout_probability >= result.forecast_30d.breakout_probability


# ---------------------------------------------------------------------------
# Test 14: Confidence bands include probability
# ---------------------------------------------------------------------------

def test_confidence_bands_include_probability(strong_breakout_snapshots, engine, prediction_date):
    result = engine.analyze(1, "Test Artist", strong_breakout_snapshots, prediction_date)

    for forecast in [result.forecast_30d, result.forecast_90d]:
        assert forecast.probability_lower <= forecast.breakout_probability + 1e-9
        assert forecast.probability_upper >= forecast.breakout_probability - 1e-9


# ---------------------------------------------------------------------------
# Test 15: Risk factors always ≥ 5
# ---------------------------------------------------------------------------

def test_risk_factors_always_present(strong_breakout_snapshots, engine, prediction_date):
    result = engine.analyze(1, "Test Artist", strong_breakout_snapshots, prediction_date)
    assert len(result.risk_factors) >= 5


# ---------------------------------------------------------------------------
# Test 16: Monitoring signals always ≥ 3
# ---------------------------------------------------------------------------

def test_monitoring_signals_always_present(strong_breakout_snapshots, engine, prediction_date):
    result = engine.analyze(1, "Test Artist", strong_breakout_snapshots, prediction_date)
    assert len(result.monitoring_signals) >= 3


# ---------------------------------------------------------------------------
# Test 17: Sparse data (7 days) does not crash
# ---------------------------------------------------------------------------

def test_sparse_data_does_not_crash(sparse_snapshots, engine):
    cutoff = _date(6)
    result = engine.analyze(1, "Sparse Artist", sparse_snapshots, cutoff)

    assert isinstance(result, TrendAnalysisResult)
    assert result.data_points_used == 7
    assert result.forecast_30d is not None
    assert result.forecast_90d is not None
    # Should be JSON-serializable
    d = asdict(result)
    assert d["artist_id"] == 1
