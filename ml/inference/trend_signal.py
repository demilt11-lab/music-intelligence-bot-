# ml/inference/trend_signal.py
"""
Real-time trend signal scorer.
Monitors the TikTok UGC snapshot stream and computes:
- Acceleration score per sound
- Cross-region spread velocity
- Pre-viral alert thresholds
- Genre/BPM/key/language trending profiles
"""

import os
import json
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
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
}


@dataclass
class TrendAlert:
    track_id: int
    isrc: Optional[str]
    alert_type: str
    score: float
    reason: str
    region: Optional[str]
    genre: Optional[str]
    bpm: Optional[float]
    musical_key: Optional[str]
    language: Optional[str]
    detected_at: str


def compute_acceleration(
    current_growth: float,
    prior_growth: float,
) -> float:
    """How much is the growth rate itself accelerating?"""
    return current_growth - prior_growth


def compute_spread_velocity(
    region_counts: Dict[str, int],
    prior_region_counts: Dict[str, int],
) -> float:
    """How fast is the song spreading to new regions?"""
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
    Returns score + which thresholds triggered.
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

    genre_bpm_score = compute_genre_bpm_alignment(
        features.get("genre_primary"),
        features.get("bpm"),
    )
    score = min(score + genre_bpm_score * 0.1
