from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class SignalRole(str, Enum):
    LEADING = "leading"        # predicts breakout before it happens
    LAGGING = "lagging"        # confirms breakout after it happens
    COINCIDENT = "coincident"  # moves with breakout


class SpikeType(str, Enum):
    ORGANIC = "organic"            # genuine listener interest
    ALGORITHMIC = "algorithmic"    # playlist/DSP push
    VIRAL_MEME = "viral_meme"      # TikTok/UGC driven, may not convert
    NOISE = "noise"                # one-day anomaly, likely to revert
    UNKNOWN = "unknown"


class RegimeType(str, Enum):
    ACCELERATION = "acceleration"  # growth rate increasing
    DECELERATION = "deceleration"  # growth rate slowing
    PLATEAU = "plateau"            # flat growth
    DECLINE = "decline"            # shrinking
    BREAKOUT = "breakout"          # sudden step-change up
    RECOVERY = "recovery"          # recovering from dip


@dataclass
class RollingStats:
    signal: str
    ma_7: Optional[float]
    ma_14: Optional[float]
    ma_30: Optional[float]
    wow_pct: Optional[float]       # week-over-week % change
    mom_pct: Optional[float]       # month-over-month % change
    velocity: Optional[float]      # current growth rate (smoothed)
    acceleration: Optional[float]  # change in velocity
    trend_direction: str           # "up", "down", "flat"
    trend_strength: float          # 0-1


@dataclass
class SpikeEvent:
    date: str
    signal: str
    value: float
    z_score: float
    spike_type: SpikeType
    magnitude: str          # "major" (>3σ), "moderate" (2-3σ), "minor" (1-2σ)
    is_sustained: bool      # did values stay elevated after spike?
    days_sustained: int
    likely_cause: str
    breakout_signal: bool   # is this a genuine breakout indicator?
    explanation: str


@dataclass
class LeadingIndicatorResult:
    signal: str
    role: SignalRole
    avg_lead_days: Optional[int]     # how many days ahead of streaming lift
    correlation_with_streams: float  # Pearson correlation
    predictive_value: str            # "high", "medium", "low"
    explanation: str


@dataclass
class RegimeChange:
    date: str
    signal: str
    from_regime: RegimeType
    to_regime: RegimeType
    magnitude: float
    confidence: float
    explanation: str


@dataclass
class Forecast:
    horizon_days: int
    breakout_probability: float     # 0-1
    probability_lower: float        # 80% CI lower
    probability_upper: float        # 80% CI upper
    expected_breakout_day: Optional[int]  # days from now if breakout likely
    timeline_uncertainty_days: int
    confidence_level: str           # "high", "medium", "low"
    key_drivers: list[str]
    explanation: str


@dataclass
class RiskFactor:
    name: str
    category: str      # "content", "platform", "algorithmic", "market"
    severity: str      # "high", "medium", "low"
    probability: str   # "likely", "possible", "unlikely"
    impact_on_forecast: str
    monitoring_signal: str


@dataclass
class MonitoringSignal:
    signal: str
    check_frequency: str    # "daily", "weekly"
    alert_threshold: str
    why_important: str


@dataclass
class TrendAnalysisResult:
    artist_id: int
    artist_name: str
    prediction_date: str
    rolling_stats: list[RollingStats]
    spike_events: list[SpikeEvent]
    leading_indicators: list[LeadingIndicatorResult]
    regime_changes: list[RegimeChange]
    forecast_30d: Forecast
    forecast_90d: Forecast
    risk_factors: list[RiskFactor]
    monitoring_signals: list[MonitoringSignal]
    data_points_used: int
    temporal_leakage_check: str     # "passed" or "warning: ..."
    analyzed_at: str
