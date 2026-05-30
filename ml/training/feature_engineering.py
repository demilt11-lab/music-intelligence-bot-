# ml/training/feature_engineering.py
"""
Feature engineering pipeline.
Transforms raw collected features into ML-ready vectors.
Handles:
  - Audio feature normalization (BPM, key, mode, energy, danceability)
  - TikTok UGC velocity signals
  - Cross-platform momentum scores
  - Geographic spread encoding
  - Temporal window features (7d, 14d, 30d deltas)
  - Genre/language one-hot encoding
  - Derived composite scores
"""

import json
import os
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.impute import SimpleImputer
import joblib
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Musical key encoding ─────────────────────────────────────────────────────
# Encodes keys as pitch class (0-11) so model understands tonal proximity
KEY_MAP = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
    "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
    "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
}

MODE_MAP = {"major": 1, "minor": 0}

# Camelot wheel position (useful for DJ mixing / sound compatibility signals)
CAMELOT_MAP = {
    "C major": (8, 1), "C minor": (5, 0),
    "C# major": (3, 1), "C# minor": (12, 0),
    "D major": (10, 1), "D minor": (7, 0),
    "D# major": (5, 1), "D# minor": (2, 0),
    "E major": (12, 1), "E minor": (9, 0),
    "F major": (7, 1), "F minor": (4, 0),
    "F# major": (2, 1), "F# minor": (11, 0),
    "G major": (9, 1), "G minor": (6, 0),
    "G# major": (4, 1), "G# minor": (1, 0),
    "A major": (11, 1), "A minor": (8, 0),
    "A# major": (6, 1), "A# minor": (3, 0),
    "B major": (1, 1), "B minor": (10, 0),
}

# BPM buckets for trend clustering
BPM_BUCKETS = [
    (0, 70, "very_slow"),
    (70, 90, "slow"),
    (90, 110, "moderate"),
    (110, 128, "upbeat"),
    (128, 150, "fast"),
    (150, 999, "very_fast"),
]

# Tier-1 viral trigger regions (historically where viral songs break first)
TRIGGER_REGIONS = ["US", "BR", "PH", "NG", "GB", "MX", "ID"]

# Top-20 languages by TikTok UGC volume
TOP_LANGUAGES = [
    "en", "es", "pt", "hi", "id", "tl", "fr", "de",
    "ja", "ko", "tr", "ar", "th", "vi", "it", "ru",
    "nl", "pl", "sv", "zh",
]

TOP_GENRES = [
    "pop", "hip-hop", "rap", "r&b", "dance", "electronic",
    "latin", "afrobeats", "reggaeton", "country", "rock",
    "indie", "trap", "drill", "amapiano", "k-pop", "j-pop",
    "gospel", "soul", "alternative",
]


def encode_key(key: Optional[str], mode: Optional[str]) -> Dict[str, float]:
    """Encodes musical key as pitch class, camelot wheel, and mode."""
    pitch_class = KEY_MAP.get(key, -1) if key else -1
    mode_val = MODE_MAP.get(mode, -1) if mode else -1

    camelot_key = f"{key} {mode}" if key and mode else None
    camelot_pos = CAMELOT_MAP.get(camelot_key, (-1, -1))

    # Circular encoding of pitch class (avoids discontinuity at B→C)
    pitch_sin = np.sin(2 * np.pi * pitch_class / 12) if pitch_class >= 0 else 0.0
    pitch_cos = np.cos(2 * np.pi * pitch_class / 12) if pitch_class >= 0 else 0.0

    return {
        "key_pitch_class": float(pitch_class),
        "key_pitch_sin": float(pitch_sin),
        "key_pitch_cos": float(pitch_cos),
        "key_mode": float(mode_val),
        "camelot_position": float(camelot_pos[0]),
    }


def encode_bpm(bpm: Optional[float]) -> Dict[str, float]:
    """Encodes BPM as raw value plus bucket one-hot."""
    result = {"bpm_raw": float(bpm) if bpm else 0.0}

    for lo, hi, label in BPM_BUCKETS:
        result[f"bpm_bucket_{label}"] = (
            1.0 if bpm and lo <= bpm < hi else 0.0
        )

    # Circular encoding of BPM tempo (useful for tempo-trend detection)
    if bpm:
        result["bpm_sin_120"] = float(np.sin(2 * np.pi * bpm / 120))
        result["bpm_cos_120"] = float(np.cos(2 * np.pi * bpm / 120))
    else:
        result["bpm_sin_120"] = 0.0
        result["bpm_cos_120"] = 0.0

    return result


def encode_language(language: Optional[str]) -> Dict[str, float]:
    """One-hot encodes language with an 'other' bucket."""
    lang = (language or "").lower().strip()
    return {
        f"lang_{l}": 1.0 if lang == l else 0.0
        for l in TOP_LANGUAGES
    } | {"lang_other": 1.0 if lang not in TOP_LANGUAGES else 0.0}


def encode_genre(genre: Optional[str]) -> Dict[str, float]:
    """One-hot encodes primary genre with an 'other' bucket."""
    g = (genre or "").lower().strip()
    return {
        f"genre_{genre_name.replace('-', '_').replace('&', 'and').replace(' ', '_')}":
        1.0 if g == genre_name else 0.0
        for genre_name in TOP_GENRES
    } | {"genre_other": 1.0 if g not in TOP_GENRES else 0.0}


def encode_geo(
    active_regions: Optional[List[str]],
    region_counts: Optional[Dict[str, int]],
    top_country_1: Optional[str],
) -> Dict[str, float]:
    """Encodes geo spread as trigger region flags + entropy-based diversity."""
    regions = active_regions or []
    counts = region_counts or {}

    trigger_flags = {
        f"region_{r.lower()}": 1.0 if r in regions else 0.0
        for r in TRIGGER_REGIONS
    }

    # Shannon entropy of region distribution (higher = more diverse spread)
    if counts:
        total = sum(counts.values())
        probs = [v / total for v in counts.values() if v > 0]
        entropy = -sum(p * np.log(p + 1e-9) for p in probs)
    else:
        entropy = 0.0

    trigger_flags["geo_entropy"] = float(entropy)
    trigger_flags["geo_active_region_count"] = float(len(regions))
    trigger_flags["geo_first_is_trigger"] = (
        1.0 if top_country_1 in TRIGGER_REGIONS else 0.0
    )

    return trigger_flags


def compute_cross_platform_momentum(row: Dict) -> Dict[str, float]:
    """
    Derives composite momentum scores across platforms.
    These are engineered features the model can't easily learn raw.
    """
    spotify_vel = float(row.get("spotify_stream_velocity_7d") or 0)
    tiktok_growth = float(row.get("tiktok_growth_rate_7d") or 0)
    playlist_adds = float(row.get("playlist_adds_7d") or 0)
    radio_spins = float(row.get("radio_spins_7d") or 0)
    youtube_vel = float(row.get("youtube_view_velocity_7d") or 0)
    playlist_editorial = float(row.get("spotify_editorial_playlist_count") or 0)

    # Viral momentum: TikTok + Spotify velocity combined
    viral_momentum = (
        tiktok_growth * 0.5 +
        (spotify_vel / (abs(spotify_vel) + 1)) * 0.3 +
        (1 if playlist_adds > 0 else 0) * 0.2
    )

    # Radio breakout: spins + new markets
    radio_momentum = (
        min(radio_spins / 100.0, 1.0) * 0.6 +
        min(float(row.get("radio_market_count") or 0) / 20.0, 1.0) * 0.4
    )

    # Pre-viral signal: editorial playlists + TikTok early growth
    pre_viral_signal = (
        min(playlist_editorial / 5.0, 1.0) * 0.4 +
        max(tiktok_growth, 0) * 0.4 +
        min(float(row.get("playlist_adds_7d") or 0) / 10.0, 1.0) * 0.2
    )

    # Cross-platform confirmation: multiple platforms rising
    cross_platform_score = sum([
        1 if spotify_vel > 0 else 0,
        1 if tiktok_growth > 0.1 else 0,
        1 if youtube_vel > 0 else 0,
        1 if radio_spins > 10 else 0,
        1 if playlist_adds > 0 else 0,
    ]) / 5.0

    return {
        "viral_momentum_score": float(viral_momentum),
        "radio_momentum_score": float(radio_momentum),
        "pre_viral_signal_score": float(pre_viral_signal),
        "cross_platform_score": float(cross_platform_score),
    }


def compute_tiktok_ugc_signals(row: Dict) -> Dict[str, float]:
    """
    Derives TikTok-specific UGC acceleration signals.
    These are the most predictive features for early viral detection.
    """
    video_count = float(row.get("tiktok_video_count") or 0)
    delta_7d = float(row.get("tiktok_video_count_7d_delta") or 0)
    delta_30d = float(row.get("tiktok_video_count_30d_delta") or 0)
    growth_7d = float(row.get("tiktok_growth_rate_7d") or 0)
    avg_views = float(row.get("tiktok_avg_views_per_video") or 0)
    avg_likes = float(row.get("tiktok_avg_likes_per_video") or 0)
    region_diversity = float(row.get("tiktok_region_diversity_score") or 0)

    # Acceleration: is the 7d growth rate itself increasing?
    accel = growth_7d - float(row.get("tiktok_growth_rate_30d") or 0)

    # Engagement quality: likes-to-views ratio
    engagement_ratio = avg_likes / (avg_views + 1)

    # UGC density: videos per unit of total views
    ugc_density = video_count / (float(row.get("youtube_views") or 1) + 1)

    return {
        "tiktok_ugc_acceleration": float(accel),
        "tiktok_engagement_ratio": float(engagement_ratio),
        "tiktok_ugc_density": float(ugc_density),
        "tiktok_7d_delta_normalized": float(
            delta_7d / (video_count + 1)
        ),
        "tiktok_30d_delta_normalized": float(
            delta_30d / (video_count + 1)
        ),
        "tiktok_geo_diversity": float(region_diversity),
    }


NUMERIC_BASE_FEATURES = [
    "spotify_streams",
    "spotify_popularity",
    "spotify_stream_velocity_7d",
    "spotify_stream_velocity_30d",
    "spotify_playlist_count",
    "spotify_editorial_playlist_count",
    "tiktok_video_count",
    "tiktok_growth_rate_7d",
    "tiktok_growth_rate_30d",
    "tiktok_avg_views_per_video",
    "tiktok_avg_likes_per_video",
    "youtube_views",
    "youtube_shorts_views",
    "youtube_view_velocity_7d",
    "radio_spins_7d",
    "radio_spins_30d",
    "radio_spin_velocity",
    "radio_market_count",
    "playlist_total_count",
    "playlist_adds_7d",
    "playlist_adds_30d",
    "playlist_editorial_adds_7d",
    "playlist_avg_position",
    "trigger_city_count",
    "chart_count",
    "chart_peak_rank",
    "chart_days_on_chart",
    "chart_rank_velocity",
    "energy",
    "danceability",
    "valence",
    "loudness",
    "duration_ms",
]


def engineer_features(row: Dict) -> Dict[str, float]:
    """
# --- continuation of feature_engineering.py ---

def engineer_features(row: Dict) -> Dict[str, float]:
    """
    Master feature engineering function.
    Takes one raw row and returns a flat dict of ML-ready features.
    """
    features = {}

    # 1. Numeric base features (log-scale large counts)
    for key in NUMERIC_BASE_FEATURES:
        val = row.get(key)
        if val is None:
            features[key] = 0.0
        else:
            fval = float(val)
            # Log-scale stream/view/count features to handle skew
            if any(k in key for k in ["streams", "views", "count", "spins"]):
                features[key] = float(np.log1p(max(fval, 0)))
            else:
                features[key] = fval

    # 2. Audio encoding
    features.update(encode_key(row.get("musical_key"), row.get("mode")))
    features.update(encode_bpm(row.get("bpm")))

    # 3. Language + genre one-hot
    features.update(encode_language(row.get("language")))
    features.update(encode_genre(row.get("genre_primary")))

    # 4. Geo encoding
    features.update(encode_geo(
        row.get("active_regions"),
        row.get("region_video_counts"),
        row.get("top_country_1"),
    ))

    # 5. Cross-platform momentum
    features.update(compute_cross_platform_momentum(row))

    # 6. TikTok UGC signals
    features.update(compute_tiktok_ugc_signals(row))

    return features


def build_feature_matrix(
    rows: List[Dict],
    fit_scaler: bool = True,
    scaler_path: str = "output/models/scaler.pkl",
) -> Tuple[np.ndarray, List[str]]:
    """
    Converts a list of raw feature rows into a scaled numpy matrix.
    Returns (X, feature_names).
    """
    engineered = [engineer_features(r) for r in rows]
    df = pd.DataFrame(engineered).fillna(0.0)
    feature_names = list(df.columns)

    imputer = SimpleImputer(strategy="constant", fill_value=0.0)
    X = imputer.fit_transform(df.values)

    if fit_scaler:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)
        os.makedirs(os.path.dirname(scaler_path), exist_ok=True)
        joblib.dump(scaler, scaler_path)
        logger.info(f"Saved scaler to {scaler_path}")
    else:
        if os.path.exists(scaler_path):
            scaler = joblib.load(scaler_path)
            X = scaler.transform(X)

    return X, feature_names


def extract_labels(
    rows: List[Dict],
    label_key: str = "viral_label",
) -> np.ndarray:
    return np.array([
        int(r.get(label_key) or 0) for r in rows
    ])


if __name__ == "__main__":
    import sys
    input_file = sys.argv[1] if len(sys.argv) > 1 else "output/data/features.json"
    with open(input_file) as f:
        rows = json.load(f)

    X, names = build_feature_matrix(rows, fit_scaler=True)
    logger.info(f"Feature matrix: {X.shape}, features: {len(names)}")
    logger.info(f"Sample features: {names[:10]}")
