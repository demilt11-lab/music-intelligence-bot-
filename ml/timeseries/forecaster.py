"""Breakout probability forecasting using weighted signal scoring."""

import math
from typing import Optional

from .types import Forecast, RollingStats, SpikeEvent


class BreakoutForecaster:
    """Forecasts breakout probability from rolling stats and spike events."""

    def _compute_feature_score(self, rolling_stats: dict) -> float:
        """Score from 0-1 based on signal values."""
        score = 0.0

        try:
            tiktok = rolling_stats.get("tiktok_growth")
            if tiktok and tiktok.velocity is not None and tiktok.velocity > 10:
                score += 0.25

            save_rate = rolling_stats.get("save_rate")
            if save_rate and save_rate.ma_7 is not None and save_rate.ma_7 > 0.15:
                score += 0.20

            stream = rolling_stats.get("stream_velocity")
            if stream and stream.acceleration is not None and stream.acceleration > 0:
                score += 0.15

            follower = rolling_stats.get("follower_velocity")
            if follower and follower.velocity is not None and follower.velocity > 5:
                score += 0.10

            playlist = rolling_stats.get("playlist_signal")
            if playlist and playlist.velocity is not None and playlist.velocity > 0:
                score += 0.10

            chart = rolling_stats.get("chart_momentum")
            if chart and chart.trend_direction == "up":
                score += 0.08

            # No high-severity contradictions base score
            score += 0.12

        except Exception:
            pass

        return min(1.0, max(0.0, score))

    def _score_to_probability(
        self, score: float, horizon_days: int
    ) -> tuple:
        """Map score to (probability, lower_80ci, upper_80ci)."""
        try:
            # Sigmoid centered at 0.5
            base_prob = 1.0 / (1.0 + math.exp(-5.0 * (score - 0.5)))

            if horizon_days >= 90:
                prob = min(0.95, base_prob * 1.35)
            else:
                prob = base_prob

            # CI width depends on score confidence
            if score > 0.7:
                ci_width = 0.20
            elif score >= 0.5:
                ci_width = 0.30
            else:
                ci_width = 0.40

            lower = max(0.02, prob - ci_width / 2)
            upper = min(0.95, prob + ci_width / 2)

            return prob, lower, upper
        except Exception:
            return 0.5, 0.3, 0.7

    def forecast(
        self,
        rolling_stats_map: dict,
        spike_events: list,
        horizon_days: int = 30,
        data_points: int = 0,
    ) -> Forecast:
        """Generate breakout forecast for given horizon."""
        try:
            score = self._compute_feature_score(rolling_stats_map)
            prob, lower, upper = self._score_to_probability(score, horizon_days)

            # Expected breakout day
            expected_breakout_day: Optional[int] = None
            if prob > 0.6:
                expected_breakout_day = int(horizon_days * (1 - score * 0.4))

            # Confidence level
            if score > 0.7 and data_points > 30:
                confidence_level = "high"
                timeline_uncertainty_days = 15
            elif score > 0.5:
                confidence_level = "medium"
                timeline_uncertainty_days = 30
            else:
                confidence_level = "low"
                timeline_uncertainty_days = 45

            # Key drivers (top contributing signals)
            driver_scores = []
            tiktok = rolling_stats_map.get("tiktok_growth")
            if tiktok and tiktok.velocity is not None and tiktok.velocity > 10:
                driver_scores.append(("tiktok_growth velocity", tiktok.velocity))

            save_rate = rolling_stats_map.get("save_rate")
            if save_rate and save_rate.ma_7 is not None and save_rate.ma_7 > 0.15:
                driver_scores.append(("save_rate above threshold", save_rate.ma_7))

            stream = rolling_stats_map.get("stream_velocity")
            if stream and stream.acceleration is not None and stream.acceleration > 0:
                driver_scores.append(("stream_velocity accelerating", stream.acceleration))

            follower = rolling_stats_map.get("follower_velocity")
            if follower and follower.velocity is not None and follower.velocity > 5:
                driver_scores.append(("follower_velocity rising", follower.velocity))

            playlist = rolling_stats_map.get("playlist_signal")
            if playlist and playlist.velocity is not None and playlist.velocity > 0:
                driver_scores.append(("playlist_signal trending up", playlist.velocity))

            driver_scores.sort(key=lambda x: x[1], reverse=True)
            key_drivers = [d[0] for d in driver_scores[:3]]
            if not key_drivers:
                key_drivers = ["insufficient signal strength"]

            explanation = (
                f"{horizon_days}-day breakout forecast: probability={prob:.2f} "
                f"[{lower:.2f}, {upper:.2f}] (80% CI). "
                f"Feature score={score:.2f}. Confidence: {confidence_level}. "
                f"Key drivers: {', '.join(key_drivers)}."
            )

            return Forecast(
                horizon_days=horizon_days,
                breakout_probability=round(prob, 4),
                probability_lower=round(lower, 4),
                probability_upper=round(upper, 4),
                expected_breakout_day=expected_breakout_day,
                timeline_uncertainty_days=timeline_uncertainty_days,
                confidence_level=confidence_level,
                key_drivers=key_drivers,
                explanation=explanation,
            )

        except Exception:
            return Forecast(
                horizon_days=horizon_days,
                breakout_probability=0.1,
                probability_lower=0.02,
                probability_upper=0.3,
                expected_breakout_day=None,
                timeline_uncertainty_days=45,
                confidence_level="low",
                key_drivers=["error computing forecast"],
                explanation="Forecast could not be computed — insufficient data or error.",
            )
