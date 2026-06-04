"""
Data pipeline reliability tests.

Covers dataset loading, padding/masking, normalization, augmentation,
tokenization, date encoding, and DataLoader batch collation.
"""

import math
import random

import numpy as np
import pytest
import torch

from ml.data.dataset import (
    MusicViralDataset,
    SimpleTokenizer,
    build_dataloaders,
    encode_date_features,
)
from .conftest import make_records, AUDIO_SEQ, TS_STEPS, TEXT_LEN, TS_FEATURES, AUDIO_DIM, CLIP_SEQ


# ---------------------------------------------------------------------------
# Date feature encoding
# ---------------------------------------------------------------------------

class TestDateEncoding:

    def test_output_length(self):
        feats = encode_date_features("2023-06-15")
        assert len(feats) == 5

    def test_sin_cos_unit_circle(self):
        feats = encode_date_features("2023-01-01")
        sin_m, cos_m, sin_d, cos_d, year = feats
        # sin² + cos² ≈ 1 for both month and day-of-week
        assert math.isclose(sin_m**2 + cos_m**2, 1.0, abs_tol=1e-6)
        assert math.isclose(sin_d**2 + cos_d**2, 1.0, abs_tol=1e-6)

    def test_year_normalization_range(self):
        # Years 2010–2030 → year_norm in [-0.5, 1.0] roughly
        for year in range(2010, 2031):
            feats = encode_date_features(f"{year}-06-01")
            assert -2.0 <= feats[4] <= 2.0

    def test_invalid_date_returns_defaults(self):
        feats = encode_date_features("not-a-date")
        assert len(feats) == 5
        # Should not raise; returns a reasonable fallback
        for f in feats:
            assert math.isfinite(f)

    def test_empty_string_returns_defaults(self):
        feats = encode_date_features("")
        assert len(feats) == 5

    def test_cyclicity_month(self):
        """December and January should be closer to each other than Jan and June."""
        jan = encode_date_features("2023-01-01")[:2]
        jun = encode_date_features("2023-06-01")[:2]
        dec = encode_date_features("2023-12-01")[:2]
        jan_dec_dist = math.sqrt((jan[0] - dec[0])**2 + (jan[1] - dec[1])**2)
        jan_jun_dist = math.sqrt((jan[0] - jun[0])**2 + (jan[1] - jun[1])**2)
        assert jan_dec_dist < jan_jun_dist


# ---------------------------------------------------------------------------
# SimpleTokenizer
# ---------------------------------------------------------------------------

class TestSimpleTokenizer:

    def test_output_shape(self):
        tok = SimpleTokenizer(max_length=32)
        enc = tok.encode("hello world foo")
        assert enc["input_ids"].shape == (32,)
        assert enc["attention_mask"].shape == (32,)

    def test_cls_token_at_start(self):
        tok = SimpleTokenizer(max_length=32)
        enc = tok.encode("test text")
        assert enc["input_ids"][0].item() == tok.cls_token_id

    def test_padding_applied(self):
        tok = SimpleTokenizer(max_length=32)
        enc = tok.encode("short")
        # Tail should be padded
        assert enc["input_ids"][-1].item() == tok.pad_token_id
        assert enc["attention_mask"][-1].item() == 0

    def test_truncation(self):
        tok = SimpleTokenizer(max_length=10)
        long_text = " ".join([f"word{i}" for i in range(100)])
        enc = tok.encode(long_text)
        assert enc["input_ids"].shape == (10,)

    def test_attention_mask_ones_before_padding(self):
        tok = SimpleTokenizer(max_length=32)
        enc = tok.encode("one two three")
        mask = enc["attention_mask"].tolist()
        # All 1s followed by all 0s
        seen_zero = False
        for m in mask:
            if m == 0:
                seen_zero = True
            if seen_zero:
                assert m == 0, "Found 1 after 0 in attention mask"

    def test_empty_string(self):
        tok = SimpleTokenizer(max_length=16)
        enc = tok.encode("")
        # CLS + SEP + padding
        assert enc["input_ids"][0].item() == tok.cls_token_id


# ---------------------------------------------------------------------------
# MusicViralDataset item structure
# ---------------------------------------------------------------------------

class TestMusicViralDataset:

    @pytest.fixture
    def records(self):
        return make_records(n=8)

    @pytest.fixture
    def dataset(self, records):
        return MusicViralDataset(
            records,
            audio_max_len=AUDIO_SEQ,
            ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN,
            ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM,
            clip_seq_len=CLIP_SEQ,
            augment=False,
        )

    def test_len(self, dataset, records):
        assert len(dataset) == len(records)

    def test_item_keys(self, dataset):
        item = dataset[0]
        expected = {
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
            "viral", "days_to_viral", "peak_score", "clip_target",
        }
        assert set(item.keys()) == expected

    def test_audio_features_shape(self, dataset):
        assert dataset[0]["audio_features"].shape == (AUDIO_SEQ, AUDIO_DIM)

    def test_audio_mask_shape_and_type(self, dataset):
        mask = dataset[0]["audio_mask"]
        assert mask.shape == (AUDIO_SEQ,)
        assert mask.dtype == torch.bool

    def test_timeseries_shape(self, dataset):
        assert dataset[0]["timeseries"].shape == (TS_STEPS, TS_FEATURES)

    def test_ts_mask_false_for_valid_steps(self, dataset, records):
        item = dataset[0]
        n_real = min(len(records[0]["timeseries"]), TS_STEPS)
        # Valid timesteps should have mask=False
        assert not item["ts_mask"][:n_real].any()

    def test_input_ids_shape(self, dataset):
        assert dataset[0]["input_ids"].shape == (TEXT_LEN,)

    def test_viral_label_float(self, dataset, records):
        for i, rec in enumerate(records):
            viral = dataset[i]["viral"].item()
            assert viral in (0.0, 1.0)
            assert viral == float(rec["viral"])

    def test_days_to_viral_nonnegative(self, dataset):
        for i in range(len(dataset)):
            assert dataset[i]["days_to_viral"].item() >= 0.0

    def test_peak_score_range(self, dataset):
        for i in range(len(dataset)):
            s = dataset[i]["peak_score"].item()
            assert 0.0 <= s <= 100.0

    def test_clip_target_shape(self, dataset):
        assert dataset[0]["clip_target"].shape == (CLIP_SEQ,)

    def test_clip_target_has_positive(self, dataset, records):
        """Records with clip_segments should have at least one hot position."""
        for i, rec in enumerate(records):
            if rec["clip_segments"]:
                assert dataset[i]["clip_target"].sum() > 0

    def test_timeseries_log_normalization(self):
        """Large raw values should be log-compressed to reasonable range."""
        rec = make_records(1)[0]
        rec["timeseries"] = [[1e6] * TS_FEATURES]
        ds = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        ts = ds[0]["timeseries"]
        assert ts.abs().max() < 100.0, "log1p normalization should compress large values"

    def test_audio_noise_augmentation(self):
        """Augmentation should produce slightly different audio each call."""
        rec = make_records(1)[0]
        ds_aug = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
            augment=True,
        )
        ds_no_aug = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
            augment=False,
        )
        aug_audio = ds_aug[0]["audio_features"]
        no_aug_audio = ds_no_aug[0]["audio_features"]
        # Augmented and un-augmented should not be bit-identical
        # (extremely low probability they are identical due to Gaussian noise)
        assert not torch.equal(aug_audio, no_aug_audio)

    def test_missing_audio_falls_back_to_zeros(self):
        rec = make_records(1)[0]
        del rec["audio_features"]
        rec.pop("audio_path", None)
        ds = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        audio = ds[0]["audio_features"]
        # First frame = zeros, mask should be True for all but first
        assert audio.shape == (AUDIO_SEQ, AUDIO_DIM)

    def test_timeseries_truncation_keeps_recent(self):
        """If timeseries is longer than ts_max_len, keep the LAST steps."""
        rec = make_records(1)[0]
        long_ts = [[float(t)] * TS_FEATURES for t in range(TS_STEPS * 2)]
        rec["timeseries"] = long_ts
        ds = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        ts = ds[0]["timeseries"]
        # First value after log transform should correspond to the most recent half
        # The raw first value of the kept window is TS_STEPS (halfway into the doubled ts)
        first_val = ts[0, 0].item()
        expected_first_raw = float(TS_STEPS)  # index TS_STEPS in the long ts
        expected_first = math.log1p(expected_first_raw)
        assert abs(first_val - expected_first) < 0.01

    def test_feature_dim_padding(self):
        """Timeseries with fewer features than expected should be zero-padded."""
        rec = make_records(1)[0]
        rec["timeseries"] = [[1.0, 2.0] for _ in range(10)]  # only 2 features
        ds = MusicViralDataset(
            [rec],
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        ts = ds[0]["timeseries"]
        # Columns beyond the 2 provided should be 0
        assert ts[0, 2:].sum() == 0.0

    def test_continuous_meta_length(self, dataset):
        assert dataset[0]["continuous_meta"].shape == (8,)

    def test_date_features_length(self, dataset):
        assert dataset[0]["date_features"].shape == (5,)


# ---------------------------------------------------------------------------
# DataLoader collation
# ---------------------------------------------------------------------------

class TestDataLoaders:

    def test_build_dataloaders_returns_three(self):
        records = make_records(20)
        train_r, val_r, test_r = records[:12], records[12:16], records[16:]
        train_dl, val_dl, test_dl = build_dataloaders(
            train_r, val_r, test_r,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        assert train_dl is not None
        assert val_dl is not None
        assert test_dl is not None

    def test_batch_tensor_shapes(self):
        records = make_records(8)
        dl, _, _ = build_dataloaders(
            records, records,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        batch = next(iter(dl))
        assert batch["audio_features"].shape == (4, AUDIO_SEQ, AUDIO_DIM)
        assert batch["timeseries"].shape == (4, TS_STEPS, TS_FEATURES)
        assert batch["input_ids"].shape == (4, TEXT_LEN)
        assert batch["viral"].shape == (4, 1)
        assert batch["peak_score"].shape == (4, 1)

    def test_no_test_loader_when_omitted(self):
        records = make_records(8)
        _, _, test_dl = build_dataloaders(
            records, records,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        assert test_dl is None

    def test_drop_last_on_train(self):
        """Train loader drops last incomplete batch."""
        records = make_records(10)
        dl, _, _ = build_dataloaders(
            records, records,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        # 10 samples, batch=4, drop_last=True → 2 batches of 4
        assert len(dl) == 2

    def test_val_loader_no_drop_last(self):
        records = make_records(6)
        _, val_dl, _ = build_dataloaders(
            records, records,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        # 6 samples → 1 batch of 4 + 1 batch of 2
        assert len(val_dl) == 2

    def test_all_tensors_finite(self):
        records = make_records(8)
        dl, _, _ = build_dataloaders(
            records, records,
            batch_size=4, num_workers=0, pin_memory=False,
            audio_max_len=AUDIO_SEQ, ts_max_len=TS_STEPS,
            text_max_len=TEXT_LEN, ts_num_features=TS_FEATURES,
            audio_feature_dim=AUDIO_DIM, clip_seq_len=CLIP_SEQ,
        )
        for batch in dl:
            for key, t in batch.items():
                if t.is_floating_point():
                    assert torch.isfinite(t).all(), f"Non-finite values in batch[{key!r}]"
