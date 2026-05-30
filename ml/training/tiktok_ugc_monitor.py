# ml/training/tiktok_ugc_monitor.py
"""
Continuously monitors TikTok UGC trends:
- Which sounds/songs are being used in new videos
- Genre, language, BPM, key, region patterns
- Velocity of adoption
- Cross-region spread patterns
- Pre-viral signals (early acceleration)
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict, field
import requests
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_BASE = os.environ.get("API_BASE", "https://your-api-host.com")
API_KEY = os.environ.get("API_KEY", "")
HEADERS = {"x-api-key": API_KEY}

MONITOR_INTERVAL_SECONDS = int(os.environ.get("MONITOR_INTERVAL", 3600))  # 1 hr

TIKTOK_CHART_TYPES = [
    "top",
    "trending",
    "rising",
    "breakout",
]

TIKTOK_REGIONS = [
    "US", "GB", "BR", "MX", "DE", "FR", "NG", "PH", "ID", "IN",
    "AU", "CA", "JP", "KR", "ZA", "IT", "ES", "CO", "AR", "TR",
]


@dataclass
class UGCSoundSnapshot:
    """One point-in-time snapshot of a sound's TikTok UGC signals."""
    sound_id: str
    track_id: Optional[int]
    isrc: Optional[str]
    name: Optional[str]
    artist: Optional[str]
    snapshot_at: str

    # Audio features
    bpm: Optional[float]
    musical_key: Optional[str]
    mode: Optional[str]
    energy: Optional[float]
    danceability: Optional[float]
    valence: Optional[float]
    language: Optional[str]
    genre_primary: Optional[str]

    # UGC volume
    video_count: Optional[int]
    view_count: Optional[float]
    like_count: Optional[float]
    share_count: Optional[float]
    comment_count: Optional[float]

    # Velocity (delta since last snapshot)
    video_count_delta: Optional[int]
    view_count_delta: Optional[float]
    velocity_score: Optional[float]   # composite UGC velocity

    # Geographic spread
    active_regions: List[str] = field(default_factory=list)
    region_video_counts: Dict[str, int] = field(default_factory=dict)
    region_spread_score: Optional[float] = None   # entropy-based geo diversity
    first_region: Optional[str] = None            # where it broke first
    spread_lag_days: Optional[float] = None       # how long from first to global

    # Chart context
    chart_rank: Optional[int] = None
    chart_type: Optional[str] = None
    pre_rank_delta: Optional[int] = None          # rank improvement since last
