"""
Multi-modal data loading pipeline for ViralTransformer.

MusicViralDataset loads:
  - Audio features (pre-extracted; stored as .npy or loaded on the fly)
  - Engagement timeseries from the warehouse
  - Text (title + lyrics/captions) as tokenized sequences
  - Structured metadata

Labels:
  - viral: 0/1 — did this entity go viral within horizon days?
  - days_to_viral: float — days from observation_date to viral event
  - peak_score: float in [0, 100]
  - clip_segments: list of int — labeled frame indices for clip recommendation

Data format (expected .jsonl or Parquet rows):
  {
    "entity_id": int,
    "entity_type": "track" | "artist",
    "audio_path": str,          # path to .npy file of shape (T, input_dim)
    "timeseries": [[...], ...], # list of T lists of ts_num_features values
    "title": str,
    "lyrics": str,
    "captions": str,
    "artist_id": int,
    "genre_id": int,
    "release_date": "YYYY-MM-DD",
    "bpm": float,
    "duration_s": float,
    "key": int,
    "mode": int,
    "time_signature": int,
    "energy": float,
    "valence": float,
    "danceability": float,
    "viral": int,               # label
    "days_to_viral": float,
    "peak_score": float,
    "clip_segments": [int, ...]
  }
"""

import json
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset


# ---------------------------------------------------------------------------
# Date feature engineering
# ---------------------------------------------------------------------------

def encode_date_features(date_str: str) -> List[float]:
    """
    Converts a YYYY-MM-DD string into 5 cyclic + normalized features:
      [sin(month), cos(month), sin(day_of_week), cos(day_of_week), year_norm]
    These are continuous representations that avoid artificial discontinuities.
    """
    from datetime import date as dt_cls

    try:
        d = dt_cls.fromisoformat(date_str)
    except (ValueError, TypeError):
        return [0.0, 1.0, 0.0, 1.0, 0.5]

    sin_month = math.sin(2 * math.pi * (d.month - 1) / 12)
    cos_month = math.cos(2 * math.pi * (d.month - 1) / 12)
    dow = d.weekday()  # 0=Monday
    sin_dow = math.sin(2 * math.pi * dow / 7)
    cos_dow = math.cos(2 * math.pi * dow / 7)
    year_norm = (d.year - 2010) / 20.0  # normalize roughly to [-1, 1] for 2010-2030

    return [sin_month, cos_month, sin_dow, cos_dow, year_norm]


# ---------------------------------------------------------------------------
# Simple tokenizer shim (replace with HuggingFace tokenizer for production)
# ---------------------------------------------------------------------------

class SimpleTokenizer:
    """
    Minimal whitespace tokenizer for development/testing.
    In production, swap with bert-base-uncased or a music-domain tokenizer.
    """

    def __init__(
        self,
        vocab_size: int = 30522,
        max_length: int = 512,
        pad_token_id: int = 0,
        cls_token_id: int = 101,
        sep_token_id: int = 102,
        unk_token_id: int = 100,
    ):
        self.vocab_size = vocab_size
        self.max_length = max_length
        self.pad_token_id = pad_token_id
        self.cls_token_id = cls_token_id
        self.sep_token_id = sep_token_id
        self.unk_token_id = unk_token_id

    def encode(self, text: str) -> Dict[str, torch.Tensor]:
        """Returns input_ids and attention_mask tensors of length max_length."""
        tokens = text.lower().split()
        ids = [self.cls_token_id]
        for tok in tokens[: self.max_length - 2]:
            ids.append(hash(tok) % (self.vocab_size - 4) + 4)
        ids.append(self.sep_token_id)

        attention_mask = [1] * len(ids)
        pad_len = self.max_length - len(ids)
        ids += [self.pad_token_id] * pad_len
        attention_mask += [0] * pad_len

        return {
            "input_ids": torch.tensor(ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
        }


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class MusicViralDataset(Dataset):
    """
    Multi-modal dataset for training ViralTransformer.

    Args:
        records:          List of data dicts (see module docstring for schema).
        tokenizer:        Tokenizer instance (default: SimpleTokenizer).
        audio_max_len:    Pad/truncate audio sequences to this length.
        ts_max_len:       Pad/truncate timeseries to this length.
        text_max_len:     Pad/truncate text to this length.
        ts_num_features:  Number of timeseries channels.
        audio_feature_dim: Dimension of audio feature vectors.
        clip_seq_len:     Length used for clip segmentation targets.
        augment:          Whether to apply training augmentations.
    """

    CONTINUOUS_META_KEYS = [
        "bpm", "duration_s", "key", "mode",
        "time_signature", "energy", "valence", "danceability",
    ]

    def __init__(
        self,
        records: List[Dict[str, Any]],
        tokenizer: Optional[Any] = None,
        audio_max_len: int = 512,
        ts_max_len: int = 365,
        text_max_len: int = 512,
        ts_num_features: int = 8,
        audio_feature_dim: int = 128,
        clip_seq_len: int = 512,
        augment: bool = False,
    ):
        self.records = records
        self.tokenizer = tokenizer or SimpleTokenizer(max_length=text_max_len)
        self.audio_max_len = audio_max_len
        self.ts_max_len = ts_max_len
        self.ts_num_features = ts_num_features
        self.audio_feature_dim = audio_feature_dim
        self.clip_seq_len = clip_seq_len
        self.augment = augment

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        rec = self.records[idx]

        # ── Audio ─────────────────────────────────────────────────────────────
        audio_features, audio_mask = self._load_audio(rec)

        # ── Timeseries ────────────────────────────────────────────────────────
        ts_features, ts_mask = self._load_timeseries(rec)

        # ── Text ──────────────────────────────────────────────────────────────
        text = " ".join(filter(None, [
            rec.get("title", ""),
            rec.get("lyrics", ""),
            rec.get("captions", ""),
        ]))
        encoded = self.tokenizer.encode(text)

        # ── Metadata ──────────────────────────────────────────────────────────
        artist_id = int(rec.get("artist_id", 0))
        genre_id = int(rec.get("genre_id", 0))
        date_features = torch.tensor(
            encode_date_features(rec.get("release_date", "2020-01-01")),
            dtype=torch.float32,
        )
        continuous_meta = torch.tensor(
            [float(rec.get(k, 0.0)) for k in self.CONTINUOUS_META_KEYS],
            dtype=torch.float32,
        )

        # ── Labels ────────────────────────────────────────────────────────────
        viral = torch.tensor([float(rec.get("viral", 0))], dtype=torch.float32)
        days_to_viral = torch.tensor(
            [float(rec.get("days_to_viral", 365.0))], dtype=torch.float32
        )
        peak_score = torch.tensor(
            [float(rec.get("peak_score", 0.0))], dtype=torch.float32
        )
        clip_target = self._encode_clip_target(rec.get("clip_segments", []))

        return {
            # Audio
            "audio_features": audio_features,
            "audio_mask": audio_mask,
            # Time-series
            "timeseries": ts_features,
            "ts_mask": ts_mask,
            # Text
            "input_ids": encoded["input_ids"],
            "text_attention_mask": encoded["attention_mask"],
            # Metadata
            "artist_ids": torch.tensor(artist_id, dtype=torch.long),
            "genre_ids": torch.tensor(genre_id, dtype=torch.long),
            "date_features": date_features,
            "continuous_meta": continuous_meta,
            # Labels
            "viral": viral,
            "days_to_viral": days_to_viral,
            "peak_score": peak_score,
            "clip_target": clip_target,
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    def _load_audio(
        self, rec: Dict[str, Any]
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Load audio features from .npy file or inline array, pad/truncate."""
        audio_path = rec.get("audio_path")
        if audio_path and os.path.exists(audio_path):
            raw = np.load(audio_path).astype(np.float32)
        elif "audio_features" in rec:
            raw = np.array(rec["audio_features"], dtype=np.float32)
        else:
            raw = np.zeros((1, self.audio_feature_dim), dtype=np.float32)

        T = raw.shape[0]
        if T > self.audio_max_len:
            raw = raw[: self.audio_max_len]
            T = self.audio_max_len

        features = torch.zeros(self.audio_max_len, self.audio_feature_dim)
        features[:T] = torch.from_numpy(raw[:, : self.audio_feature_dim])

        mask = torch.ones(self.audio_max_len, dtype=torch.bool)
        mask[:T] = False  # False = attend

        if self.augment and T > 0:
            features[:T] += torch.randn_like(features[:T]) * 0.01

        return features, mask

    def _load_timeseries(
        self, rec: Dict[str, Any]
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Load engagement timeseries, normalize, pad/truncate."""
        raw = rec.get("timeseries", [])
        if not raw:
            raw = [[0.0] * self.ts_num_features]

        arr = np.array(raw, dtype=np.float32)
        T, F = arr.shape
        # Pad feature dimension if needed
        if F < self.ts_num_features:
            arr = np.pad(arr, ((0, 0), (0, self.ts_num_features - F)))
        else:
            arr = arr[:, : self.ts_num_features]

        if T > self.ts_max_len:
            arr = arr[-self.ts_max_len :]  # Keep most recent
            T = self.ts_max_len

        # Log-scale normalization for count-like features
        arr = np.sign(arr) * np.log1p(np.abs(arr))

        features = torch.zeros(self.ts_max_len, self.ts_num_features)
        features[:T] = torch.from_numpy(arr)

        mask = torch.ones(self.ts_max_len, dtype=torch.bool)
        mask[:T] = False

        return features, mask

    def _encode_clip_target(self, segments: List[int]) -> torch.Tensor:
        """
        Encodes clip segment labels as a multi-hot vector over audio frame positions.
        For multiclass: target = index of single best segment.
        For multilabel: target = binary vector.
        """
        target = torch.zeros(self.clip_seq_len, dtype=torch.float32)
        for seg in segments:
            if 0 <= seg < self.clip_seq_len:
                target[seg] = 1.0
        return target


# ---------------------------------------------------------------------------
# DataLoader factory
# ---------------------------------------------------------------------------

def build_dataloaders(
    train_records: List[Dict[str, Any]],
    val_records: List[Dict[str, Any]],
    test_records: Optional[List[Dict[str, Any]]] = None,
    batch_size: int = 256,
    num_workers: int = 4,
    pin_memory: bool = True,
    **dataset_kwargs: Any,
) -> Tuple[DataLoader, DataLoader, Optional[DataLoader]]:
    """
    Builds train / val / (optional) test DataLoaders.

    Args:
        train_records: training sample dicts
        val_records:   validation sample dicts
        test_records:  optional test sample dicts
        batch_size:    mini-batch size (paper uses 256)
        num_workers:   dataloader workers
        pin_memory:    pin to GPU memory for faster transfer
        **dataset_kwargs: forwarded to MusicViralDataset

    Returns:
        (train_loader, val_loader, test_loader or None)
    """
    train_ds = MusicViralDataset(train_records, augment=True, **dataset_kwargs)
    val_ds = MusicViralDataset(val_records, augment=False, **dataset_kwargs)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=pin_memory,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )

    test_loader: Optional[DataLoader] = None
    if test_records:
        test_ds = MusicViralDataset(test_records, augment=False, **dataset_kwargs)
        test_loader = DataLoader(
            test_ds,
            batch_size=batch_size,
            shuffle=False,
            num_workers=num_workers,
            pin_memory=pin_memory,
        )

    return train_loader, val_loader, test_loader
