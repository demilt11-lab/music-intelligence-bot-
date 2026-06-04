"""Risk factor analysis and monitoring signal suggestions for artist breakout."""

from .types import RiskFactor, MonitoringSignal, RollingStats, Forecast, LeadingIndicatorResult

RISK_FACTORS = [
    {
        "name": "Second single underperforms",
        "category": "content",
        "base_severity": "high",
        "base_probability": "possible",
        "impact": (
            "Breaks momentum narrative; labels and playlists may drop support. "
            "Stream velocity could halve within 2 weeks of a weak follow-up."
        ),
        "monitoring_signal": "stream_velocity on release date of next single",
    },
    {
        "name": "TikTok algorithm deprioritizes music",
        "category": "algorithmic",
        "base_severity": "high",
        "base_probability": "possible",
        "impact": (
            "Primary leading indicator goes dark. If tiktok_growth drops >50% WoW, "
            "revise forecast down by 30-40%."
        ),
        "monitoring_signal": "tiktok_growth WoW% — alert if < -30%",
    },
    {
        "name": "Spotify removes from editorial playlist",
        "category": "platform",
        "base_severity": "high",
        "base_probability": "unlikely",
        "impact": (
            "Playlist signal drop kills algorithmic recommendation flywheel. "
            "Stream velocity typically drops 40-60% within 7 days."
        ),
        "monitoring_signal": "playlist_signal daily — alert if drops >30% in 3 days",
    },
    {
        "name": "Skip rate increases sharply",
        "category": "platform",
        "base_severity": "medium",
        "base_probability": "possible",
        "impact": (
            "DSP algorithms deprioritize high-skip tracks. Affects Spotify Radio and "
            "Autoplay, reducing organic discovery."
        ),
        "monitoring_signal": "skip_rate daily — alert if >55% or WoW increase >15 points",
    },
    {
        "name": "Save rate drops below threshold",
        "category": "content",
        "base_severity": "medium",
        "base_probability": "possible",
        "impact": (
            "Leading indicator loss — indicates listener fatigue or audience mismatch. "
            "Breakout timeline extends by 2-4 weeks."
        ),
        "monitoring_signal": "save_rate weekly — alert if <10% or drops >5 points WoW",
    },
    {
        "name": "Bot/fake stream detection",
        "category": "platform",
        "base_severity": "high",
        "base_probability": "unlikely",
        "impact": (
            "DSP flags artist; streams removed in audit. "
            "Can cause -20% to -80% stream count correction."
        ),
        "monitoring_signal": "listener_follower_conversion — drops near zero indicate inflated streams",
    },
    {
        "name": "Broader market event captures attention",
        "category": "market",
        "base_severity": "low",
        "base_probability": "possible",
        "impact": (
            "Competing viral moments (major album releases, cultural events) can temporarily "
            "suppress organic discovery."
        ),
        "monitoring_signal": "tiktok_growth relative to genre peers",
    },
    {
        "name": "Label withdraws promotional support",
        "category": "content",
        "base_severity": "high",
        "base_probability": "unlikely",
        "impact": (
            "Removes playlist pitching, radio promo, and ad spend. "
            "Organic signals may persist but slower growth."
        ),
        "monitoring_signal": "playlist_signal and radio_spike — sudden drops suggest promo withdrawal",
    },
]

_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
_PROB_ORDER = {"likely": 0, "possible": 1, "unlikely": 2}


class RiskAnalyzer:
    """Analyzes risk factors that could derail an artist breakout."""

    def analyze(
        self,
        rolling_stats_map: dict,
        spike_events: list,
        forecast_30d: Forecast,
    ) -> list[RiskFactor]:
        """Return risk factors with probabilities adjusted for current signal state."""
        try:
            risks = []
            for rf in RISK_FACTORS:
                name = rf["name"]
                severity = rf["base_severity"]
                probability = rf["base_probability"]

                # Elevate based on signals
                tiktok = rolling_stats_map.get("tiktok_growth")
                if (
                    "TikTok" in name
                    and tiktok
                    and tiktok.wow_pct is not None
                    and tiktok.wow_pct < -10
                ):
                    probability = "likely"

                skip = rolling_stats_map.get("skip_rate")
                if (
                    "Skip rate" in name
                    and skip
                    and skip.trend_direction == "up"
                ):
                    probability = "likely"

                save = rolling_stats_map.get("save_rate")
                if (
                    "Save rate" in name
                    and save
                    and save.ma_7 is not None
                    and save.ma_7 < 0.10
                ):
                    probability = "likely"

                if (
                    "Second single" in name
                    and forecast_30d.breakout_probability > 0.7
                ):
                    probability = "likely"

                risks.append(RiskFactor(
                    name=name,
                    category=rf["category"],
                    severity=severity,
                    probability=probability,
                    impact_on_forecast=rf["impact"],
                    monitoring_signal=rf["monitoring_signal"],
                ))

            # Sort by severity then probability
            risks.sort(key=lambda r: (
                _SEVERITY_ORDER.get(r.severity, 99),
                _PROB_ORDER.get(r.probability, 99),
            ))

            return risks

        except Exception:
            return [
                RiskFactor(
                    name="Unable to compute risks",
                    category="market",
                    severity="low",
                    probability="possible",
                    impact_on_forecast="Risk analysis failed — review data quality.",
                    monitoring_signal="all signals",
                )
            ]

    def suggest_monitoring(
        self,
        rolling_stats_map: dict,
        leading_indicators: list,
    ) -> list[MonitoringSignal]:
        """Return monitoring signals prioritized by volatility and predictive value."""
        try:
            signals = []

            # Always include these
            signals.append(MonitoringSignal(
                signal="tiktok_growth",
                check_frequency="daily",
                alert_threshold="WoW% drop > 30% or z-score > 2.5",
                why_important="Primary leading indicator — TikTok virality precedes streaming lift by 10-21 days.",
            ))
            signals.append(MonitoringSignal(
                signal="stream_velocity",
                check_frequency="daily",
                alert_threshold="WoW% drop > 20% or acceleration turns negative",
                why_important="Coincident indicator confirming breakout momentum in real time.",
            ))
            signals.append(MonitoringSignal(
                signal="save_rate",
                check_frequency="weekly",
                alert_threshold="Below 10% or drops > 5 percentage points WoW",
                why_important="Leading indicator for sustained fan retention and playlist algorithmic adds.",
            ))

            # Add playlist_signal if data present
            pl = rolling_stats_map.get("playlist_signal")
            if pl and pl.ma_7 is not None:
                signals.append(MonitoringSignal(
                    signal="playlist_signal",
                    check_frequency="daily",
                    alert_threshold="Drops > 30% in 3 days",
                    why_important="Playlist inclusion drives algorithmic recommendation flywheel on DSPs.",
                ))

            # Add follower_velocity if data present
            fv = rolling_stats_map.get("follower_velocity")
            if fv and fv.ma_7 is not None:
                signals.append(MonitoringSignal(
                    signal="follower_velocity",
                    check_frequency="weekly",
                    alert_threshold="WoW% drops > 15% or turns negative",
                    why_important="Follower acceleration precedes chart entry by ~3 weeks.",
                ))

            return signals[:5]

        except Exception:
            return [
                MonitoringSignal(
                    signal="stream_velocity",
                    check_frequency="daily",
                    alert_threshold="Any significant drop",
                    why_important="Core streaming health metric.",
                )
            ]
