"""Trend detection: rolling statistics and regime change detection."""

from typing import Optional
import math

try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False

from .types import RollingStats, RegimeChange, RegimeType

KNOWN_SIGNALS = [
    "stream_velocity",
    "tiktok_growth",
    "save_rate",
    "follower_velocity",
    "chart_momentum",
    "playlist_signal",
    "radio_spike",
    "skip_rate",
    "listener_follower_conversion",
]


def _mean(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _rolling_mean(values: list, window: int) -> Optional[float]:
    if len(values) < window:
        return None
    return _mean(values[-window:])


class TrendDetector:
    """Computes rolling statistics and detects regime changes in artist metric time series."""

    def compute_rolling_stats(
        self,
        snapshots: list[dict],
        signal: str,
        prediction_date: str,
    ) -> RollingStats:
        """Compute rolling statistics for a single signal up to prediction_date."""
        try:
            filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
            filtered.sort(key=lambda x: x.get("date", ""))

            values = [s.get(signal) for s in filtered]
            values = [float(v) if v is not None else None for v in values]
            clean = [v for v in values if v is not None]

            ma_7 = _rolling_mean(clean, 7)
            ma_14 = _rolling_mean(clean, 14)
            ma_30 = _rolling_mean(clean, 30)

            # WoW%: current 7-day avg vs previous 7-day avg
            wow_pct = None
            if len(clean) >= 14:
                curr_avg = _mean(clean[-7:])
                prev_avg = _mean(clean[-14:-7])
                if curr_avg is not None and prev_avg is not None:
                    wow_pct = (curr_avg - prev_avg) / (abs(prev_avg) + 1e-8) * 100

            # MoM%: current 30-day avg vs previous 30-day avg
            mom_pct = None
            if len(clean) >= 60:
                curr_avg = _mean(clean[-30:])
                prev_avg = _mean(clean[-60:-30])
                if curr_avg is not None and prev_avg is not None:
                    mom_pct = (curr_avg - prev_avg) / (abs(prev_avg) + 1e-8) * 100

            velocity = wow_pct  # current growth rate (smoothed via 7-day windows)

            # Acceleration: velocity[t] - velocity[t-7]
            acceleration = None
            if len(clean) >= 21:
                prev_wow_curr = _mean(clean[-14:-7])
                prev_wow_prev = _mean(clean[-21:-14])
                if prev_wow_curr is not None and prev_wow_prev is not None:
                    prev_velocity = (prev_wow_curr - prev_wow_prev) / (abs(prev_wow_prev) + 1e-8) * 100
                    if velocity is not None:
                        acceleration = velocity - prev_velocity

            # Trend direction
            if velocity is not None and velocity > 2:
                trend_direction = "up"
            elif velocity is not None and velocity < -2:
                trend_direction = "down"
            else:
                trend_direction = "flat"

            # Trend strength: abs(velocity) / 100, capped at 1.0
            trend_strength = min(1.0, abs(velocity) / 100.0) if velocity is not None else 0.0

            return RollingStats(
                signal=signal,
                ma_7=ma_7,
                ma_14=ma_14,
                ma_30=ma_30,
                wow_pct=wow_pct,
                mom_pct=mom_pct,
                velocity=velocity,
                acceleration=acceleration,
                trend_direction=trend_direction,
                trend_strength=trend_strength,
            )
        except Exception as e:
            return RollingStats(
                signal=signal,
                ma_7=None,
                ma_14=None,
                ma_30=None,
                wow_pct=None,
                mom_pct=None,
                velocity=None,
                acceleration=None,
                trend_direction="flat",
                trend_strength=0.0,
            )

    def compute_all_rolling_stats(
        self,
        snapshots: list[dict],
        prediction_date: str,
    ) -> list[RollingStats]:
        """Compute rolling stats for all known signals."""
        results = []
        for signal in KNOWN_SIGNALS:
            results.append(self.compute_rolling_stats(snapshots, signal, prediction_date))
        return results

    def _classify_regime(self, velocity: Optional[float], acceleration: Optional[float], values: list, idx: int) -> RegimeType:
        """Classify current regime from velocity, acceleration, and recent values."""
        v = velocity if velocity is not None else 0.0
        a = acceleration if acceleration is not None else 0.0

        # Breakout: value increases > 50% in 7 days
        if idx >= 7 and values[idx] is not None:
            prev_val = values[max(0, idx - 7)]
            if prev_val is not None and prev_val > 1e-8:
                if (values[idx] - prev_val) / prev_val > 0.5:
                    return RegimeType.BREAKOUT

        if v < -10:
            return RegimeType.DECLINE
        if v > 5 and a > 0:
            return RegimeType.ACCELERATION
        if v < -3 and a < 0:
            return RegimeType.DECELERATION
        if abs(v) < 2:
            return RegimeType.PLATEAU

        return RegimeType.PLATEAU

    def detect_regime_changes(
        self,
        snapshots: list[dict],
        signal: str,
        prediction_date: str,
    ) -> list[RegimeChange]:
        """Detect regime changes for a single signal."""
        try:
            filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
            filtered.sort(key=lambda x: x.get("date", ""))

            if len(filtered) < 14:
                return []

            dates = [s.get("date", "") for s in filtered]
            values = [s.get(signal) for s in filtered]
            values = [float(v) if v is not None else None for v in values]

            changes = []
            prev_regime = None
            # Track if we were in decline (for recovery detection)
            was_in_decline = False

            for i in range(7, len(values)):
                window = [v for v in values[max(0, i - 7):i] if v is not None]
                if not window:
                    continue

                # Compute local velocity
                curr_win = [v for v in values[max(0, i - 7):i + 1] if v is not None]
                prev_win = [v for v in values[max(0, i - 14):i - 7] if v is not None]

                curr_avg = _mean(curr_win)
                prev_avg = _mean(prev_win)

                velocity = None
                if curr_avg is not None and prev_avg is not None:
                    velocity = (curr_avg - prev_avg) / (abs(prev_avg) + 1e-8) * 100

                acceleration = None
                if i >= 14:
                    older_win = [v for v in values[max(0, i - 21):i - 14] if v is not None]
                    older_avg = _mean(older_win)
                    if older_avg is not None and prev_avg is not None:
                        prev_vel = (prev_avg - older_avg) / (abs(older_avg) + 1e-8) * 100
                        if velocity is not None:
                            acceleration = velocity - prev_vel

                current_regime = self._classify_regime(velocity, acceleration, values, i)

                # Recovery override: velocity > 3% after decline
                if was_in_decline and velocity is not None and velocity > 3:
                    current_regime = RegimeType.RECOVERY

                if current_regime == RegimeType.DECLINE:
                    was_in_decline = True
                elif current_regime not in (RegimeType.DECELERATION, RegimeType.PLATEAU):
                    was_in_decline = False

                if prev_regime is not None and current_regime != prev_regime:
                    magnitude = abs(velocity) if velocity is not None else 0.0
                    confidence = min(1.0, magnitude / 20.0)

                    explanation = (
                        f"Signal '{signal}' shifted from {prev_regime.value} to {current_regime.value} "
                        f"on {dates[i]} with velocity={velocity:.1f}% "
                        f"and acceleration={acceleration:.1f}%" if acceleration is not None
                        else f"Signal '{signal}' shifted from {prev_regime.value} to {current_regime.value} "
                             f"on {dates[i]} with velocity={velocity:.1f}%"
                    )

                    changes.append(RegimeChange(
                        date=dates[i],
                        signal=signal,
                        from_regime=prev_regime,
                        to_regime=current_regime,
                        magnitude=magnitude,
                        confidence=confidence,
                        explanation=explanation,
                    ))

                prev_regime = current_regime

            return changes

        except Exception as e:
            return []
