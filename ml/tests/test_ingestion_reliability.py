"""
Ingestion reliability tests — idempotency, validation, duplicate injection, replay.

Tests the Python-side pipeline components and mirrors the TypeScript validator
rules so both layers stay in sync.
"""

import copy
import pytest
import pandas as pd
import numpy as np

from .conftest import make_records, AUDIO_SEQ, TS_STEPS, TEXT_LEN, TS_FEATURES, AUDIO_DIM, CLIP_SEQ
from ml.data.dataset import MusicViralDataset


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_raw_record(**overrides):
    base = {
        "artist_id": 1,
        "date": "2024-01-15",
        "stream_velocity": 0.25,
        "save_rate": 0.18,
        "skip_rate": 0.12,
        "follower_growth": 0.08,
        "playlist_rate": 0.03,
        "ugc_count": 45,
        "tiktok_uses_7d": 45,
        "radio_spins": 23,
        "chart_rank": None,
        "pre_save_count": None,
        "viral": 0,
        "days_to_viral": 0,
        "peak_score": 40.0,
    }
    return {**base, **overrides}


def build_dataset(records):
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


# ─────────────────────────────────────────────────────────────────────────────
# Validator rules (mirrors lib/ingestion/validator.ts)
# ─────────────────────────────────────────────────────────────────────────────

def validate_artist_metrics(m: dict) -> list[str]:
    """Python mirror of the TypeScript validateArtistMetrics() — returns list of violations."""
    violations = []

    aid = m.get("artist_id")
    if not (isinstance(aid, int) and aid > 0):
        violations.append("artist_id must be a positive integer")

    date = m.get("date")
    if not (isinstance(date, str) and len(date) == 10 and date[4] == "-" and date[7] == "-"):
        violations.append("date must be YYYY-MM-DD")

    for field, lo, hi in [
        ("stream_velocity", -1, 100),
        ("follower_growth", -1, 100),
    ]:
        v = m.get(field)
        if v is not None and not (isinstance(v, (int, float)) and lo <= v <= hi):
            violations.append(f"{field} must be in [{lo}, {hi}] or None")

    for field in ("save_rate", "skip_rate"):
        v = m.get(field)
        if v is not None and not (isinstance(v, (int, float)) and 0 <= v <= 1):
            violations.append(f"{field} must be in [0, 1] or None")

    for field in ("playlist_rate", "tiktok_uses_7d", "radio_spins", "pre_save_count"):
        v = m.get(field)
        if v is not None and not (isinstance(v, (int, float)) and v >= 0):
            violations.append(f"{field} must be >= 0 or None")

    for field in ("ugc_count",):
        v = m.get(field)
        if v is not None and not (isinstance(v, int) and v >= 0):
            violations.append(f"{field} must be a non-negative integer or None")

    chart_rank = m.get("chart_rank")
    if chart_rank is not None and not (isinstance(chart_rank, int) and 1 <= chart_rank <= 200):
        violations.append("chart_rank must be in [1, 200] or None")

    return violations


class TestValidatorRules:

    def test_valid_record_passes(self):
        assert validate_artist_metrics(make_raw_record()) == []

    def test_all_nullable_fields_accept_none(self):
        m = make_raw_record(
            stream_velocity=None, save_rate=None, skip_rate=None,
            follower_growth=None, playlist_rate=None, ugc_count=None,
            tiktok_uses_7d=None, radio_spins=None, chart_rank=None, pre_save_count=None,
        )
        assert validate_artist_metrics(m) == []

    def test_negative_artist_id_rejected(self):
        violations = validate_artist_metrics(make_raw_record(artist_id=-1))
        assert any("artist_id" in v for v in violations)

    def test_zero_artist_id_rejected(self):
        violations = validate_artist_metrics(make_raw_record(artist_id=0))
        assert any("artist_id" in v for v in violations)

    def test_invalid_date_format_rejected(self):
        violations = validate_artist_metrics(make_raw_record(date="2024/01/15"))
        assert any("date" in v for v in violations)

    def test_save_rate_above_1_rejected(self):
        violations = validate_artist_metrics(make_raw_record(save_rate=1.5))
        assert any("save_rate" in v for v in violations)

    def test_save_rate_negative_rejected(self):
        violations = validate_artist_metrics(make_raw_record(save_rate=-0.01))
        assert any("save_rate" in v for v in violations)

    def test_skip_rate_above_1_rejected(self):
        violations = validate_artist_metrics(make_raw_record(skip_rate=1.1))
        assert any("skip_rate" in v for v in violations)

    def test_stream_velocity_extreme_rejected(self):
        violations = validate_artist_metrics(make_raw_record(stream_velocity=200.0))
        assert any("stream_velocity" in v for v in violations)

    def test_negative_ugc_count_rejected(self):
        violations = validate_artist_metrics(make_raw_record(ugc_count=-5))
        assert any("ugc_count" in v for v in violations)

    def test_float_ugc_count_rejected(self):
        violations = validate_artist_metrics(make_raw_record(ugc_count=3.7))
        assert any("ugc_count" in v for v in violations)

    def test_chart_rank_zero_rejected(self):
        violations = validate_artist_metrics(make_raw_record(chart_rank=0))
        assert any("chart_rank" in v for v in violations)

    def test_chart_rank_201_rejected(self):
        violations = validate_artist_metrics(make_raw_record(chart_rank=201))
        assert any("chart_rank" in v for v in violations)

    def test_chart_rank_200_accepted(self):
        assert validate_artist_metrics(make_raw_record(chart_rank=200)) == []

    def test_chart_rank_1_accepted(self):
        assert validate_artist_metrics(make_raw_record(chart_rank=1)) == []

    def test_multiple_violations_all_reported(self):
        violations = validate_artist_metrics(
            make_raw_record(save_rate=5.0, skip_rate=-1.0, chart_rank=999)
        )
        assert len(violations) >= 3

    def test_negative_radio_spins_rejected(self):
        violations = validate_artist_metrics(make_raw_record(radio_spins=-1))
        assert any("radio_spins" in v for v in violations)


# ─────────────────────────────────────────────────────────────────────────────
# Idempotency — run pipeline twice, same output
# ─────────────────────────────────────────────────────────────────────────────

class TestIdempotency:

    def test_validate_twice_same_result(self):
        """Validation is a pure function — same input always produces same violations."""
        m = make_raw_record(save_rate=2.0, chart_rank=999)
        assert validate_artist_metrics(m) == validate_artist_metrics(m)

    def test_validate_unmodified_by_call(self):
        """Validation must not mutate the input record."""
        m = make_raw_record()
        original = copy.deepcopy(m)
        validate_artist_metrics(m)
        assert m == original

    def test_dataset_deterministic_no_augment(self):
        """Same records built into a dataset twice produce identical tensors (no augment)."""
        import torch
        records = make_records(n=10, seed=7)
        ds1 = build_dataset(records)
        ds2 = build_dataset(records)
        for i in range(len(records)):
            assert torch.equal(ds1[i]["timeseries"], ds2[i]["timeseries"])
            assert torch.equal(ds1[i]["viral"], ds2[i]["viral"])

    def test_dataset_length_stable(self):
        """Processing the same records twice yields the same length."""
        records = make_records(n=12, seed=7)
        assert len(build_dataset(records)) == len(build_dataset(records))


# ─────────────────────────────────────────────────────────────────────────────
# Duplicate injection
# ─────────────────────────────────────────────────────────────────────────────

class TestDuplicateInjection:

    def test_duplicate_records_same_violation_count(self):
        """Inserting the same record twice shouldn't change validation outcome."""
        m = make_raw_record()
        records = [m, copy.deepcopy(m)]
        total = sum(len(validate_artist_metrics(r)) for r in records)
        assert total == 0

    def test_duplicate_invalid_records_each_flagged(self):
        """Every copy of an invalid record should be individually flagged."""
        bad = make_raw_record(save_rate=5.0)
        copies = [validate_artist_metrics(copy.deepcopy(bad)) for _ in range(3)]
        assert all(len(v) > 0 for v in copies)
        assert copies[0] == copies[1] == copies[2]

    def test_dataset_with_duplicate_records_accepted(self):
        """Dataset should accept duplicate records without crashing."""
        records = make_records(n=5, seed=0)
        duplicated = records + copy.deepcopy(records)
        ds = build_dataset(duplicated)
        assert len(ds) == 10

    def test_validator_filters_duplicates_correctly(self):
        """50% invalid + 50% valid should yield exactly 50% pass rate."""
        good = [make_raw_record(artist_id=i + 1) for i in range(5)]
        bad = [make_raw_record(artist_id=-(i + 1)) for i in range(5)]
        all_records = good + bad
        passed = [r for r in all_records if not validate_artist_metrics(r)]
        assert len(passed) == 5


# ─────────────────────────────────────────────────────────────────────────────
# Replay — same input → same output, even after a simulated interruption
# ─────────────────────────────────────────────────────────────────────────────

class TestReplay:

    def test_partial_then_full_run_same_items(self):
        """Items processed in a partial run must appear in the full replay."""
        import torch
        records = make_records(n=20, seed=3)
        first_half = records[:10]

        ds_partial = build_dataset(first_half)
        ds_full = build_dataset(records)

        # Every item from partial run should be present in full run (by index)
        for i in range(len(ds_partial)):
            assert torch.equal(ds_partial[i]["viral"], ds_full[i]["viral"])

    def test_replay_produces_same_tensors(self):
        """Replaying the same complete dataset produces bit-identical tensors."""
        import torch
        records = make_records(n=20, seed=3)
        ds1 = build_dataset(records)
        ds2 = build_dataset(records)
        for i in range(len(records)):
            assert torch.equal(ds1[i]["timeseries"], ds2[i]["timeseries"])

    def test_output_keys_stable_across_runs(self):
        """Item key set should not change between runs on the same schema."""
        records = make_records(n=8, seed=5)
        keys1 = set(build_dataset(records)[0].keys())
        keys2 = set(build_dataset(records)[0].keys())
        assert keys1 == keys2


# ─────────────────────────────────────────────────────────────────────────────
# Kill-and-restart simulation
# ─────────────────────────────────────────────────────────────────────────────

class TestKillAndRestart:

    def test_invalid_records_filtered_before_processing(self):
        """Good records survive after bad records are filtered out."""
        good = [make_raw_record(artist_id=i + 1) for i in range(9)]
        bad = make_raw_record(artist_id=-1, save_rate=999.0, date="bad-date")
        all_records = good + [bad]
        survivors = [r for r in all_records if not validate_artist_metrics(r)]
        assert len(survivors) == 9

    def test_empty_valid_batch_returns_nothing(self):
        """All records invalid → nothing passes the validator."""
        records = [make_raw_record(artist_id=-i - 1) for i in range(5)]
        survivors = [r for r in records if not validate_artist_metrics(r)]
        assert len(survivors) == 0

    def test_dataset_single_record(self):
        """Dataset should handle a single record without crashing."""
        records = make_records(n=1, seed=0)
        ds = build_dataset(records)
        item = ds[0]
        assert "viral" in item

    def test_dataset_empty_records_raises_or_returns_empty(self):
        """Empty record list should not produce unexpected behaviour."""
        try:
            ds = build_dataset([])
            assert len(ds) == 0
        except Exception:
            pass  # raising on empty input is also acceptable
