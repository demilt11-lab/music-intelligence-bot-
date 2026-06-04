"""
Edge cases in feature engineering.

Tests boundary conditions in audio loading, timeseries preprocessing,
text tokenization, metadata encoding, and clip target construction.
"""

import math

import numpy as np
import pytest
import torch

from ml.data.dataset import (
    MusicViralDataset,
    SimpleTokenizer,
    encode_date_features,
)
from .conftest import make_records, AUDIO_SEQ, TS_STEPS, TEXT_LEN, TS_FEATURES, AUDIO_DIM, CLIP_SEQ


def _make_ds(records, **kwargs):
    defaults = dict(
        audio_max_len=AUDIO_SEQ,
        ts_max_len=TS_STEPS,
        text_max_len=TEXT_LEN,
        ts_num_features=TS_FEATURES,
        audio_feature_dim=AUDIO_DIM,
        clip_seq_len=CLIP_SEQ,
        augment=False,
    )
    defaults.update(kwargs)
    return MusicViralDataset(records, **defaults)


# ---------------------------------------------------------------------------
# Audio edge cases
# ---------------------------------------------------------------------------

class TestAudioEdgeCases:

    def test_single_frame_audio(self):
        rec = make_records(1)[0]
        rec["audio_features"] = [[0.5] * AUDIO_DIM]
        ds = _make_ds([rec])
        item = ds[0]
        assert item["audio_features"].shape == (AUDIO_SEQ, AUDIO_DIM)
        # Frame 0 should be non-zero, rest should be padded zeros
        assert item["audio_features"][0].abs().sum() > 0
        assert item["audio_features"][1:].abs().sum() == pytest.approx(0.0)
        # Mask: frame 0 = attend, rest = pad
        assert not item["audio_mask"][0].item()
        assert item["audio_mask"][1:].all()

    def test_audio_exactly_max_len(self):
        rec = make_records(1)[0]
        rec["audio_features"] = [[1.0] * AUDIO_DIM] * AUDIO_SEQ
        ds = _make_ds([rec])
        item = ds[0]
        assert not item["audio_mask"].any(), "All frames should be valid (no padding)"

    def test_audio_longer_than_max_len_truncated(self):
        rec = make_records(1)[0]
        rec["audio_features"] = [[float(i)] * AUDIO_DIM for i in range(AUDIO_SEQ * 2)]
        ds = _make_ds([rec])
        item = ds[0]
        assert item["audio_features"].shape == (AUDIO_SEQ, AUDIO_DIM)
        assert not item["audio_mask"].any()

    def test_audio_all_zeros_no_nan(self):
        rec = make_records(1)[0]
        rec["audio_features"] = [[0.0] * AUDIO_DIM] * 10
        ds = _make_ds([rec])
        item = ds[0]
        assert torch.isfinite(item["audio_features"]).all()

    def test_audio_large_values(self):
        rec = make_records(1)[0]
        rec["audio_features"] = [[1e10] * AUDIO_DIM] * 5
        ds = _make_ds([rec])
        item = ds[0]
        # No NaN/Inf from loading (normalization not applied to audio)
        assert torch.isfinite(item["audio_features"][:5]).all()

    def test_audio_feature_dim_clipped(self):
        """Audio features with more dims than audio_feature_dim should be truncated."""
        rec = make_records(1)[0]
        rec["audio_features"] = [[1.0] * (AUDIO_DIM + 32)] * 4
        ds = _make_ds([rec])
        assert ds[0]["audio_features"].shape == (AUDIO_SEQ, AUDIO_DIM)


# ---------------------------------------------------------------------------
# Timeseries edge cases
# ---------------------------------------------------------------------------

class TestTimeseriesEdgeCases:

    def test_empty_timeseries_fallback(self):
        rec = make_records(1)[0]
        rec["timeseries"] = []
        ds = _make_ds([rec])
        item = ds[0]
        assert item["timeseries"].shape == (TS_STEPS, TS_FEATURES)
        # Should have fallen back to zero row; mask should indicate 1 real step
        assert not item["ts_mask"][0].item()

    def test_single_timestep(self):
        rec = make_records(1)[0]
        rec["timeseries"] = [[100.0] * TS_FEATURES]
        ds = _make_ds([rec])
        item = ds[0]
        assert item["ts_mask"][0].item() == False  # valid
        assert item["ts_mask"][1:].all()            # padded

    def test_log1p_applied_to_positive_values(self):
        rec = make_records(1)[0]
        raw_val = 1000.0
        rec["timeseries"] = [[raw_val] + [0.0] * (TS_FEATURES - 1)]
        ds = _make_ds([rec])
        item = ds[0]
        expected = math.log1p(raw_val)
        assert abs(item["timeseries"][0, 0].item() - expected) < 1e-4

    def test_log1p_preserves_sign_for_negatives(self):
        rec = make_records(1)[0]
        rec["timeseries"] = [[-50.0] + [0.0] * (TS_FEATURES - 1)]
        ds = _make_ds([rec])
        item = ds[0]
        # sign * log1p(abs) → should be negative
        assert item["timeseries"][0, 0].item() < 0

    def test_timeseries_zero_values_no_nan(self):
        rec = make_records(1)[0]
        rec["timeseries"] = [[0.0] * TS_FEATURES] * 5
        ds = _make_ds([rec])
        assert torch.isfinite(ds[0]["timeseries"]).all()

    def test_timeseries_keeps_most_recent_on_truncation(self):
        rec = make_records(1)[0]
        # Values ascend with time; after truncation, first row should be step TS_STEPS
        long_ts = [[float(t)] * TS_FEATURES for t in range(TS_STEPS + 10)]
        rec["timeseries"] = long_ts
        ds = _make_ds([rec])
        item = ds[0]
        expected_first_raw = float(10)  # items 10..TS_STEPS+9 → first is index 10
        expected = math.log1p(expected_first_raw)
        assert abs(item["timeseries"][0, 0].item() - expected) < 1e-4


# ---------------------------------------------------------------------------
# Text / tokenizer edge cases
# ---------------------------------------------------------------------------

class TestTextEdgeCases:

    def test_unicode_text(self):
        tok = SimpleTokenizer(max_length=32)
        enc = tok.encode("こんにちは world 🎵")
        assert enc["input_ids"].shape == (32,)
        assert enc["input_ids"][0].item() == tok.cls_token_id

    def test_numbers_in_text(self):
        tok = SimpleTokenizer(max_length=16)
        enc = tok.encode("track 100 bpm 2024")
        assert enc["input_ids"].shape == (16,)

    def test_repeated_words(self):
        tok = SimpleTokenizer(max_length=16, vocab_size=512)
        enc = tok.encode("viral viral viral viral")
        # All middle tokens should map to same id (hash-consistent)
        ids = enc["input_ids"].tolist()
        # Positions 1..4 should be identical (same hash)
        assert ids[1] == ids[2] == ids[3] == ids[4]

    def test_very_long_captions_truncated(self):
        rec = make_records(1)[0]
        rec["captions"] = " ".join([f"word{i}" for i in range(1000)])
        ds = _make_ds([rec])
        assert ds[0]["input_ids"].shape == (TEXT_LEN,)

    def test_all_fields_concatenated(self):
        """title + lyrics + captions should all contribute to the token sequence."""
        tok = SimpleTokenizer(max_length=64)
        text = "title lyrics captions"
        enc = tok.encode(text)
        # With 3 words, we have CLS + 3 content + SEP = 5 non-pad tokens
        mask = enc["attention_mask"].tolist()
        assert sum(mask) == 5


# ---------------------------------------------------------------------------
# Metadata / clip edge cases
# ---------------------------------------------------------------------------

class TestMetadataEdgeCases:

    def test_artist_id_zero_ok(self):
        rec = make_records(1)[0]
        rec["artist_id"] = 0
        ds = _make_ds([rec])
        assert ds[0]["artist_ids"].item() == 0

    def test_missing_continuous_meta_defaults_zero(self):
        rec = make_records(1)[0]
        for k in MusicViralDataset.CONTINUOUS_META_KEYS:
            rec.pop(k, None)
        ds = _make_ds([rec])
        assert (ds[0]["continuous_meta"] == 0.0).all()

    def test_clip_segments_out_of_range_ignored(self):
        rec = make_records(1)[0]
        rec["clip_segments"] = [-1, CLIP_SEQ, CLIP_SEQ + 100]  # all invalid
        ds = _make_ds([rec])
        assert ds[0]["clip_target"].sum() == 0.0

    def test_clip_segments_empty_all_zero(self):
        rec = make_records(1)[0]
        rec["clip_segments"] = []
        ds = _make_ds([rec])
        assert ds[0]["clip_target"].sum() == 0.0

    def test_clip_multiple_valid_segments(self):
        rec = make_records(1)[0]
        rec["clip_segments"] = [0, 5, 10]
        ds = _make_ds([rec])
        target = ds[0]["clip_target"]
        assert target[0] == 1.0
        assert target[5] == 1.0
        assert target[10] == 1.0
        assert target.sum() == 3.0

    def test_viral_label_is_float(self):
        for v in [0, 1, True, False]:
            rec = make_records(1)[0]
            rec["viral"] = v
            ds = _make_ds([rec])
            label = ds[0]["viral"]
            assert label.dtype == torch.float32

    def test_peak_score_clipped_implicitly(self):
        """Dataset doesn't clip peak_score — it's the model/loss's job.
        Just verify that the raw value passes through."""
        rec = make_records(1)[0]
        rec["peak_score"] = 150.0  # out of [0,100] — raw pass-through
        ds = _make_ds([rec])
        assert ds[0]["peak_score"].item() == pytest.approx(150.0)

    def test_days_to_viral_default_when_missing(self):
        rec = make_records(1)[0]
        rec.pop("days_to_viral", None)
        ds = _make_ds([rec])
        # Default is 365.0
        assert ds[0]["days_to_viral"].item() == pytest.approx(365.0)
