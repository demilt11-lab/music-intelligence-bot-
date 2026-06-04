"""Spike detection and classification for artist metric time series."""

import math
from typing import Optional

from .types import SpikeEvent, SpikeType

SPIKE_CAUSES = {
    SpikeType.VIRAL_MEME: "Viral social media content (TikTok/UGC) drove a sudden spike in interest.",
    SpikeType.ALGORITHMIC: "Algorithmic playlist or DSP push surfaced the track to a large new audience.",
    SpikeType.ORGANIC: "Organic listener interest — genuine fan engagement driving sustained growth.",
    SpikeType.NOISE: "One-day anomaly, likely noise or a single viral moment that did not sustain.",
    SpikeType.UNKNOWN: "Cause undetermined — requires manual investigation.",
}


def _mean(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def _std(values: list) -> float:
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return 0.0
    mu = sum(vals) / len(vals)
    variance = sum((v - mu) ** 2 for v in vals) / len(vals)
    return math.sqrt(variance)


class SpikeDetector:
    """Detects and classifies anomalous spikes in artist metric time series."""

    def detect_spikes(
        self,
        snapshots: list[dict],
        signal: str,
        prediction_date: str,
        z_threshold: float = 2.0,
    ) -> list[SpikeEvent]:
        """Detect spikes in a signal using rolling z-score."""
        try:
            filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
            filtered.sort(key=lambda x: x.get("date", ""))

            if len(filtered) < 7:
                return []

            dates = [s.get("date", "") for s in filtered]
            values = [s.get(signal) for s in filtered]
            values_num = [float(v) if v is not None else None for v in values]

            # Also grab tiktok_growth, save_rate, playlist_signal for cross-signal classification
            tiktok = [s.get("tiktok_growth") for s in filtered]
            tiktok = [float(v) if v is not None else None for v in tiktok]
            save_rate = [s.get("save_rate") for s in filtered]
            save_rate = [float(v) if v is not None else None for v in save_rate]
            playlist = [s.get("playlist_signal") for s in filtered]
            playlist = [float(v) if v is not None else None for v in playlist]

            spikes = []

            for i in range(1, len(values_num)):
                if values_num[i] is None:
                    continue

                # Rolling 30-day window (up to i exclusive)
                window_start = max(0, i - 30)
                window = [v for v in values_num[window_start:i] if v is not None]

                if len(window) < 3:
                    continue

                mu = _mean(window)
                sigma = _std(window)
                z = (values_num[i] - mu) / (sigma + 1e-8)

                if abs(z) <= z_threshold:
                    continue

                # Magnitude classification
                abs_z = abs(z)
                if abs_z > 3:
                    magnitude = "major"
                elif abs_z > 2:
                    magnitude = "moderate"
                else:
                    magnitude = "minor"

                # Pre-spike mean (7 days before spike)
                pre_window = [v for v in values_num[max(0, i - 7):i] if v is not None]
                pre_spike_mean = _mean(pre_window) if pre_window else mu

                # Post-spike: days sustained
                post_vals = values_num[i + 1:min(len(values_num), i + 8)]
                post_mean = _mean([v for v in post_vals if v is not None])
                is_sustained = bool(
                    post_mean is not None
                    and pre_spike_mean is not None
                    and post_mean > 1.5 * (abs(pre_spike_mean) + 1e-8)
                )

                days_sustained = 0
                threshold_val = 1.2 * (abs(pre_spike_mean) + 1e-8) if pre_spike_mean is not None else 0
                for j in range(i + 1, min(len(values_num), i + 30)):
                    if values_num[j] is not None and values_num[j] > threshold_val:
                        days_sustained += 1
                    else:
                        break

                # Spike type classification
                spike_type = self._classify_spike_type(
                    signal=signal,
                    idx=i,
                    z_score=z,
                    values=values_num,
                    tiktok=tiktok,
                    save_rate=save_rate,
                    playlist=playlist,
                    days_sustained=days_sustained,
                )

                likely_cause = SPIKE_CAUSES.get(spike_type, SPIKE_CAUSES[SpikeType.UNKNOWN])

                breakout_signal = spike_type == SpikeType.ORGANIC or (
                    spike_type == SpikeType.VIRAL_MEME and is_sustained
                )

                explanation = self._build_explanation(
                    signal=signal,
                    date=dates[i],
                    z=z,
                    spike_type=spike_type,
                    is_sustained=is_sustained,
                    days_sustained=days_sustained,
                    breakout_signal=breakout_signal,
                )

                spikes.append(SpikeEvent(
                    date=dates[i],
                    signal=signal,
                    value=values_num[i],
                    z_score=z,
                    spike_type=spike_type,
                    magnitude=magnitude,
                    is_sustained=is_sustained,
                    days_sustained=days_sustained,
                    likely_cause=likely_cause,
                    breakout_signal=breakout_signal,
                    explanation=explanation,
                ))

            return spikes

        except Exception:
            return []

    def _classify_spike_type(
        self,
        signal: str,
        idx: int,
        z_score: float,
        values: list,
        tiktok: list,
        save_rate: list,
        playlist: list,
        days_sustained: int,
    ) -> SpikeType:
        """Classify the spike type using cross-signal heuristics."""
        try:
            # TikTok signal with high z-score → viral meme
            if signal == "tiktok_growth" and z_score > 3:
                return SpikeType.VIRAL_MEME

            # Stream velocity spike coinciding with recent TikTok spike
            if signal == "stream_velocity":
                # Check for TikTok spike within 3 days
                tiktok_window = tiktok[max(0, idx - 3):idx + 1]
                tiktok_vals = [v for v in tiktok_window if v is not None]
                tiktok_recent = tiktok[max(0, idx - 30):idx]
                tiktok_recent_clean = [v for v in tiktok_recent if v is not None]
                tiktok_mu = _mean(tiktok_recent_clean) if tiktok_recent_clean else None
                tiktok_sigma = _std(tiktok_recent_clean) if tiktok_recent_clean else 0

                tiktok_spiked = False
                if tiktok_mu is not None and tiktok_vals:
                    max_tiktok = max(tiktok_vals)
                    tiktok_z = (max_tiktok - tiktok_mu) / (tiktok_sigma + 1e-8)
                    if tiktok_z > 2:
                        tiktok_spiked = True

                if tiktok_spiked:
                    return SpikeType.VIRAL_MEME

                # Playlist signal elevated same day → algorithmic
                if idx < len(playlist) and playlist[idx] is not None:
                    pl_window = playlist[max(0, idx - 30):idx]
                    pl_clean = [v for v in pl_window if v is not None]
                    if pl_clean:
                        pl_mu = _mean(pl_clean)
                        pl_sigma = _std(pl_clean)
                        pl_z = (playlist[idx] - pl_mu) / (pl_sigma + 1e-8)
                        if pl_z > 1.5:
                            return SpikeType.ALGORITHMIC

            # High z-score AND save_rate elevated → organic
            if z_score > 3 and idx < len(save_rate) and save_rate[idx] is not None:
                sr_window = save_rate[max(0, idx - 30):idx]
                sr_clean = [v for v in sr_window if v is not None]
                if sr_clean:
                    sr_mu = _mean(sr_clean)
                    sr_sigma = _std(sr_clean)
                    sr_z = (save_rate[idx] - sr_mu) / (sr_sigma + 1e-8)
                    if sr_z > 1.0:
                        return SpikeType.ORGANIC

            # 1-day spike then reverts → noise
            if days_sustained == 0:
                return SpikeType.NOISE

            return SpikeType.UNKNOWN

        except Exception:
            return SpikeType.UNKNOWN

    def _build_explanation(
        self,
        signal: str,
        date: str,
        z: float,
        spike_type: SpikeType,
        is_sustained: bool,
        days_sustained: int,
        breakout_signal: bool,
    ) -> str:
        """Build human-readable explanation for a spike event."""
        sustain_str = (
            f"Sustained for {days_sustained} days after spike." if is_sustained
            else "Did not sustain — values reverted to baseline."
        )
        breakout_str = "This is a genuine breakout indicator." if breakout_signal else "Not classified as a breakout signal."
        return (
            f"Spike detected in '{signal}' on {date} (z={z:.2f}, type={spike_type.value}). "
            f"{sustain_str} {breakout_str}"
        )

    def classify_one_day_spike(
        self,
        snapshots: list[dict],
        signal: str,
        spike_date: str,
        prediction_date: str,
    ) -> str:
        """Return explanation for a single-day spike."""
        try:
            filtered = [s for s in snapshots if s.get("date", "") <= prediction_date]
            filtered.sort(key=lambda x: x.get("date", ""))

            dates = [s.get("date", "") for s in filtered]
            values = [s.get(signal) for s in filtered]
            values_num = [float(v) if v is not None else None for v in values]

            if spike_date not in dates:
                return f"One-day spike on {spike_date} not found in filtered data."

            idx = dates.index(spike_date)
            window = [v for v in values_num[max(0, idx - 30):idx] if v is not None]
            if not window:
                return f"Insufficient data to characterize spike on {spike_date}."

            mu = _mean(window)
            sigma = _std(window)
            z = (values_num[idx] - mu) / (sigma + 1e-8) if values_num[idx] is not None else 0.0

            return (
                f"One-day {signal} spike detected on {spike_date}. Z-score={z:.1f}. "
                f"Values reverted next day — likely noise from a single viral moment, "
                f"not a sustained trend. Monitor for recurrence."
            )
        except Exception:
            return f"One-day spike on {spike_date} — insufficient data for detailed analysis."
