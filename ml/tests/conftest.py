"""
Shared fixtures for ViralTransformer test suite.
"""

import math
import random
from typing import Any, Dict, List

import numpy as np
import pytest
import torch

from ml.models.viral_transformer import ViralTransformer


# ---------------------------------------------------------------------------
# Tiny model config (fast, fits on CPU)
# ---------------------------------------------------------------------------

TINY_D = 32   # d_model
TINY_HEADS = 4
TINY_AUDIO_LAYERS = 1
TINY_TS_LAYERS = 1
TINY_TEXT_LAYERS = 1
BATCH = 4
AUDIO_SEQ = 16
TS_STEPS = 30
TEXT_LEN = 32
TS_FEATURES = 8
AUDIO_DIM = 32
DATE_FEATURES = 5
CONT_META = 8
CLIP_SEQ = 16


@pytest.fixture(scope="session")
def tiny_model() -> ViralTransformer:
    """A tiny ViralTransformer that runs on CPU in milliseconds."""
    model = ViralTransformer(
        d_model=TINY_D,
        audio_input_dim=AUDIO_DIM,
        audio_seq_len=AUDIO_SEQ,
        ts_num_features=TS_FEATURES,
        ts_max_steps=TS_STEPS,
        text_vocab_size=512,
        text_max_seq_len=TEXT_LEN,
        num_artists=100,
        num_genres=20,
        num_date_features=DATE_FEATURES,
        num_continuous_meta=CONT_META,
        num_heads=TINY_HEADS,
        audio_enc_layers=TINY_AUDIO_LAYERS,
        ts_enc_layers=TINY_TS_LAYERS,
        text_enc_layers=TINY_TEXT_LAYERS,
        dropout=0.0,
        clip_mode="multiclass",
    )
    model.eval()
    return model


def make_batch(
    batch_size: int = BATCH,
    viral_rate: float = 0.25,
    seed: int = 42,
) -> Dict[str, torch.Tensor]:
    """Build a synthetic batch matching the model's expected input spec."""
    rng = torch.manual_seed(seed)

    audio_features = torch.randn(batch_size, AUDIO_SEQ, AUDIO_DIM)
    audio_mask = torch.zeros(batch_size, AUDIO_SEQ, dtype=torch.bool)

    timeseries = torch.randn(batch_size, TS_STEPS, TS_FEATURES)
    ts_mask = torch.zeros(batch_size, TS_STEPS, dtype=torch.bool)

    input_ids = torch.randint(4, 512, (batch_size, TEXT_LEN))
    input_ids[:, 0] = 101   # CLS
    text_attention_mask = torch.ones(batch_size, TEXT_LEN, dtype=torch.long)

    artist_ids = torch.randint(1, 100, (batch_size,))
    genre_ids = torch.randint(1, 20, (batch_size,))
    date_features = torch.randn(batch_size, DATE_FEATURES)
    continuous_meta = torch.randn(batch_size, CONT_META)

    viral = torch.zeros(batch_size, 1)
    n_viral = max(1, int(batch_size * viral_rate))
    viral[:n_viral] = 1.0
    days_to_viral = torch.rand(batch_size, 1) * 365
    peak_score = torch.rand(batch_size, 1) * 100

    clip_target = torch.zeros(batch_size, CLIP_SEQ)
    for i in range(batch_size):
        idx = torch.randint(0, CLIP_SEQ, (1,)).item()
        clip_target[i, idx] = 1.0

    return {
        "audio_features": audio_features,
        "audio_mask": audio_mask,
        "timeseries": timeseries,
        "ts_mask": ts_mask,
        "input_ids": input_ids,
        "text_attention_mask": text_attention_mask,
        "artist_ids": artist_ids,
        "genre_ids": genre_ids,
        "date_features": date_features,
        "continuous_meta": continuous_meta,
        "viral": viral,
        "days_to_viral": days_to_viral,
        "peak_score": peak_score,
        "clip_target": clip_target,
    }


@pytest.fixture
def batch() -> Dict[str, torch.Tensor]:
    return make_batch()


def make_records(n: int = 20, viral_rate: float = 0.3, seed: int = 0) -> List[Dict[str, Any]]:
    """Synthetic dataset records for dataset/dataloader tests."""
    random.seed(seed)
    np.random.seed(seed)
    records = []
    for i in range(n):
        is_viral = random.random() < viral_rate
        records.append({
            "entity_id": i,
            "entity_type": "track",
            "audio_features": np.random.randn(AUDIO_SEQ, AUDIO_DIM).tolist(),
            "timeseries": np.random.randn(TS_STEPS, TS_FEATURES).tolist(),
            "title": f"Track {i}",
            "lyrics": "la la la " * random.randint(1, 10),
            "captions": "#viral #music",
            "artist_id": random.randint(1, 99),
            "genre_id": random.randint(1, 19),
            "release_date": f"202{random.randint(0,4)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "bpm": random.uniform(60, 180),
            "duration_s": random.uniform(90, 300),
            "key": random.randint(0, 11),
            "mode": random.randint(0, 1),
            "time_signature": random.choice([3, 4]),
            "energy": random.random(),
            "valence": random.random(),
            "danceability": random.random(),
            "viral": int(is_viral),
            "days_to_viral": random.uniform(1, 90) if is_viral else 365.0,
            "peak_score": random.uniform(60, 100) if is_viral else random.uniform(0, 40),
            "clip_segments": [random.randint(0, CLIP_SEQ - 1)],
        })
    return records
