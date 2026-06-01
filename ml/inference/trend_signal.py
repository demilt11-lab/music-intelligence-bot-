# ml/inference/trend_signal.py
"""
Real-time trend signal scorer.
Monitors TikTok UGC snapshot stream and computes:
- Acceleration score per sound
- Cross-region spread velocity  
- Pre-viral alert thresholds
- Genre/BPM/key/language trending profiles
- Alert generation for rising songs before mainstream discovery
"""

import os
import json
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict, field
from datetime import datetime
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PRE_VIRAL_THRESHOLDS = {
    "tiktok_growth_rate_7d": 0.15,
    "playlist_adds_7d": 2,
    "cross_platform_score": 0.4,
    "tiktok_region_diversity_score": 0.3,
    "viral_probability": 0.45,
}

GENRE_BPM_TREND_WINDOWS = {
    "pop": (90, 140),
    "hip-hop": (70, 110),
    "dance": (120, 135),
    "afrobeats": (95, 115),
    "latin": (90, 120),
    "trap": (130, 160),
    "amapiano": (100, 115),
    "drill": (130, 145),
    "r&b": (60, 100),
    "reggaeton": (90, 105),
    "k-pop": (100, 135),
}

TRIGGER_REGIONS = ["US", "BR", "PH", "NG", "GB", "MX", "ID"]


@dataclass
class TrendAlert:
    track_id: int
    isrc: Optional[str]
    alert_type: str        # pre_viral | rising | regional_breakout | genre_trend
    score: float           # 0-1 composite
    reason: str
    region: Optional[str]
    genre: Optional[str]
    bpm: Optional[float]
    musical_key: Optional[str]
    language: Optional[str]
    detected_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


def compute_acceleration(current_growth: float, prior_growth: float) -> float:
    """How much is the growth rate itself accelerating."""
    return current_growth - prior_growth


def compute_spread_velocity(
    region_counts: Dict[str, int],
    prior_region_counts: Dict[str, int],
) -> float:
    """How fast is the song spreading to new regions."""
    current_regions = set(region_counts.keys())
    prior_regions = set(prior_region_counts.keys())
    new_regions = current_regions - prior_regions
    return float(len(new_regions))


def compute_genre_bpm_alignment(
    genre: Optional[str],
    bpm: Optional[float],
) -> float:
    """
    Is this song's BPM in the trending range for its genre?
    Returns 1.0 if aligned, 0.5 if close, 0.0 if outside.
    """
    if not genre or not bpm:
        return 0.5
    genre_lower = genre.lower()
    for g, (lo, hi) in GENRE_BPM_TREND_WINDOWS.items():
        if g in genre_lower:
            if lo <= bpm <= hi:
                return 1.0
            elif abs(bpm - lo) <= 10 or abs(bpm - hi) <= 10:
                return 0.5
            return 0.0
    return 0.5


def score_pre_viral_signal(features: Dict) -> Dict:
    """
    Computes a composite pre-viral signal score.
    Returns score (0-1) and which thresholds triggered.
    """
    triggered = []
    score = 0.0

    checks = [
        ("tiktok_growth_rate_7d", 0.30),
        ("playlist_adds_7d", 0.20),
        ("cross_platform_score", 0.20),
        ("tiktok_region_diversity_score", 0.15),
        ("viral_probability", 0.15),
    ]

    for key, weight in checks:
        val = float(features.get(key) or 0)
        threshold = PRE_VIRAL_THRESHOLDS.get(key, 0)
        if val >= threshold:
            score += weight
            triggered.append(key)

    genre_bpm = compute_genre_bpm_alignment(
        features.get("genre_primary"),
        features.get("bpm"),
    )
    score = min(score + genre_bpm * 0.1, 1.0)

    return {
        "pre_viral_score": round(score, 4),
        "triggered_signals": triggered,
        "genre_bpm_aligned": genre_bpm >= 1.0,
    }


def score_regional_breakout(features: Dict) -> List[Dict]:
    """
    Identifies which trigger regions this track is breaking into.
    Returns list of region breakout signals.
    """
    breakouts = []
    active_regions = features.get("active_regions") or []
    region_counts = features.get("region_video_counts") or {}
    tiktok_growth = float(features.get("tiktok_growth_rate_7d") or 0)
    top_region = features.get("tiktok_top_region") or features.get("top_country_1")

    for region in TRIGGER_REGIONS:
        in_region = region in active_regions or region == top_region
        count = region_counts.get(region, 0)

        if in_region and tiktok_growth > 0.1:
            breakout_score = min(
                (count / (sum(region_counts.values()) + 1)) * 0.6
                + tiktok_growth * 0.4,
                1.0,
            )
            if breakout_score > 0.15:
                breakouts.append({
                    "region": region,
                    "breakout_score": round(breakout_score, 4),
                    "video_count": count,
                    "tiktok_growth_7d": round(tiktok_growth, 4),
                })

    breakouts.sort(key=lambda x: x["breakout_score"], reverse=True)
    return breakouts


def generate_alerts(
    features: Dict,
    viral_probability: Optional[float] = None,
    trajectory_state: Optional[str] = None,
) -> List[TrendAlert]:
    """
    Master alert generator. Runs all signal scorers and
    returns a list of TrendAlert objects for this track.
    """
    alerts = []
    track_id = int(features.get("trackId") or 0)
    isrc = features.get("isrc")
    genre = features.get("genre_primary")
    bpm = features.get("bpm")
    key = features.get("musical_key")
    language = features.get("language")

    # 1. Pre-viral alert
    pre_viral = score_pre_viral_signal(features)
    if pre_viral["pre_viral_score"] >= 0.5:
        alerts.append(TrendAlert(
            track_id=track_id,
            isrc=isrc,
            alert_type="pre_viral",
            score=pre_viral["pre_viral_score"],
            reason=(
                f"Pre-viral signals triggered: "
                f"{', '.join(pre_viral['triggered_signals'])}. "
                f"Genre/BPM aligned: {pre_viral['genre_bpm_aligned']}"
            ),
            region=None,
            genre=genre,
            bpm=bpm,
            musical_key=key,
            language=language,
        ))

    # 2. Rising trajectory alert — matches lowercased TRAJ_LABELS values
    if trajectory_state in ("growing", "about_to_break"):
        tiktok_growth = float(features.get("tiktok_growth_rate_7d") or 0)
        playlist_adds = int(features.get("playlist_adds_7d") or 0)
        score = min(
            (tiktok_growth * 0.5) +
            (min(playlist_adds / 10.0, 1.0) * 0.3) +
            ((viral_probability or 0) * 0.2),
            1.0,
        )
        alerts.append(TrendAlert(
            track_id=track_id,
            isrc=isrc,
            alert_type="rising",
            score=round(score, 4),
            reason=(
                f"Trajectory state: {trajectory_state}. "
                f"TikTok 7d growth: {tiktok_growth:.2%}. "
                f"Playlist adds (7d): {playlist_adds}."
            ),
            region=None,
            genre=genre,
            bpm=bpm,
            musical_key=key,
            language=language,
        ))

    # 3. Regional breakout alerts
    breakouts = score_regional_breakout(features)
    for b in breakouts:
        alerts.append(TrendAlert(
            track_id=track_id,
            isrc=isrc,
            alert_type="regional_breakout",
            score=b["breakout_score"],
            reason=(
                f"Breaking in {b['region']} with "
                f"{b['video_count']} TikTok videos "
                f"and {b['tiktok_growth_7d']:.2%} 7d growth."
            ),
            region=b["region"],
            genre=genre,
            bpm=bpm,
            musical_key=key,
            language=language,
        ))

    # 4. Genre trend alignment alert
    genre_bpm = compute_genre_bpm_alignment(genre, bpm)
    if genre_bpm >= 1.0 and (viral_probability or 0) >= 0.35:
        alerts.append(TrendAlert(
            track_id=track_id,
            isrc=isrc,
            alert_type="genre_trend",
            score=round(genre_bpm * (viral_probability or 0.35), 4),
            reason=(
                f"{genre} track with BPM {bpm} is in the "
                f"trending range for this genre. "
                f"Language: {language}."
            ),
            region=None,
            genre=genre,
            bpm=bpm,
            musical_key=key,
            language=language,
        ))

    alerts.sort(key=lambda a: a.score, reverse=True)
    return alerts


def alerts_to_dict(alerts: List[TrendAlert]) -> List[Dict]:
    return [asdict(a) for a in alerts]


if __name__ == "__main__":
    sample = {
        "trackId": 999,
        "isrc": "USTEST00001",
        "genre_primary": "afrobeats",
        "bpm": 108.0,
        "musical_key": "F#",
        "mode": "minor",
        "language": "en",
        "tiktok_growth_rate_7d": 0.35,
        "playlist_adds_7d": 5,
        "cross_platform_score": 0.6,
        "tiktok_region_diversity_score": 0.5,
        "viral_probability": 0.62,
        "active_regions": ["NG", "GB", "US"],
        "region_video_counts": {"NG": 12000, "GB": 4000, "US": 8000},
        "tiktok_top_region": "NG",
        "top_country_1": "NG",
    }

    pv = score_pre_viral_signal(sample)
    print("Pre-viral:", pv)

    alerts = generate_alerts(sample, viral_probability=0.62, trajectory_state="rising")
    print("Alerts:", json.dumps(alerts_to_dict(alerts), indent=2))
