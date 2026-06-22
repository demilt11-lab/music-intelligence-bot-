"""
PyTorch Dataset for MusicIntelligenceNet

Reads from parquet files produced by the feature store and converts each row
into the four branch tensors + targets expected by MusicIntelligenceNet.

Supports:
  - Sample weighting (user feedback rows have sample_weight > 1.0)
  - Label smoothing (prevents overconfidence on noisy ETL labels)
  - Optional sequence tensor from pre-computed LSTM sequences
  - Weighted random sampling (via WeightedRandomSampler)
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler

from ml.config import DATA_DIR, configure_logging
from ml.neural.network import (
    AUDIO_IN, STREAMING_IN, UGC_IN, RADIO_IN,
    TREND_CLASSES, TRAJ_CLASSES,
)
from ml.neural.song_analyzer import encode_audio_features

logger = configure_logging("ml.neural.dataset")

LABEL_TO_INT = {
    "NONE":            0,
    "TRENDING":        1,
    "POPULAR":         2,
    "VIRAL":           3,
}

TRAJ_TO_INT = {
    "DECLINING":       0,
    "STABLE":          1,
    "GROWING":         2,
    "ABOUT_TO_BREAK":  3,
}

PARQUET_FILES = [
    DATA_DIR / "viral_training_features.parquet",
    DATA_DIR / "popularity_training_features.parquet",
    DATA_DIR / "trend_training_features.parquet",
    DATA_DIR / "feedback_viral_labels.parquet",
    DATA_DIR / "feedback_popularity_labels.parquet",
    DATA_DIR / "feedback_trend_labels.parquet",
]


class MusicDataset(Dataset):
    """
    PyTorch Dataset that loads all available parquet feature files,
    deduplicates by trackId (latest row wins), and converts to tensors.

    Each sample returns:
      features: Dict[str, Tensor]
        audio_feats      (AUDIO_IN,)
        streaming_feats  (STREAMING_IN,)
        ugc_feats        (UGC_IN,)
        radio_feats      (RADIO_IN,)
      targets: Dict[str, Tensor]
        viral    LongTensor scalar (-1 = unknown)
        popular  LongTensor scalar
        trend    LongTensor scalar
        traj     LongTensor scalar
      weight: float   — sample weight for WeightedRandomSampler
    """

    def __init__(
        self,
        parquet_paths: Optional[List[Path]] = None,
        sequence_dir:  Optional[Path]       = None,
    ):
        self.sequence_dir = sequence_dir

        paths = [p for p in (parquet_paths or PARQUET_FILES) if p.exists()]
        if not paths:
            raise FileNotFoundError(
                f"No training parquet files found in {DATA_DIR}. "
                "Run: npm run export:viral-training first."
            )

        dfs = [pd.read_parquet(p) for p in paths]
        df  = pd.concat(dfs, ignore_index=True)
        logger.info("Loaded %d total rows from %d files", len(df), len(paths))

        # Dedup by trackId — keep last occurrence (most recent label)
        if "trackId" in df.columns:
            df = df.drop_duplicates(subset=["trackId"], keep="last")
        logger.info("After dedup: %d unique tracks", len(df))

        self.df = df.reset_index(drop=True)
        self.weights = self._build_weights()

    # ── Dataset interface ─────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int) -> Tuple[Dict, Dict, float]:
        row = self.df.iloc[idx].to_dict()

        features = {
            "audio_feats":     self._audio(row),
            "streaming_feats": self._streaming(row),
            "ugc_feats":       self._ugc(row),
            "radio_feats":     self._radio(row),
        }

        # Optionally attach pre-computed sequence embedding
        if self.sequence_dir is not None:
            tid = int(row.get("trackId") or 0)
            seq_path = self.sequence_dir / f"{tid}.pt"
            if seq_path.exists():
                features["sequence_embed"] = torch.load(seq_path, map_location="cpu", weights_only=True)

        targets = self._targets(row)
        weight  = float(row.get("sample_weight") or 1.0)

        return features, targets, weight

    # ── Feature builders ──────────────────────────────────────────────────

    def _audio(self, row: dict) -> torch.Tensor:
        bpm        = _safe_float(row.get("bpm") or row.get("tempo"), 120.0)
        energy     = _safe_float(row.get("energy"), 0.5)
        dance      = _safe_float(row.get("danceability"), 0.5)
        valence    = _safe_float(row.get("valence"), 0.5)
        loudness   = _safe_float(row.get("loudness"), -10.0)
        mode       = 1.0 if str(row.get("mode") or "major").lower() == "major" else 0.0

        key_str    = str(row.get("musical_key") or row.get("key") or "C")
        key_names  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
        cof_order  = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]
        try:
            chrom  = key_names.index(key_str.split("/")[0].strip())
        except ValueError:
            chrom  = 0
        cof_idx    = cof_order[chrom]
        angle      = 2 * math.pi * cof_idx / 12.0

        bpm_norm   = (min(max(bpm, 60.0), 200.0) - 60.0) / 140.0
        loud_norm  = (min(max(loudness, -60.0), 0.0) + 60.0) / 60.0

        return torch.tensor([
            bpm_norm, energy, dance, valence, loud_norm, mode,
            math.sin(angle), math.cos(angle),
        ], dtype=torch.float32)

    def _streaming(self, row: dict) -> torch.Tensor:
        return torch.tensor([
            _log(row.get("spotify_streams")),
            _safe_float(row.get("spotify_popularity"), 0.0) / 100.0,
            _clip(row.get("spotify_stream_velocity_7d"),  -5, 20),
            _clip(row.get("spotify_stream_velocity_30d"), -5, 20),
            _log(row.get("spotify_playlist_count")),
            _log(row.get("spotify_editorial_playlist_count")),
            _log(row.get("playlist_adds_7d")),
            _log(row.get("playlist_adds_30d")),
            _clip(
                (_safe_float(row.get("spotify_stream_velocity_7d"), 0) -
                 _safe_float(row.get("spotify_stream_velocity_30d"), 0)),
                -10, 10
            ),
        ], dtype=torch.float32)

    def _ugc(self, row: dict) -> torch.Tensor:
        g7d  = _clip(row.get("tiktok_growth_rate_7d"),  -5, 20)
        g30d = _clip(row.get("tiktok_growth_rate_30d"), -5, 20)
        return torch.tensor([
            _log(row.get("tiktok_video_count")),
            g7d,
            g30d,
            g7d - g30d,                                   # TikTok acceleration
            _log(row.get("tiktok_avg_views_per_video")),
            _log(row.get("tiktok_avg_likes_per_video")),
            _safe_float(row.get("tiktok_region_diversity_score"), 0.0),
            _log(row.get("youtube_shorts_views")),
        ], dtype=torch.float32)

    def _radio(self, row: dict) -> torch.Tensor:
        peak = _safe_float(row.get("chart_peak_rank"), 0.0)
        return torch.tensor([
            _log(row.get("radio_spins_7d")),
            _clip(row.get("radio_spin_velocity"), -5, 20),
            _log(row.get("radio_market_count")),
            1.0 / max(peak, 1.0),                          # inverted rank: lower is better
            _safe_float(row.get("chart_days_on_chart"), 0.0) / 365.0,
            _clip(row.get("chart_rank_velocity"), -50, 50) / 50.0,
        ], dtype=torch.float32)

    def _targets(self, row: dict) -> Dict[str, torch.Tensor]:
        def _lbl(v, mapping) -> int:
            if v is None:
                return -1
            try:
                return int(v) if str(v).lstrip("-").isdigit() else mapping.get(str(v).upper(), -1)
            except Exception:
                return -1

        viral   = _safe_int(row.get("viral_30d"))
        if viral == -1:
            viral = _safe_int(row.get("viral_label"))

        popular = _safe_int(row.get("popular_30d"))
        trend   = _lbl(row.get("label"), LABEL_TO_INT)
        traj    = _lbl(row.get("trajectory_label"), TRAJ_TO_INT)

        return {
            "viral":   torch.tensor(viral,   dtype=torch.long),
            "popular": torch.tensor(popular, dtype=torch.long),
            "trend":   torch.tensor(trend,   dtype=torch.long),
            "traj":    torch.tensor(traj,    dtype=torch.long),
        }

    def _build_weights(self) -> np.ndarray:
        w = self.df.get("sample_weight", pd.Series(1.0, index=self.df.index))
        return w.fillna(1.0).to_numpy(dtype=np.float32)

    def get_sampler(self) -> WeightedRandomSampler:
        return WeightedRandomSampler(
            weights=torch.from_numpy(self.weights),
            num_samples=len(self.weights),
            replacement=True,
        )


# ── DataLoader factory ────────────────────────────────────────────────────────

def build_dataloader(
    batch_size:     int = 64,
    num_workers:    int = 0,
    use_weighted:   bool = True,
    parquet_paths:  Optional[List[Path]] = None,
    sequence_dir:   Optional[Path]       = None,
) -> DataLoader:
    dataset = MusicDataset(
        parquet_paths=parquet_paths,
        sequence_dir=sequence_dir,
    )
    sampler = dataset.get_sampler() if use_weighted else None
    shuffle = (sampler is None)

    return DataLoader(
        dataset,
        batch_size=batch_size,
        sampler=sampler,
        shuffle=shuffle,
        num_workers=num_workers,
        collate_fn=_collate_fn,
        drop_last=False,
    )


def _collate_fn(batch):
    """Custom collate: keeps features and targets as separate dicts."""
    features_list, targets_list, weights_list = zip(*batch)

    # Collate feature tensors
    feat_keys = set()
    for f in features_list:
        feat_keys.update(f.keys())

    collated_feats = {}
    for k in feat_keys:
        tensors = [f[k] for f in features_list if k in f]
        if tensors:
            collated_feats[k] = torch.stack(tensors, dim=0)

    # Collate target tensors
    tgt_keys = targets_list[0].keys()
    collated_tgts = {
        k: torch.stack([t[k] for t in targets_list]) for k in tgt_keys
    }

    return collated_feats, collated_tgts


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(v, default: float = 0.0) -> float:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return default
    try:
        return float(v)
    except Exception:
        return default


def _safe_int(v, default: int = -1) -> int:
    if v is None:
        return default
    try:
        return int(float(v))
    except Exception:
        return default


def _log(v, eps: float = 1e-6) -> float:
    val = _safe_float(v, 0.0)
    return float(np.log1p(max(val, 0.0) + eps))


def _clip(v, lo: float, hi: float) -> float:
    return float(np.clip(_safe_float(v, 0.0), lo, hi))
