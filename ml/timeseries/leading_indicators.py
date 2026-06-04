"""Leading/lagging indicator classification for artist breakout signals."""

import math
from typing import Optional

from .types import LeadingIndicatorResult, SignalRole

SIGNAL_ROLES = {
    "tiktok_growth": {
        "role": SignalRole.LEADING,
        "avg_lead_days": 14,
        "explanation": (
            "TikTok/UGC virality typically precedes streaming acceleration by 10-21 days "
            "as users discover music through content, then seek it on DSPs."
        ),
    },
    "save_rate": {
        "role": SignalRole.LEADING,
        "avg_lead_days": 7,
        "explanation": (
            "High save rate (>15%) indicates committed fans who return to the track, "
            "a leading indicator of sustained streaming growth and playlist adds."
        ),
    },
    "playlist_signal": {
        "role": SignalRole.LEADING,
        "avg_lead_days": 3,
        "explanation": (
            "Playlist additions (editorial or algorithmic) precede listener count spikes "
            "by 3-7 days as the track is surfaced to new audiences."
        ),
    },
    "follower_velocity": {
        "role": SignalRole.LEADING,
        "avg_lead_days": 21,
        "explanation": (
            "Follower acceleration precedes chart entry — fans follow before a track charts, "
            "as they discover through social/UGC before mainstream awareness."
        ),
    },
    "stream_velocity": {
        "role": SignalRole.COINCIDENT,
        "avg_lead_days": 0,
        "explanation": (
            "Stream velocity moves with breakout events — it confirms but does not lead. "
            "Use as confirmation of what TikTok/save_rate predicted."
        ),
    },
    "chart_momentum": {
        "role": SignalRole.LAGGING,
        "avg_lead_days": -14,
        "explanation": (
            "Chart position is a lagging indicator — charts reflect what already happened "
            "in streaming, not what is about to happen."
        ),
    },
    "radio_spike": {
        "role": SignalRole.LAGGING,
        "avg_lead_days": -21,
        "explanation": (
            "Radio adds typically happen after a track has already demonstrated digital "
            "traction. Radio-first strategies are rare for emerging artists."
        ),
    },
    "listener_follower_conversion": {
        "role": SignalRole.LEADING,
        "avg_lead_days": 10,
        "explanation": (
            "Listener-to-follower conversion rate predicts retention — artists with high "
            "conversion build sustainable audiences vs one-off viral moments."
        ),
    },
}


def _mean(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _pearson_correlation(x: list, y: list) -> float:
    """Compute Pearson correlation between two lists."""
    try:
        paired = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
        if len(paired) < 3:
            return 0.0

        xs, ys = zip(*paired)
        n = len(xs)
        mx = sum(xs) / n
        my = sum(ys) / n

        num = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
        den_x = math.sqrt(sum((a - mx) ** 2 for a in xs) + 1e-12)
        den_y = math.sqrt(sum((b - my) ** 2 for b in ys) + 1e-12)

        return num / (den_x * den_y)
    except Exception:
        return 0.0


class LeadingIndicatorAnalyzer:
    """Classifies signals as leading, lagging, or coincident indicators of breakout."""

    def analyze(
        self,
        snapshots: list[dict],
        prediction_date: str,
    ) -> list[LeadingIndicatorResult]:
        """Analyze all signals and compute correlation with stream_velocity."""
        try:
            filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
            filtered.sort(key=lambda x: x.get("date", ""))

            stream_vals = [s.get("stream_velocity") for s in filtered]
            stream_vals = [float(v) if v is not None else None for v in stream_vals]

            results = []

            for signal, meta in SIGNAL_ROLES.items():
                try:
                    role = meta["role"]
                    avg_lead_days = meta["avg_lead_days"]
                    explanation = meta["explanation"]

                    signal_vals = [s.get(signal) for s in filtered]
                    signal_vals = [float(v) if v is not None else None for v in signal_vals]

                    # Lag the signal by avg_lead_days to compute lagged correlation
                    lag = abs(avg_lead_days)
                    if avg_lead_days > 0:
                        # Leading: signal shifted left vs stream
                        x = signal_vals[:-lag] if lag > 0 else signal_vals
                        y = stream_vals[lag:] if lag > 0 else stream_vals
                    elif avg_lead_days < 0:
                        # Lagging: stream shifted left vs signal
                        x = stream_vals[:-lag] if lag > 0 else stream_vals
                        y = signal_vals[lag:] if lag > 0 else signal_vals
                    else:
                        x = signal_vals
                        y = stream_vals

                    corr = _pearson_correlation(x, y)

                    abs_corr = abs(corr)
                    if abs_corr > 0.6:
                        predictive_value = "high"
                    elif abs_corr > 0.3:
                        predictive_value = "medium"
                    else:
                        predictive_value = "low"

                    results.append(LeadingIndicatorResult(
                        signal=signal,
                        role=role,
                        avg_lead_days=avg_lead_days,
                        correlation_with_streams=round(corr, 4),
                        predictive_value=predictive_value,
                        explanation=explanation,
                    ))
                except Exception:
                    results.append(LeadingIndicatorResult(
                        signal=signal,
                        role=meta["role"],
                        avg_lead_days=meta.get("avg_lead_days"),
                        correlation_with_streams=0.0,
                        predictive_value="low",
                        explanation=meta["explanation"],
                    ))

            return results

        except Exception:
            return []
