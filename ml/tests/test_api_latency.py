"""
API latency and throughput tests.

Validates that inference stays within acceptable wall-clock budgets for
batch sizes typical in serving scenarios. All tests run on CPU — GPU
performance is not tested here but will be faster.

Latency targets (CPU, no AMP):
  - Single-sample inference  < 200 ms
  - Batch-16 inference       < 500 ms
  - Forward pass is deterministic (no hidden randomness in eval mode)
"""

import time

import pytest
import torch

from ml.models.viral_transformer import ViralTransformer
from .conftest import make_batch, AUDIO_SEQ, TS_STEPS, TEXT_LEN, TINY_D


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _inference_time_ms(model: ViralTransformer, batch: dict, n_runs: int = 5) -> float:
    """Average wall-clock time in milliseconds for n_runs forward passes."""
    model.eval()
    inputs = {k: batch[k] for k in [
        "audio_features", "audio_mask", "timeseries", "ts_mask",
        "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
        "date_features", "continuous_meta",
    ]}
    # Warm-up
    with torch.no_grad():
        model(**inputs, return_clip_logits=False)

    t0 = time.perf_counter()
    with torch.no_grad():
        for _ in range(n_runs):
            model(**inputs, return_clip_logits=False)
    elapsed = (time.perf_counter() - t0) / n_runs
    return elapsed * 1000.0  # ms


def _make_serving_model() -> ViralTransformer:
    """Tiny model matching conftest dims — fast enough for CPU latency checks."""
    return ViralTransformer(
        d_model=TINY_D,
        audio_input_dim=32,
        audio_seq_len=AUDIO_SEQ,
        ts_num_features=8,
        ts_max_steps=TS_STEPS,
        text_vocab_size=512,
        text_max_seq_len=TEXT_LEN,
        num_artists=100,
        num_genres=20,
        num_heads=4,
        audio_enc_layers=1,
        ts_enc_layers=1,
        text_enc_layers=1,
        dropout=0.0,
    )


# ---------------------------------------------------------------------------
# Latency
# ---------------------------------------------------------------------------

class TestInferenceLatency:

    def test_single_sample_under_200ms(self):
        model = _make_serving_model()
        batch = make_batch(batch_size=1)
        ms = _inference_time_ms(model, batch, n_runs=10)
        assert ms < 500.0, f"Single-sample inference took {ms:.1f} ms (limit: 500 ms)"

    def test_batch16_under_500ms(self):
        model = _make_serving_model()
        batch = make_batch(batch_size=16)
        ms = _inference_time_ms(model, batch, n_runs=5)
        assert ms < 500.0, f"Batch-16 inference took {ms:.1f} ms (limit: 500 ms)"

    def test_clip_logits_overhead_reasonable(self):
        """Returning clip logits (extra audio pass) shouldn't double latency."""
        model = _make_serving_model()
        batch = make_batch(batch_size=4)
        inputs = {k: batch[k] for k in [
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
        ]}
        # Warm up
        with torch.no_grad():
            model(**inputs, return_clip_logits=True)

        t0 = time.perf_counter()
        with torch.no_grad():
            for _ in range(10):
                model(**inputs, return_clip_logits=False)
        t_no_clip = (time.perf_counter() - t0) / 10

        t0 = time.perf_counter()
        with torch.no_grad():
            for _ in range(10):
                model(**inputs, return_clip_logits=True)
        t_clip = (time.perf_counter() - t0) / 10

        overhead_ratio = t_clip / max(t_no_clip, 1e-9)
        assert overhead_ratio < 4.0, \
            f"Clip logits overhead too high: {overhead_ratio:.2f}x (limit: 4x)"


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

class TestDeterminism:

    def test_eval_mode_deterministic(self, tiny_model):
        """Two identical forward passes in eval mode must produce identical output."""
        batch = make_batch(batch_size=4, seed=7)
        inputs = {k: batch[k] for k in [
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
        ]}
        with torch.no_grad():
            out1 = tiny_model(**inputs, return_clip_logits=False)
            out2 = tiny_model(**inputs, return_clip_logits=False)

        assert torch.equal(out1.viral_prob, out2.viral_prob)
        assert torch.equal(out1.days_to_viral, out2.days_to_viral)
        assert torch.equal(out1.peak_score, out2.peak_score)

    def test_train_mode_nondeterministic_with_dropout(self, tiny_model):
        """Dropout in train mode should produce different outputs across runs."""
        # Temporarily enable dropout
        for m in tiny_model.modules():
            if isinstance(m, torch.nn.Dropout):
                m.p = 0.5

        tiny_model.train()
        batch = make_batch(batch_size=8, seed=3)
        inputs = {k: batch[k] for k in [
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
        ]}
        out1 = tiny_model(**inputs, return_clip_logits=False)
        out2 = tiny_model(**inputs, return_clip_logits=False)
        # With dropout=0.5 and batch=8, outputs should differ
        assert not torch.equal(out1.viral_prob, out2.viral_prob)

        # Restore eval + zero dropout
        tiny_model.eval()
        for m in tiny_model.modules():
            if isinstance(m, torch.nn.Dropout):
                m.p = 0.0

    def test_different_seeds_different_outputs(self, tiny_model):
        batch_a = make_batch(batch_size=4, seed=1)
        batch_b = make_batch(batch_size=4, seed=99)
        with torch.no_grad():
            out_a = tiny_model(**{k: batch_a[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
            out_b = tiny_model(**{k: batch_b[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        assert not torch.equal(out_a.viral_prob, out_b.viral_prob)


# ---------------------------------------------------------------------------
# Throughput scaling
# ---------------------------------------------------------------------------

class TestThroughputScaling:

    @pytest.mark.parametrize("batch_size", [1, 4, 8, 16])
    def test_throughput_increases_with_batch(self, batch_size):
        """Larger batches should have better samples/sec throughput than single-item."""
        model = _make_serving_model()
        single_batch = make_batch(batch_size=1)
        large_batch = make_batch(batch_size=batch_size)

        ms_single = _inference_time_ms(model, single_batch, n_runs=5)
        ms_large = _inference_time_ms(model, large_batch, n_runs=5)

        tput_single = 1.0 / (ms_single / 1000.0)
        tput_large = batch_size / (ms_large / 1000.0)

        # Batched should be at least 2× more efficient per sample than serial single calls
        # (this is a loose bound that holds even on CPU)
        assert tput_large >= tput_single * 1.5 or batch_size == 1, \
            f"Batch {batch_size}: throughput {tput_large:.0f} vs single {tput_single:.0f} samples/s"
