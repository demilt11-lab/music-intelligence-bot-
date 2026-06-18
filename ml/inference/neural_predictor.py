"""
Neural Predictor

The live inference engine. Wraps the ContinualLearner + SongEncoder + TemporalEncoder
+ ViralSoundIndex into a single callable interface.

Every scored track:
  1. Produces viral/popularity/trend/trajectory predictions
  2. If any label is known (from feedback or ETL), triggers an online gradient step
  3. Audio embedding is compared to the ViralSoundIndex for "sounds like a hit" signal
  4. Trend signals are generated (pre-viral alerts, regional breakouts)

Thread-safe: multiple API workers can call predict() concurrently.
Online updates are serialised internally by ContinualLearner._lock.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn.functional as F

from ml.config import MODEL_DIR, configure_logging
from ml.neural.continual_learner import ContinualLearner
from ml.neural.song_analyzer import (
    SongEncoder,
    ViralSoundIndex,
    encode_audio_features,
    EMBED_DIM,
)
from ml.neural.temporal_encoder import TemporalEncoder, build_sequence_tensor
from ml.neural.network import AUDIO_IN, STREAMING_IN, UGC_IN, RADIO_IN
from ml.neural.dataset import _safe_float, _log, _clip
from ml.inference.trend_signal import generate_alerts, alerts_to_dict
from ml.inference.metrics_writer import update_from_batch_result

logger = configure_logging("ml.inference.neural_predictor")

SONG_ENC_PATH    = MODEL_DIR / "song_encoder.pt"
TEMPORAL_ENC_PATH= MODEL_DIR / "temporal_encoder.pt"
VIRAL_INDEX_PATH = str(MODEL_DIR / "viral_sound_index")

TREND_LABELS = ["NONE", "TRENDING", "POPULAR", "VIRAL"]
TRAJ_LABELS  = ["DECLINING", "STABLE", "GROWING", "ABOUT_TO_BREAK"]

# Minimum viral probability above which we trigger an online update
# (avoids polluting the buffer with clearly non-viral low-confidence samples)
ONLINE_UPDATE_THRESHOLD = 0.15


@lru_cache(maxsize=1)
def _get_learner() -> ContinualLearner:
    learner = ContinualLearner()
    learner.load()
    return learner


@lru_cache(maxsize=1)
def _get_song_encoder() -> Optional[SongEncoder]:
    if not SONG_ENC_PATH.exists():
        logger.warning("SongEncoder not found at %s", SONG_ENC_PATH)
        return None
    enc = SongEncoder()
    enc.load_state_dict(torch.load(SONG_ENC_PATH, map_location="cpu", weights_only=True))
    enc.eval()
    return enc


@lru_cache(maxsize=1)
def _get_temporal_encoder() -> Optional[TemporalEncoder]:
    if not TEMPORAL_ENC_PATH.exists():
        return None
    enc = TemporalEncoder()
    enc.load_state_dict(torch.load(TEMPORAL_ENC_PATH, map_location="cpu", weights_only=True))
    enc.eval()
    return enc


@lru_cache(maxsize=1)
def _get_viral_index() -> ViralSoundIndex:
    index = ViralSoundIndex(dim=EMBED_DIM)
    index.load(VIRAL_INDEX_PATH)
    return index


def _build_feature_tensors(record: Dict[str, Any]) -> Dict[str, torch.Tensor]:
    """Converts a flat TrackFeatureRow dict → branch tensors."""
    import math

    def audio(row):
        bpm    = _safe_float(row.get("bpm") or row.get("tempo"), 120.0)
        energy = _safe_float(row.get("energy"), 0.5)
        dance  = _safe_float(row.get("danceability"), 0.5)
        val    = _safe_float(row.get("valence"), 0.5)
        loud   = _safe_float(row.get("loudness"), -10.0)
        mode   = 1.0 if str(row.get("mode") or "major").lower() == "major" else 0.0
        ks = str(row.get("musical_key") or "C")
        key_names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
        cof_order = [0,7,2,9,4,11,6,1,8,3,10,5]
        try:
            chrom = key_names.index(ks.split("/")[0].strip())
        except ValueError:
            chrom = 0
        cof = cof_order[chrom]
        ang = 2 * math.pi * cof / 12.0
        return torch.tensor([
            (min(max(bpm, 60), 200) - 60) / 140,
            energy, dance, val,
            (min(max(loud, -60), 0) + 60) / 60,
            mode, math.sin(ang), math.cos(ang),
        ], dtype=torch.float32).unsqueeze(0)

    def streaming(row):
        return torch.tensor([
            _log(row.get("spotify_streams")),
            _safe_float(row.get("spotify_popularity"), 0) / 100,
            _clip(row.get("spotify_stream_velocity_7d"), -5, 20),
            _clip(row.get("spotify_stream_velocity_30d"), -5, 20),
            _log(row.get("spotify_playlist_count")),
            _log(row.get("spotify_editorial_playlist_count")),
            _log(row.get("playlist_adds_7d")),
            _log(row.get("playlist_adds_30d")),
            _clip(
                _safe_float(row.get("spotify_stream_velocity_7d"), 0) -
                _safe_float(row.get("spotify_stream_velocity_30d"), 0), -10, 10),
        ], dtype=torch.float32).unsqueeze(0)

    def ugc(row):
        g7  = _clip(row.get("tiktok_growth_rate_7d"), -5, 20)
        g30 = _clip(row.get("tiktok_growth_rate_30d"), -5, 20)
        return torch.tensor([
            _log(row.get("tiktok_video_count")),
            g7, g30, g7 - g30,
            _log(row.get("tiktok_avg_views_per_video")),
            _log(row.get("tiktok_avg_likes_per_video")),
            _safe_float(row.get("tiktok_region_diversity_score"), 0),
            _log(row.get("youtube_shorts_views")),
        ], dtype=torch.float32).unsqueeze(0)

    def radio(row):
        peak = _safe_float(row.get("chart_peak_rank"), 0)
        return torch.tensor([
            _log(row.get("radio_spins_7d")),
            _clip(row.get("radio_spin_velocity"), -5, 20),
            _log(row.get("radio_market_count")),
            1.0 / max(peak, 1),
            _safe_float(row.get("chart_days_on_chart"), 0) / 365,
            _clip(row.get("chart_rank_velocity"), -50, 50) / 50,
        ], dtype=torch.float32).unsqueeze(0)

    return {
        "audio_feats":     audio(record),
        "streaming_feats": streaming(record),
        "ugc_feats":       ugc(record),
        "radio_feats":     radio(record),
    }


def predict(
    record: Dict[str, Any],
    daily_history: Optional[List[Dict]] = None,
    known_targets: Optional[Dict[str, int]] = None,
    explain: bool = False,
) -> Dict[str, Any]:
    """
    Full neural prediction for a single track.

    record:         TrackFeatureRow dict
    daily_history:  list of dicts [{streams, tiktok_growth, playlist_adds, radio_spins, viral_score}]
                    for the temporal encoder (up to 90 days)
    known_targets:  if any ground truth is known (from ETL or feedback),
                    triggers an online gradient update
                    e.g. {"viral": 1, "trend": 3}  (int labels)
    explain:        include trend alerts in output

    Returns rich prediction dict.
    """
    learner       = _get_learner()
    song_encoder  = _get_song_encoder()
    temp_encoder  = _get_temporal_encoder()
    viral_index   = _get_viral_index()

    features = _build_feature_tensors(record)
    device   = learner.device

    # Temporal sequence encoding
    if daily_history and temp_encoder is not None:
        seq_tensor, lengths = build_sequence_tensor([daily_history])
        with torch.no_grad():
            seq_embed = temp_encoder(seq_tensor.to(device), lengths.to(device))
        features["sequence_embed"] = seq_embed

    # Audio similarity to known viral tracks
    audio_similarity: Optional[Dict] = None
    if song_encoder is not None:
        audio_t = features["audio_feats"].to(device)
        with torch.no_grad():
            audio_emb = song_encoder(audio_t).cpu().numpy()[0]
        audio_similarity = viral_index.query(audio_emb, k=5)

    # Neural network prediction
    prediction = learner.predict(features)

    # Boost viral probability by audio similarity to known hits
    if audio_similarity and audio_similarity["similarity_score"] > 0:
        boost = audio_similarity["similarity_score"] * 0.15   # max 15% boost
        prediction["viral_probability"] = min(
            prediction["viral_probability"] + boost, 1.0
        )

    # Trend signal alerts
    alerts: List[Dict] = []
    if explain:
        feat_for_alerts = {**record}
        feat_for_alerts["viral_probability"] = prediction["viral_probability"]
        raw_alerts = generate_alerts(
            feat_for_alerts,
            viral_probability=prediction["viral_probability"],
            trajectory_state=prediction.get("trajectory_label", "").lower(),
        )
        alerts = alerts_to_dict(raw_alerts)

    result = {
        "trackId":              record.get("trackId"),
        "viral_probability":    round(prediction["viral_probability"], 4),
        "popular_probability":  round(prediction["popular_probability"], 4),
        "trend_prediction": {
            "label":         prediction["trend_label"],
            "probabilities": prediction["trend_probs"],
        },
        "trajectory_prediction": {
            "label":         prediction["trajectory_label"],
            "probabilities": prediction["trajectory_probs"],
        },
        "audio_similarity":  audio_similarity,
        "alerts":            alerts,
    }

    # Online gradient update if any target is known
    if known_targets:
        targets_t = {
            k: torch.tensor([v], dtype=torch.long)
            for k, v in known_targets.items()
            if v is not None
        }
        # Only update when there's something meaningful to learn from
        has_signal = any(
            v != -1 for v in known_targets.values() if v is not None
        )
        if has_signal:
            update_info = learner.online_update(features, targets_t)
            result["online_update"] = update_info

    # Write to metrics tracker for drift detection
    update_from_batch_result([result])

    return result


def predict_batch(
    records: List[Dict[str, Any]],
    daily_histories: Optional[List[Optional[List[Dict]]]] = None,
    known_targets_batch: Optional[List[Optional[Dict[str, int]]]] = None,
) -> List[Dict[str, Any]]:
    results = []
    for i, rec in enumerate(records):
        hist    = daily_histories[i]    if daily_histories    else None
        targets = known_targets_batch[i] if known_targets_batch else None
        results.append(predict(rec, daily_history=hist, known_targets=targets))
    update_from_batch_result(results)
    return results
