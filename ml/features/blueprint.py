"""
Authoritative registry of all features for breakout artist detection.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class FeatureCategory(str, Enum):
    RAW         = "raw"
    TRANSFORMED = "transformed"
    AGGREGATED  = "aggregated"
    INTERACTION = "interaction"
    TEMPORAL    = "temporal"
    BEHAVIORAL  = "behavioral"


class LeakageRisk(str, Enum):
    NONE   = "none"
    LOW    = "low"
    HIGH   = "high"


class ExpectedImpact(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"


@dataclass
class FeatureSpec:
    name: str
    category: FeatureCategory
    definition: str
    why_it_helps: str
    leakage_risk: LeakageRisk
    expected_impact: ExpectedImpact
    unit: str
    valid_range: tuple
    null_strategy: str
    is_noisy: bool = False
    noise_note: str = ""
    is_redundant_with: list = field(default_factory=list)
    industry_threshold: Optional[str] = None


FEATURE_BLUEPRINT: list = [
    # -------------------------------------------------------------------------
    # RAW FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="spotify_popularity",
        category=FeatureCategory.RAW,
        definition="Spotify popularity score 0-100",
        why_it_helps="Proxy for current algorithmic placement",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="score",
        valid_range=(0, 100),
        null_strategy="median",
        is_noisy=True,
        noise_note="Lagging — reflects past 4 weeks of streams, not current trajectory. Use stream_velocity instead for early detection.",
    ),
    FeatureSpec(
        name="monthly_listeners",
        category=FeatureCategory.RAW,
        definition="Spotify monthly listeners count",
        why_it_helps="Large audience proxy",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.LOW,
        unit="count",
        valid_range=(0, 100_000_000),
        null_strategy="median",
        is_noisy=True,
        noise_note="Highly lagging — peaks after breakout, not before. Correlated with follower_count (r > 0.85). Use stream_velocity instead.",
        is_redundant_with=["follower_count"],
    ),
    FeatureSpec(
        name="follower_count",
        category=FeatureCategory.RAW,
        definition="Spotify follower count",
        why_it_helps="Baseline audience size",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.LOW,
        unit="count",
        valid_range=(0, 50_000_000),
        null_strategy="median",
        is_redundant_with=["monthly_listeners"],
    ),
    FeatureSpec(
        name="tiktok_video_count",
        category=FeatureCategory.RAW,
        definition="Number of TikTok videos using artist's music",
        why_it_helps="Direct UGC signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="count",
        valid_range=(0, 10_000_000),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="youtube_views",
        category=FeatureCategory.RAW,
        definition="Total YouTube channel views",
        why_it_helps="Video discovery metric",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="count",
        valid_range=(0, 1_000_000_000),
        null_strategy="median",
        is_noisy=True,
        noise_note="Highly skewed — use log transform.",
    ),
    FeatureSpec(
        name="youtube_subscribers",
        category=FeatureCategory.RAW,
        definition="YouTube subscriber count",
        why_it_helps="Video platform audience size",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.LOW,
        unit="count",
        valid_range=(0, 100_000_000),
        null_strategy="median",
        is_redundant_with=["follower_count", "monthly_listeners"],
    ),
    FeatureSpec(
        name="radio_stations",
        category=FeatureCategory.RAW,
        definition="Number of radio stations with airplay",
        why_it_helps="Broadcast reach signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="count",
        valid_range=(0, 5000),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="radio_audience",
        category=FeatureCategory.RAW,
        definition="Radio audience size (cumulative weekly)",
        why_it_helps="Broadcast audience reach",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="count",
        valid_range=(0, 500_000_000),
        null_strategy="median",
        is_noisy=True,
        noise_note="Lagging indicator — radio adds follow digital traction, not precede it.",
    ),
    # -------------------------------------------------------------------------
    # TRANSFORMED FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="stream_velocity",
        category=FeatureCategory.TRANSFORMED,
        definition="(streams_week2 - streams_week1) / streams_week1",
        why_it_helps="Most predictive early momentum signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 10),
        null_strategy="zero",
        industry_threshold=">25%/month = breakout trajectory",
    ),
    FeatureSpec(
        name="save_rate",
        category=FeatureCategory.TRANSFORMED,
        definition="saves / (streams + 1e-8)",
        why_it_helps="Measures committed fan conversion",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
        industry_threshold=">15% = committed fans",
    ),
    FeatureSpec(
        name="listener_to_follower",
        category=FeatureCategory.TRANSFORMED,
        definition="new_followers / (unique_listeners + 1)",
        why_it_helps="Measures true fan conversion rate",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="ugc_growth_rate",
        category=FeatureCategory.TRANSFORMED,
        definition="(tiktok_videos_week2 - tiktok_videos_week1) / (tiktok_videos_week1 + 1)",
        why_it_helps="UGC acceleration precedes streaming by 14 days",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 20),
        null_strategy="zero",
        industry_threshold="84% of Billboard Global 200 songs went viral on TikTok first",
    ),
    FeatureSpec(
        name="follower_velocity",
        category=FeatureCategory.TRANSFORMED,
        definition="(followers_week2 - followers_week1) / (followers_week1 + 1)",
        why_it_helps="21-day leading indicator for chart entry",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 5),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="youtube_view_velocity",
        category=FeatureCategory.TRANSFORMED,
        definition="Week-over-week YouTube view growth",
        why_it_helps="Video platform momentum signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(-1, 10),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="radio_station_velocity",
        category=FeatureCategory.TRANSFORMED,
        definition="(stations_week2 - stations_week1) / (stations_week1 + 1)",
        why_it_helps="Radio add rate signals label investment",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.LOW,
        unit="ratio",
        valid_range=(-1, 5),
        null_strategy="zero",
        is_noisy=True,
        noise_note="Lagging — radio adds follow digital success.",
    ),
    # -------------------------------------------------------------------------
    # AGGREGATED FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="stream_velocity_7d_avg",
        category=FeatureCategory.AGGREGATED,
        definition="7-day rolling average of daily stream_velocity",
        why_it_helps="Smooths noise from single-day reporting artifacts",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 10),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="save_rate_30d_avg",
        category=FeatureCategory.AGGREGATED,
        definition="30-day rolling average of save_rate",
        why_it_helps="Stable committed-fan signal, less susceptible to single-day spikes",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="peak_stream_velocity_90d",
        category=FeatureCategory.AGGREGATED,
        definition="Maximum stream_velocity in last 90 days",
        why_it_helps="Captures best-case performance, important for artists with seasonal spikes",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(0, 10),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="sustained_momentum",
        category=FeatureCategory.AGGREGATED,
        definition="(number of weeks with stream_velocity > 15%) / 12",
        why_it_helps="Distinguishes sustained growth from one-time spikes",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
        industry_threshold=">0.25 = 3+ weeks of sustained momentum",
    ),
    FeatureSpec(
        name="tiktok_velocity_7d_avg",
        category=FeatureCategory.AGGREGATED,
        definition="7-day rolling average of ugc_growth_rate",
        why_it_helps="Smooths UGC reporting delays",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 20),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="follower_velocity_30d_avg",
        category=FeatureCategory.AGGREGATED,
        definition="30-day rolling average of follower_velocity",
        why_it_helps="Removes weekly fluctuations",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 5),
        null_strategy="zero",
    ),
    # -------------------------------------------------------------------------
    # INTERACTION FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="high_quality_growth",
        category=FeatureCategory.INTERACTION,
        definition="save_rate x stream_velocity",
        why_it_helps="Highest-value composite signal — fast growth with strong fan conversion",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 10),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="social_momentum",
        category=FeatureCategory.INTERACTION,
        definition="ugc_growth_rate x follower_velocity",
        why_it_helps="Simultaneous UGC and fan growth = organic viral moment",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 100),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="playlist_quality",
        category=FeatureCategory.INTERACTION,
        definition="playlist_addition_rate / (skip_rate + 0.01)",
        why_it_helps="High-placement + low-skip = editorial confidence signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 100),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="organic_score",
        category=FeatureCategory.INTERACTION,
        definition="0.45 x stream_velocity + 0.35 x save_rate + 0.20 x follower_velocity",
        why_it_helps="Weighted composite of top 3 organic signals, validated against industry A&R benchmarks",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="score",
        valid_range=(-1, 10),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="tiktok_stream_conversion",
        category=FeatureCategory.INTERACTION,
        definition="ugc_growth_rate x stream_velocity",
        why_it_helps="Measures whether TikTok virality is converting to streaming",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 100),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="algo_traffic_pct",
        category=FeatureCategory.INTERACTION,
        definition="algo_streams / (total_streams + 1e-8)",
        why_it_helps="High algorithmic traffic % indicates DSP is amplifying organically (not paid)",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="editorial_signal",
        category=FeatureCategory.INTERACTION,
        definition="1 - algo_traffic_pct",
        why_it_helps="Editorial placement signal — high editorial traffic = A&R team has noticed",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="save_stream_quality",
        category=FeatureCategory.INTERACTION,
        definition="save_rate x log1p(stream_velocity + 1)",
        why_it_helps="Log-scales the velocity to reduce influence of extreme outliers while preserving save rate signal",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="score",
        valid_range=(0, 5),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="viral_with_retention",
        category=FeatureCategory.INTERACTION,
        definition="ugc_growth_rate x save_rate x stream_velocity",
        why_it_helps="Triple confirmation — viral AND saving AND streaming simultaneously",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 50),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="momentum_quality",
        category=FeatureCategory.INTERACTION,
        definition="stream_velocity x (1 - skip_rate)",
        why_it_helps="Fast growth with low skip = listeners are actually engaging",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-1, 10),
        null_strategy="zero",
    ),
    # -------------------------------------------------------------------------
    # TEMPORAL FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="days_since_release",
        category=FeatureCategory.TEMPORAL,
        definition="(prediction_date - release_date).days",
        why_it_helps="Controls for recency bias; new tracks naturally have higher velocity",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="days",
        valid_range=(0, 3650),
        null_strategy="median",
    ),
    FeatureSpec(
        name="weeks_since_tiktok_viral",
        category=FeatureCategory.TEMPORAL,
        definition="(prediction_date - first_tiktok_viral_date).days / 7",
        why_it_helps="Measures how far into the TikTok-to-streaming conversion window we are",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="weeks",
        valid_range=(0, 52),
        null_strategy="median",
    ),
    FeatureSpec(
        name="momentum_acceleration",
        category=FeatureCategory.TEMPORAL,
        definition="(velocity_week3 - velocity_week2) - (velocity_week2 - velocity_week1)",
        why_it_helps="Second derivative of momentum — is the artist accelerating or decelerating?",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(-5, 5),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="release_recency_flag",
        category=FeatureCategory.TEMPORAL,
        definition="1 if days_since_release <= 14 else 0",
        why_it_helps="Binary flag for release window — zero out stream_velocity for first 14 days (cold-start bias)",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="binary",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="tiktok_to_streaming_lag",
        category=FeatureCategory.TEMPORAL,
        definition="weeks_since_tiktok_viral, capped at 8 weeks",
        why_it_helps="TikTok to streaming conversion typically completes in 2-6 weeks; after 8 weeks, signal is stale",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="weeks",
        valid_range=(0, 8),
        null_strategy="median",
    ),
    # -------------------------------------------------------------------------
    # BEHAVIORAL FEATURES
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="completion_rate",
        category=FeatureCategory.BEHAVIORAL,
        definition="streams_reaching_100pct / total_streams",
        why_it_helps="Completion = genuine engagement, predicts save and follow",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="repeat_listen_rate",
        category=FeatureCategory.BEHAVIORAL,
        definition="total_streams / (unique_listeners + 1)",
        why_it_helps="Listeners returning > 1x = true fans",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(1, 20),
        null_strategy="median",
    ),
    FeatureSpec(
        name="algo_vs_playlist_split",
        category=FeatureCategory.BEHAVIORAL,
        definition="algo_streams / (playlist_streams + 1e-8)",
        why_it_helps="Algorithmic lift without playlist = organic quality",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(0, 100),
        null_strategy="zero",
    ),
    FeatureSpec(
        name="skip_rate_inv",
        category=FeatureCategory.BEHAVIORAL,
        definition="1 - skip_rate",
        why_it_helps="Inverted skip rate — higher = better listener retention",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.HIGH,
        unit="ratio",
        valid_range=(0, 1),
        null_strategy="zero",
        industry_threshold="skip_rate < 30% = track is sticking",
    ),
    FeatureSpec(
        name="pre_save_normalized",
        category=FeatureCategory.BEHAVIORAL,
        definition="pre_saves / 10_000",
        why_it_helps="Pre-save campaigns indicate label investment and fan anticipation",
        leakage_risk=LeakageRisk.LOW,
        expected_impact=ExpectedImpact.MEDIUM,
        unit="ratio",
        valid_range=(0, 10),
        null_strategy="zero",
    ),
    # -------------------------------------------------------------------------
    # EXCLUDED FEATURES (HIGH leakage)
    # -------------------------------------------------------------------------
    FeatureSpec(
        name="streams_after_breakout",
        category=FeatureCategory.BEHAVIORAL,
        definition="Total streams after artist's own breakout date",
        why_it_helps="N/A — excluded due to leakage",
        leakage_risk=LeakageRisk.HIGH,
        expected_impact=ExpectedImpact.HIGH,
        unit="count",
        valid_range=(0, float("inf")),
        null_strategy="drop",
    ),
    FeatureSpec(
        name="breakout_flag_at_prediction",
        category=FeatureCategory.BEHAVIORAL,
        definition="Whether artist had broken out at prediction_date",
        why_it_helps="N/A — this IS the label, never a feature",
        leakage_risk=LeakageRisk.HIGH,
        expected_impact=ExpectedImpact.HIGH,
        unit="binary",
        valid_range=(0, 1),
        null_strategy="drop",
    ),
]


class FeatureBlueprintRegistry:
    def __init__(self):
        self.features: dict = {f.name: f for f in FEATURE_BLUEPRINT}

    def get_training_features(self) -> list:
        """Return features safe for training (no HIGH leakage, not label)."""
        return [
            f.name
            for f in self.features.values()
            if f.leakage_risk != LeakageRisk.HIGH
        ]

    def get_high_impact_features(self) -> list:
        """Return HIGH impact features only."""
        return [
            f.name
            for f in self.features.values()
            if f.expected_impact == ExpectedImpact.HIGH
            and f.leakage_risk != LeakageRisk.HIGH
        ]

    def get_noisy_features(self) -> list:
        """Return features flagged as noisy."""
        return [f.name for f in self.features.values() if f.is_noisy]

    def get_redundant_pairs(self) -> list:
        """Return pairs of features known to be redundant."""
        pairs = []
        for f in self.features.values():
            for r in f.is_redundant_with:
                if (r, f.name) not in pairs:
                    pairs.append((f.name, r))
        return pairs

    def print_blueprint_table(self) -> str:
        """Return markdown table of all features."""
        header = "| Feature | Category | Definition | Why It Helps | Leakage Risk | Expected Impact |"
        sep    = "|---------|----------|------------|--------------|--------------|-----------------|"
        rows = [header, sep]
        for f in self.features.values():
            leak = (
                f"WARNING {f.leakage_risk.value}"
                if f.leakage_risk == LeakageRisk.HIGH
                else f.leakage_risk.value
            )
            rows.append(
                f"| `{f.name}` | {f.category.value} | {f.definition} | "
                f"{f.why_it_helps} | {leak} | {f.expected_impact.value} |"
            )
        return "\n".join(rows)
