"""
TikTok viral song dataset.

Label definition: viral = 1 if TikTok uses reached 10K+ within 30 days of release.
Features: 90-day engagement time-series + 64-dim audio features + metadata.
"""

import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
from pydantic import BaseModel, model_validator
from torch import Tensor
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

# ---------------------------------------------------------------------------
# Label constants
# ---------------------------------------------------------------------------

VIRAL_TIKTOK_THRESHOLD = 10_000   # uses in 30 days = confirmed viral
VIRAL_WINDOW_DAYS = 30

# Early breakout tier: consistent growth signal (industry A&R emerging threshold)
EMERGING_TIKTOK_THRESHOLD = 1_000  # uses/week showing consistent growth = "watch list"
EMERGING_WINDOW_DAYS = 7


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

class SongRecord(BaseModel):
    song_id: int
    title: str
    artist: str
    release_date: str
    genre: Optional[str] = None
    tiktok_uses_30d: int
    is_viral: bool = False           # derived below
    days_to_viral: Optional[float] = None
    peak_viral_score: float = 0.0
    engagement_series: List[float]   # 90-day daily engagement
    audio_features: List[float]      # 64-dim
    metadata_features: List[float]   # 32-dim
    is_emerging: bool = False        # tiktok_uses_7d >= 1_000 (early A&R watch signal)
    tiktok_uses_7d: int = 0          # 7-day TikTok uses for emerging detection
    save_rate: float = 0.0           # saves/streams ratio
    follower_velocity: float = 0.0   # monthly follower growth rate
    skip_rate: float = 0.5           # stream skip rate (lower is better)
    pre_save_count: int = 0          # pre-release pre-saves

    @model_validator(mode="after")
    def derive_is_viral(self) -> "SongRecord":
        self.is_viral = self.tiktok_uses_30d >= VIRAL_TIKTOK_THRESHOLD
        self.is_emerging = self.tiktok_uses_7d >= EMERGING_TIKTOK_THRESHOLD
        return self


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class TikTokViralDataset(Dataset):
    """PyTorch Dataset wrapping SongRecord objects."""

    def __init__(
        self,
        records: List[SongRecord],
        seq_len: int = 90,
        augment: bool = False,
    ) -> None:
        self.records = records
        self.seq_len = seq_len
        self.augment = augment

        # simple vocab for char-level text tokens
        self._build_vocab()

    def _build_vocab(self) -> None:
        """Build a small word-index vocabulary from titles + genres."""
        vocab: Dict[str, int] = {"<pad>": 0, "<unk>": 1}
        for rec in self.records:
            for word in (rec.title + " " + (rec.genre or "")).lower().split():
                if word not in vocab:
                    vocab[word] = len(vocab)
        self.vocab = vocab

    def _tokenize(self, text: str, max_len: int = 32) -> Tensor:
        words = text.lower().split()[:max_len]
        ids = [self.vocab.get(w, 1) for w in words]
        ids = ids[:max_len] + [0] * (max_len - len(ids))
        return torch.tensor(ids, dtype=torch.long)

    def _build_timeseries(self, rec: SongRecord) -> Tensor:
        """Build (seq_len, 10) tensor from 90-day engagement + derived features.

        Channels 0-7: raw, log1p, cumsum, diff, 7d-avg, 14d-avg, rel-change, zscore
        Channels 8-9: save_rate and follower_velocity (static, repeated across time)
        """
        eng = np.array(rec.engagement_series, dtype=np.float32)
        T = min(len(eng), self.seq_len)
        out = np.zeros((self.seq_len, 10), dtype=np.float32)
        if T > 0:
            e = eng[:T]
            # channels: raw, log1p, cumsum, diff, 7d-avg, 14d-avg, rel-change, zscore
            log_e = np.log1p(e)
            cum = np.cumsum(e)
            diff = np.concatenate([[0], np.diff(e)])
            avg7 = np.convolve(e, np.ones(7) / 7, mode="same")
            avg14 = np.convolve(e, np.ones(14) / 14, mode="same")
            rel = diff / (e + 1e-8)
            std = e.std() + 1e-8
            zscore = (e - e.mean()) / std
            out[:T, :8] = np.stack([e, log_e, cum, diff, avg7, avg14, rel, zscore], axis=-1)
            # Static A&R signals repeated across time dimension
            out[:T, 8] = float(rec.save_rate)
            out[:T, 9] = float(rec.follower_velocity)

        if self.augment:
            # Gaussian noise (only on engagement channels, not static signals)
            out[:T, :8] += np.random.randn(T, 8).astype(np.float32) * 0.01
            # Random timestep dropout (zero out 10%)
            drop_mask = np.random.rand(T) < 0.10
            out[:T][drop_mask] = 0.0
            # Random time warping ±10%: sample a stretch factor and resample
            if T > 10:
                stretch = 1.0 + np.random.uniform(-0.1, 0.1)
                new_T = max(1, int(T * stretch))
                src_idx = np.linspace(0, T - 1, new_T).astype(int).clip(0, T - 1)
                warped = out[src_idx]
                out = np.zeros((self.seq_len, 10), dtype=np.float32)
                write_T = min(new_T, self.seq_len)
                out[:write_T] = warped[:write_T]
                T = write_T

        return torch.tensor(out, dtype=torch.float32)

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Dict[str, Tensor]:
        rec = self.records[idx]

        ts = self._build_timeseries(rec)   # (seq_len, 10)

        audio = np.array(rec.audio_features[:64], dtype=np.float32)
        if len(audio) < 64:
            audio = np.pad(audio, (0, 64 - len(audio)))
        if self.augment:
            # Feature masking: zero 15% of audio features
            mask = np.random.rand(64) < 0.15
            audio[mask] = 0.0
        audio_t = torch.tensor(audio, dtype=torch.float32)  # (64,)

        meta = np.array(rec.metadata_features[:32], dtype=np.float32)
        if len(meta) < 32:
            meta = np.pad(meta, (0, 32 - len(meta)))
        meta_t = torch.tensor(meta, dtype=torch.float32)    # (32,)

        text = f"{rec.title} {rec.genre or ''}"
        text_tokens = self._tokenize(text, max_len=32)       # (32,)

        actual_len = min(len(rec.engagement_series), self.seq_len)

        return {
            "timeseries": ts,                                           # (seq_len, 10)
            "audio": audio_t,                                           # (64,)
            "metadata": meta_t,                                         # (32,)
            "text_tokens": text_tokens,                                 # (32,)
            "lengths": torch.tensor(actual_len, dtype=torch.long),
            "label_viral": torch.tensor(float(rec.is_viral), dtype=torch.float32),
            "label_days": torch.tensor(
                rec.days_to_viral if rec.days_to_viral is not None else -1.0,
                dtype=torch.float32,
            ),
            "label_peak": torch.tensor(rec.peak_viral_score, dtype=torch.float32),
            "song_id": torch.tensor(rec.song_id, dtype=torch.long),
            "save_rate": torch.tensor(rec.save_rate, dtype=torch.float32),
            "follower_velocity": torch.tensor(rec.follower_velocity, dtype=torch.float32),
            "skip_rate": torch.tensor(rec.skip_rate, dtype=torch.float32),
            "label_emerging": torch.tensor(float(rec.is_emerging), dtype=torch.float32),
        }


# ---------------------------------------------------------------------------
# Synthetic data generator
# ---------------------------------------------------------------------------

class ViralDataSynthesizer:
    """Generates realistic synthetic SongRecord data for testing."""

    def __init__(self, seed: int = 42) -> None:
        np.random.seed(seed)
        random.seed(seed)

    def generate(self, n: int = 100_000, viral_rate: float = 0.08) -> List[SongRecord]:
        """
        Generate n SongRecords with ~viral_rate fraction going viral.
        Viral songs have higher energy/danceability and hockey-stick engagement.
        """
        records: List[SongRecord] = []
        genres = ["pop", "hip-hop", "edm", "r&b", "indie", "country", "latin", "k-pop"]

        for i in range(n):
            is_viral = np.random.rand() < viral_rate

            if is_viral:
                # higher energy/danceability for viral songs
                audio_features = list(np.random.beta(5, 2, 64).astype(np.float32))
                # hockey-stick engagement: flat then spike at days 7-14
                base = np.random.lognormal(mean=5, sigma=1, size=90)
                spike_start = np.random.randint(7, 14)
                spike = np.random.lognormal(mean=9, sigma=0.5, size=90 - spike_start)
                base[spike_start:] += spike
                engagement = base.tolist()
                uses_30d = int(np.random.lognormal(mean=10, sigma=1.2))
                uses_30d = max(VIRAL_TIKTOK_THRESHOLD, uses_30d)
                days_v: Optional[float] = float(np.random.randint(spike_start, 30))
                peak = float(np.clip(np.random.normal(75, 15), 40, 100))
                # A&R signals: viral distribution
                save_rate = float(np.random.beta(3, 5))           # mean ~0.37
                follower_velocity = float(np.random.uniform(0.10, 0.40))
                skip_rate = float(np.random.beta(2, 8))            # mean ~0.20
                pre_save_count = int(np.random.lognormal(7, 1.5))
                uses_7d = max(0, int(uses_30d // 4 + np.random.normal(0, 500)))
            else:
                audio_features = list(np.random.beta(2, 5, 64).astype(np.float32))
                # lower engagement, long tail
                engagement = list(np.random.lognormal(mean=3, sigma=1.5, size=90))
                uses_30d = int(np.random.lognormal(mean=5, sigma=1.5))
                uses_30d = min(uses_30d, VIRAL_TIKTOK_THRESHOLD - 1)
                days_v = None
                peak = float(np.clip(np.random.normal(25, 15), 0, 60))
                # A&R signals: non-viral distribution
                save_rate = float(np.random.beta(1.5, 7))         # mean ~0.18
                follower_velocity = float(np.random.uniform(0.0, 0.12))
                skip_rate = float(np.random.beta(4, 4))            # mean ~0.50
                pre_save_count = int(np.random.lognormal(4, 1.5))
                uses_7d = max(0, int(np.random.lognormal(3, 2)))

            metadata = list(np.random.randn(32).astype(np.float32) * 0.5)

            records.append(SongRecord(
                song_id=i,
                title=f"Song {i}",
                artist=f"Artist {i % 10000}",
                release_date="2024-01-01",
                genre=random.choice(genres),
                tiktok_uses_30d=uses_30d,
                days_to_viral=days_v,
                peak_viral_score=peak,
                engagement_series=engagement,
                audio_features=audio_features,
                metadata_features=metadata,
                tiktok_uses_7d=uses_7d,
                save_rate=float(np.clip(save_rate, 0.0, 1.0)),
                follower_velocity=float(np.clip(follower_velocity, 0.0, 1.0)),
                skip_rate=float(np.clip(skip_rate, 0.0, 1.0)),
                pre_save_count=pre_save_count,
            ))

        return records


# ---------------------------------------------------------------------------
# DataLoader factory
# ---------------------------------------------------------------------------

def build_tiktok_dataloaders(
    records: List[SongRecord],
    cfg: Optional[object] = None,
    split: Tuple[float, float, float] = (0.8, 0.1, 0.1),
    batch_size: int = 256,
    num_workers: int = 4,
    seq_len: int = 90,
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    """
    Stratified split + weighted sampler for class imbalance.
    Returns (train_loader, val_loader, test_loader).
    """
    from sklearn.model_selection import train_test_split

    labels = np.array([int(r.is_viral) for r in records])
    idx = np.arange(len(records))

    train_frac, val_frac, test_frac = split
    # first split: train vs (val+test)
    idx_train, idx_tmp, y_train, y_tmp = train_test_split(
        idx, labels, test_size=(val_frac + test_frac), stratify=labels, random_state=42
    )
    # second split: val vs test
    rel_test = test_frac / (val_frac + test_frac)
    idx_val, idx_test = train_test_split(
        idx_tmp, test_size=rel_test, stratify=y_tmp, random_state=42
    )

    train_recs = [records[i] for i in idx_train]
    val_recs = [records[i] for i in idx_val]
    test_recs = [records[i] for i in idx_test]

    train_ds = TikTokViralDataset(train_recs, seq_len=seq_len, augment=True)
    val_ds = TikTokViralDataset(val_recs, seq_len=seq_len, augment=False)
    test_ds = TikTokViralDataset(test_recs, seq_len=seq_len, augment=False)

    # weighted sampler: upsample viral 10x
    train_labels = np.array([int(r.is_viral) for r in train_recs])
    sampler = StratifiedWeightedSampler(train_labels, oversample_factor=10.0)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, sampler=sampler.get_sampler(),
        num_workers=num_workers, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers,
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers,
    )
    return train_loader, val_loader, test_loader


# ---------------------------------------------------------------------------
# Sampling utility (imported by focal_loss too)
# ---------------------------------------------------------------------------

class StratifiedWeightedSampler:
    """Weighted random sampler that oversamples the minority class."""

    def __init__(self, labels: np.ndarray, oversample_factor: float = 10.0) -> None:
        self.labels = labels
        self.oversample_factor = oversample_factor

    def get_sampler(self) -> WeightedRandomSampler:
        classes, counts = np.unique(self.labels, return_counts=True)
        class_weights = 1.0 / counts.astype(float)
        # boost minority class (viral=1) by oversample_factor
        if len(classes) == 2:
            minority = classes[np.argmin(counts)]
            class_weights[classes == minority] *= self.oversample_factor

        sample_weights = np.array([class_weights[np.where(classes == l)[0][0]] for l in self.labels])
        return WeightedRandomSampler(
            weights=torch.tensor(sample_weights, dtype=torch.float64),
            num_samples=len(self.labels),
            replacement=True,
        )
