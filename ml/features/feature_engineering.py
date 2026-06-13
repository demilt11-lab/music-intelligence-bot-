"""
Feature engineering for Music Intelligence ML models.

Three feature sets are exported:
  build_viral_features()      — UGC-heavy, predicts tracks that will go viral
  build_popularity_features() — Streaming-heavy, predicts tracks that will sustain streams
  build_combined_features()   — Full feature matrix used for multi-class trend classification

All functions accept a list of dicts matching the TrackFeatureRow schema from
ml/training/collect_features.py, and return a (X: ndarray, feature_names: list) tuple.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from ml.config import configure_logging
from ml.models.scalers import transform_with_scaler

logger = configure_logging(__name__)


# ── helpers ──────────────────────────────────────────────────────────────────

def _safe_log1p(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    return np.log1p(np.clip(x, a_min=eps, a_max=None))


def _fill(df: pd.DataFrame, cols: List[str], value: float = 0.0) -> pd.DataFrame:
    for c in cols:
        if c not in df.columns:
            df[c] = value
        else:
            df[c] = df[c].fillna(value)
    return df


def _velocity(curr: pd.Series, prev: pd.Series, eps: float = 1.0) -> pd.Series:
    """Percentage change with a floor to avoid division-by-zero."""
    return (curr - prev) / (prev.clip(lower=eps))


def _geo_entropy(df: pd.DataFrame) -> pd.Series:
    """
    Region diversity as normalised Shannon entropy.
    Proxy: tiktok_region_diversity_score if present, else zero.
    """
    if "tiktok_region_diversity_score" in df.columns:
        return df["tiktok_region_diversity_score"].fillna(0.0)
    return pd.Series(0.0, index=df.index)


def _fill_with_indicator(df: pd.DataFrame, cols: List[str]) -> pd.DataFrame:
    """
    For each column in cols, add a binary `{col}_observed` indicator (1 if not null, 0 if null)
    then fill the column itself with 0. This lets the model distinguish
    "zero activity" from "data not yet collected."
    """
    for c in cols:
        observed_col = f"{c}_observed"
        if c in df.columns:
            df[observed_col] = df[c].notna().astype(float)
            df[c] = df[c].fillna(0.0)
        else:
            df[c] = 0.0
            df[observed_col] = 0.0
    return df


# ── UGC / viral feature set ───────────────────────────────────────────────────

_VIRAL_COLS = [
    # Raw UGC volume
    "tiktok_video_count",
    "tiktok_avg_views_per_video",
    "tiktok_avg_likes_per_video",
    # UGC velocity
    "tiktok_growth_rate_7d",
    "tiktok_growth_rate_30d",
    # Streaming velocity (early acceleration matters for viral)
    "spotify_stream_velocity_7d",
    "spotify_stream_velocity_30d",
    # Playlist momentum (editorial adds signal label-push)
    "spotify_playlist_count",
    "playlist_adds_7d",
    "playlist_editorial_adds_7d",
    # Geo spread
    "tiktok_region_diversity_score",
    # YouTube shorts (often mirrors TikTok virality)
    "youtube_shorts_views",
    "youtube_view_velocity_7d",
    # Audio DNA (genre-specific virality patterns)
    "energy",
    "danceability",
    "valence",
    "tempo",
]

def build_viral_features(
    records: List[Dict[str, Any]],
) -> Tuple[np.ndarray, List[str]]:
    df = pd.DataFrame.from_records(records)
    df = _fill(df, _VIRAL_COLS)

    out = pd.DataFrame(index=df.index)

    # Log-transformed volume
    for col in [
        "tiktok_video_count",
        "tiktok_avg_views_per_video",
        "tiktok_avg_likes_per_video",
        "youtube_shorts_views",
        "playlist_adds_7d",
        "playlist_editorial_adds_7d",
    ]:
        out[f"log_{col}"] = _safe_log1p(df[col].to_numpy())

    # Velocity — keep raw (already a rate)
    for col in [
        "tiktok_growth_rate_7d",
        "tiktok_growth_rate_30d",
        "spotify_stream_velocity_7d",
        "spotify_stream_velocity_30d",
        "youtube_view_velocity_7d",
    ]:
        out[col] = df[col].clip(-5.0, 20.0)

    # Interaction: TikTok video growth × geo spread (viral spread signal)
    out["tiktok_geo_spread"] = (
        df["tiktok_growth_rate_7d"].clip(0) * _geo_entropy(df)
    )

    # Interaction: early editorial adds × stream velocity (label-driven breakout)
    out["editorial_velocity"] = (
        _safe_log1p(df["playlist_editorial_adds_7d"].to_numpy()) *
        df["spotify_stream_velocity_7d"].clip(0)
    )

    # Acceleration: 7d growth rate vs 30d (is momentum increasing?)
    out["tiktok_acceleration"] = (
        df["tiktok_growth_rate_7d"] - df["tiktok_growth_rate_30d"]
    ).clip(-10.0, 10.0)

    # Playlist count (log)
    out["log_spotify_playlist_count"] = _safe_log1p(df["spotify_playlist_count"].to_numpy())

    # Audio features (pass through; scaled below)
    for col in ["energy", "danceability", "valence", "tempo"]:
        out[col] = df[col]

    feature_names = list(out.columns)
    X = out.to_numpy(dtype=float)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    X_scaled, _ = transform_with_scaler(X, name="viral_features", fit_if_missing=True)
    return X_scaled, feature_names


# ── Streaming / popularity feature set ───────────────────────────────────────

_POPULAR_COLS = [
    # Base streaming volume
    "spotify_streams",
    "spotify_popularity",
    # Stream momentum
    "spotify_stream_velocity_7d",
    "spotify_stream_velocity_30d",
    # Playlist signals
    "spotify_playlist_count",
    "spotify_editorial_playlist_count",
    "playlist_adds_7d",
    "playlist_adds_30d",
    "playlist_avg_position",
    # Radio airplay (indicates mainstream momentum)
    "radio_spins_7d",
    "radio_spins_30d",
    "radio_spin_velocity",
    "radio_market_count",
    # Chart presence
    "chart_count",
    "chart_peak_rank",
    "chart_days_on_chart",
    "chart_rank_velocity",
    # Geo breadth
    "trigger_city_count",
    # Audio DNA
    "energy",
    "danceability",
    "valence",
    "loudness",
    "tempo",
]

def build_popularity_features(
    records: List[Dict[str, Any]],
) -> Tuple[np.ndarray, List[str]]:
    df = pd.DataFrame.from_records(records)
    df = _fill(df, _POPULAR_COLS)

    # Mark radio and chart features with missingness indicators — these are
    # "unobserved" (no data) for new tracks, not "zero activity."
    _SPARSE_COLS = [
        "radio_spins_7d", "radio_spins_30d", "radio_spin_velocity", "radio_market_count",
        "chart_count", "chart_peak_rank", "chart_days_on_chart", "chart_rank_velocity",
        "trigger_city_count",
    ]
    df = _fill_with_indicator(df, _SPARSE_COLS)

    out = pd.DataFrame(index=df.index)

    # Log-transform all volume/count columns
    for col in [
        "spotify_streams",
        "spotify_playlist_count",
        "spotify_editorial_playlist_count",
        "playlist_adds_7d",
        "playlist_adds_30d",
        "radio_spins_7d",
        "radio_spins_30d",
        "chart_count",
        "trigger_city_count",
    ]:
        out[f"log_{col}"] = _safe_log1p(df[col].to_numpy())

    # Direct metrics (bounded)
    out["spotify_popularity"] = df["spotify_popularity"].clip(0, 100) / 100.0
    out["playlist_avg_position"] = df["playlist_avg_position"].clip(0, 100) / 100.0

    # Chart peak rank: invert so lower=better (rank 1 → 100, rank 100 → 1)
    out["chart_peak_rank_inv"] = 1.0 / (df["chart_peak_rank"].clip(lower=1))
    out["chart_days_on_chart"] = df["chart_days_on_chart"].clip(0, 365)
    out["chart_rank_velocity"] = df["chart_rank_velocity"].clip(-50, 50)

    # Velocity features
    for col in [
        "spotify_stream_velocity_7d",
        "spotify_stream_velocity_30d",
        "radio_spin_velocity",
    ]:
        out[col] = df[col].clip(-5.0, 20.0)

    # Radio market penetration
    out["log_radio_market_count"] = _safe_log1p(df["radio_market_count"].to_numpy())

    # Interaction: editorial playlist adds × stream velocity (major-label push)
    out["editorial_stream_push"] = (
        _safe_log1p(df["spotify_editorial_playlist_count"].to_numpy()) *
        df["spotify_stream_velocity_30d"].clip(0)
    )

    # Interaction: stream volume × playlist count (organic vs curated volume)
    out["stream_playlist_density"] = (
        _safe_log1p(df["spotify_streams"].to_numpy()) *
        _safe_log1p(df["spotify_playlist_count"].to_numpy())
    )

    # Stream acceleration (7d vs 30d velocity)
    out["stream_acceleration"] = (
        df["spotify_stream_velocity_7d"] - df["spotify_stream_velocity_30d"]
    ).clip(-10.0, 10.0)

    # Audio features
    for col in ["energy", "danceability", "valence", "loudness", "tempo"]:
        out[col] = df[col]

    # Missingness indicators (from _fill_with_indicator)
    for c in _SPARSE_COLS:
        obs_col = f"{c}_observed"
        if obs_col in df.columns:
            out[obs_col] = df[obs_col]

    feature_names = list(out.columns)
    X = out.to_numpy(dtype=float)
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    X_scaled, _ = transform_with_scaler(X, name="popularity_features", fit_if_missing=True)
    return X_scaled, feature_names


# ── Combined feature set (viral + popular + cross-platform) ──────────────────

def build_combined_features(
    records: List[Dict[str, Any]],
) -> Tuple[np.ndarray, List[str]]:
    """
    Full feature matrix for multi-class trend classification.
    Concatenates viral features + popularity features + cross-platform interactions.
    """
    df = pd.DataFrame.from_records(records)
    all_cols = list(set(_VIRAL_COLS + _POPULAR_COLS))
    df = _fill(df, all_cols)

    _SPARSE_COLS = [
        "radio_spins_7d", "radio_spins_30d", "radio_spin_velocity", "radio_market_count",
        "chart_count", "chart_peak_rank", "chart_days_on_chart", "chart_rank_velocity",
        "trigger_city_count",
    ]
    df = _fill_with_indicator(df, _SPARSE_COLS)

    X_viral, viral_names = build_viral_features(records)
    X_pop, pop_names = build_popularity_features(records)

    # Cross-platform interaction features
    cross = pd.DataFrame(index=df.index)

    # TikTok UGC driving Spotify streams (virality converting to streams)
    cross["ugc_to_stream_ratio"] = (
        df["tiktok_growth_rate_7d"].clip(0) /
        (df["spotify_stream_velocity_7d"].abs().clip(lower=0.01))
    ).clip(0, 100)

    # Radio + playlist convergence (mainstream push from both sides)
    cross["radio_playlist_convergence"] = (
        _safe_log1p(df["radio_spins_7d"].to_numpy()) *
        _safe_log1p(df["spotify_playlist_count"].to_numpy())
    )

    # UGC to YouTube shorts crossover
    cross["tiktok_youtube_crossover"] = (
        df["tiktok_growth_rate_7d"].clip(0) *
        df["youtube_view_velocity_7d"].clip(0)
    ).clip(0, 50)

    X_cross = cross.to_numpy(dtype=float)
    X_cross = np.nan_to_num(X_cross, nan=0.0, posinf=0.0, neginf=0.0)
    X_cross_scaled, _ = transform_with_scaler(
        X_cross, name="cross_features", fit_if_missing=True
    )
    cross_names = list(cross.columns)

    X_combined = np.concatenate([X_viral, X_pop, X_cross_scaled], axis=1)
    combined_names = (
        [f"viral__{n}" for n in viral_names] +
        [f"pop__{n}" for n in pop_names] +
        [f"cross__{n}" for n in cross_names]
    )
    return X_combined, combined_names


# ── Legacy shim (keeps old callers working) ──────────────────────────────────

def build_feature_matrix(records: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Backwards-compatible shim.  Calls build_combined_features and returns a DataFrame.
    """
    X, names = build_combined_features(records)
    return pd.DataFrame(X, columns=names)
