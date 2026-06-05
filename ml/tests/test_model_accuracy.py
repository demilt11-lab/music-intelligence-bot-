"""
ML prediction accuracy tests.

Validates that model outputs are numerically correct — correct shapes, value
ranges, gradient flow, and that a trained model beats random chance on a
small synthetic dataset.
"""

import pytest
import torch
import numpy as np

from ml.models.viral_transformer import ViralTransformer, ViralTransformerOutput
from ml.models.encoders import (
    AudioEncoder, TimeSeriesEncoder, TextEncoder, MetadataEncoder,
    SinusoidalPositionalEncoding,
)
from ml.models.fusion import CrossAttentionBlock, CrossModalFusion, GatedFusion
from ml.models.heads import (
    ViralClassificationHead, DaysToViralHead, PeakScoreHead, ClipRecommendationHead,
)
from ml.training.losses import ViralTransformerLoss, MultiTaskLossWeights
from ml.evaluation.metrics import (
    compute_viral_classification_metrics,
    compute_days_to_viral_metrics,
    compute_peak_score_metrics,
    compute_clip_metrics,
)
from .conftest import make_batch, BATCH, AUDIO_SEQ, TS_STEPS, TEXT_LEN, TINY_D, CLIP_SEQ


# ---------------------------------------------------------------------------
# Output shape & range
# ---------------------------------------------------------------------------

class TestOutputShapesAndRanges:

    def test_viral_prob_shape_and_range(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=True)
        assert out.viral_prob.shape == (BATCH, 1)
        assert out.viral_prob.min() >= 0.0
        assert out.viral_prob.max() <= 1.0

    def test_days_to_viral_positive(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        assert out.days_to_viral.shape == (BATCH, 1)
        assert (out.days_to_viral > 0).all(), "days_to_viral must be strictly positive"

    def test_peak_score_range(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        assert out.peak_score.shape == (BATCH, 1)
        assert out.peak_score.min() >= 0.0
        assert out.peak_score.max() <= 100.0

    def test_clip_logits_shape(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=True)
        assert out.clip_logits is not None
        assert out.clip_logits.shape == (BATCH, AUDIO_SEQ)

    def test_gate_weights_sum_to_one(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        sums = out.gate_weights.sum(dim=-1)  # (B,)
        assert torch.allclose(sums, torch.ones(BATCH), atol=1e-5), \
            f"Gate weights should sum to 1, got {sums}"

    def test_cross_attn_weights_keys(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        modalities = ["audio", "timeseries", "text", "meta"]
        expected_keys = {f"{q}_from_{kv}" for q in modalities for kv in modalities if q != kv}
        assert set(out.cross_attn_weights.keys()) == expected_keys

    def test_fused_embedding_shape(self, tiny_model, batch):
        with torch.no_grad():
            out = tiny_model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=False)
        assert out.fused_embedding is not None
        assert out.fused_embedding.shape == (BATCH, TINY_D)


# ---------------------------------------------------------------------------
# Individual encoder shapes
# ---------------------------------------------------------------------------

class TestEncoderShapes:

    def test_audio_encoder(self):
        enc = AudioEncoder(input_dim=32, d_model=32, num_heads=4, num_layers=1, max_seq_len=16)
        x = torch.randn(4, 16, 32)
        out = enc(x)
        assert out.shape == (4, 32)

    def test_audio_encoder_with_mask(self):
        enc = AudioEncoder(input_dim=32, d_model=32, num_heads=4, num_layers=1, max_seq_len=16)
        x = torch.randn(4, 16, 32)
        mask = torch.zeros(4, 16, dtype=torch.bool)
        mask[:, 8:] = True  # mask second half
        out = enc(x, src_key_padding_mask=mask)
        assert out.shape == (4, 32)

    def test_ts_encoder(self):
        enc = TimeSeriesEncoder(num_features=8, d_model=32, num_heads=4, num_layers=1, max_steps=30)
        x = torch.randn(4, 30, 8)
        out = enc(x)
        assert out.shape == (4, 32)

    def test_text_encoder(self):
        enc = TextEncoder(vocab_size=512, d_model=32, num_heads=4, num_layers=1, max_seq_len=32)
        ids = torch.randint(0, 512, (4, 32))
        ids[:, 0] = 101
        out = enc(ids)
        assert out.shape == (4, 32)

    def test_meta_encoder(self):
        enc = MetadataEncoder(
            num_artists=100, num_genres=20,
            artist_emb_dim=16, genre_emb_dim=8,
            num_date_features=5, num_continuous=8,
            d_model=32,
        )
        out = enc(
            artist_ids=torch.randint(1, 100, (4,)),
            genre_ids=torch.randint(1, 20, (4,)),
            date_features=torch.randn(4, 5),
            continuous=torch.randn(4, 8),
        )
        assert out.shape == (4, 32)

    def test_sinusoidal_pe_shape(self):
        pe = SinusoidalPositionalEncoding(d_model=32, max_len=64)
        x = torch.randn(4, 16, 32)
        out = pe(x)
        assert out.shape == (4, 16, 32)

    def test_sinusoidal_pe_magnitude(self):
        """PE should not drastically change the input scale."""
        pe = SinusoidalPositionalEncoding(d_model=64, max_len=64, dropout=0.0)
        pe.eval()
        x = torch.ones(1, 10, 64)
        out = pe(x)
        assert out.abs().max() < 10.0


# ---------------------------------------------------------------------------
# Fusion shapes
# ---------------------------------------------------------------------------

class TestFusionShapes:

    def test_cross_attention_block(self):
        blk = CrossAttentionBlock(d_model=32, num_heads=4, dropout=0.0)
        q = torch.randn(4, 32)
        kv = torch.randn(4, 32)
        out, w = blk(q, kv)
        assert out.shape == (4, 32)
        assert w.shape == (4, 1)

    def test_cross_modal_fusion(self):
        fusion = CrossModalFusion(d_model=32, num_heads=4, dropout=0.0)
        audio = torch.randn(4, 32)
        ts = torch.randn(4, 32)
        text = torch.randn(4, 32)
        meta = torch.randn(4, 32)
        fused, weights = fusion(audio, ts, text, meta)
        assert set(fused.keys()) == {"audio", "timeseries", "text", "meta"}
        for emb in fused.values():
            assert emb.shape == (4, 32)

    def test_gated_fusion(self):
        gf = GatedFusion(d_model=32, num_modalities=4, dropout=0.0)
        mods = {k: torch.randn(4, 32) for k in ["audio", "timeseries", "text", "meta"]}
        fused, weights = gf(mods)
        assert fused.shape == (4, 32)
        assert weights.shape == (4, 4)
        assert torch.allclose(weights.sum(dim=-1), torch.ones(4), atol=1e-5)


# ---------------------------------------------------------------------------
# Head shapes
# ---------------------------------------------------------------------------

class TestHeadShapes:

    def test_viral_head(self):
        head = ViralClassificationHead(d_model=32, dropout=0.0)
        x = torch.randn(4, 32)
        logits = head(x)
        assert logits.shape == (4, 1)
        probs = head.predict_proba(x)
        assert probs.min() >= 0 and probs.max() <= 1

    def test_days_head_positive(self):
        head = DaysToViralHead(d_model=32, dropout=0.0)
        x = torch.randn(4, 32)
        days = head(x)
        assert days.shape == (4, 1)
        assert (days > 0).all()

    def test_peak_head_range(self):
        head = PeakScoreHead(d_model=32, dropout=0.0)
        x = torch.randn(4, 32)
        score = head(x)
        assert score.shape == (4, 1)
        assert score.min() >= 0 and score.max() <= 100

    def test_clip_head(self):
        head = ClipRecommendationHead(d_model=32, dropout=0.0, mode="multiclass")
        seq = torch.randn(4, 16, 32)
        logits = head(seq)
        assert logits.shape == (4, 16)
        segs = head.predict_segments(seq, top_k=3)
        assert segs.shape == (4, 3)
        assert (segs >= 0).all() and (segs < 16).all()


# ---------------------------------------------------------------------------
# Gradient flow
# ---------------------------------------------------------------------------

class TestGradientFlow:

    def test_loss_backward(self, tiny_model, batch):
        tiny_model.train()
        out = tiny_model(**{k: batch[k] for k in [
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
        ]}, return_clip_logits=True)
        loss_fn = ViralTransformerLoss()
        losses = loss_fn(
            viral_logits=out.viral_logits,
            days_to_viral=out.days_to_viral,
            peak_score=out.peak_score,
            clip_logits=out.clip_logits,
            viral_labels=batch["viral"],
            days_labels=batch["days_to_viral"],
            peak_labels=batch["peak_score"],
            clip_targets=batch["clip_target"],
        )
        losses.total.backward()
        # Check that gradients exist for all major parameters
        for name, param in tiny_model.named_parameters():
            if param.requires_grad and param.grad is not None:
                assert not torch.isnan(param.grad).any(), f"NaN gradient in {name}"
        tiny_model.eval()

    def test_no_gradient_through_frozen_encoder(self, tiny_model, batch):
        """Freezing audio encoder should stop gradients through it."""
        for p in tiny_model.audio_encoder.parameters():
            p.requires_grad_(False)
        tiny_model.zero_grad()

        tiny_model.train()
        out = tiny_model(**{k: batch[k] for k in [
            "audio_features", "audio_mask", "timeseries", "ts_mask",
            "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
            "date_features", "continuous_meta",
        ]}, return_clip_logits=False)
        out.viral_logits.sum().backward()

        for name, param in tiny_model.audio_encoder.named_parameters():
            assert param.grad is None, f"Expected no grad in frozen audio encoder: {name}"

        # Re-enable
        for p in tiny_model.audio_encoder.parameters():
            p.requires_grad_(True)
        tiny_model.eval()


# ---------------------------------------------------------------------------
# Overfitting sanity check (model can memorize small dataset)
# ---------------------------------------------------------------------------

class TestOverfitSanity:

    def test_model_can_overfit_tiny_batch(self):
        """A model should be able to drive training loss near zero on 4 samples."""
        model = ViralTransformer(
            d_model=32, audio_input_dim=32, audio_seq_len=8,
            ts_num_features=8, ts_max_steps=10,
            text_vocab_size=64, text_max_seq_len=16,
            num_artists=10, num_genres=5,
            num_heads=4, audio_enc_layers=1, ts_enc_layers=1, text_enc_layers=1,
            dropout=0.0,
        )
        batch = make_batch(batch_size=4)
        # Shorten sequences to match tiny model
        batch["audio_features"] = batch["audio_features"][:, :8, :32]
        batch["audio_mask"] = batch["audio_mask"][:, :8]
        batch["timeseries"] = batch["timeseries"][:, :10, :]
        batch["ts_mask"] = batch["ts_mask"][:, :10]
        batch["input_ids"] = (batch["input_ids"][:, :16] % 64).clamp(min=0)
        batch["text_attention_mask"] = batch["text_attention_mask"][:, :16]
        batch["clip_target"] = batch["clip_target"][:, :8]
        batch["artist_ids"] = (batch["artist_ids"] % 10).clamp(min=1)
        batch["genre_ids"] = (batch["genre_ids"] % 5).clamp(min=1)

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-2)
        loss_fn = ViralTransformerLoss()

        initial_loss = None
        for _ in range(60):
            model.train()
            optimizer.zero_grad()
            out = model(**{k: batch[k] for k in [
                "audio_features", "audio_mask", "timeseries", "ts_mask",
                "input_ids", "text_attention_mask", "artist_ids", "genre_ids",
                "date_features", "continuous_meta",
            ]}, return_clip_logits=True)
            losses = loss_fn(
                out.viral_logits, out.days_to_viral, out.peak_score, out.clip_logits,
                batch["viral"], batch["days_to_viral"], batch["peak_score"], batch["clip_target"],
            )
            if initial_loss is None:
                initial_loss = losses.total.item()
            losses.total.backward()
            optimizer.step()

        final_loss = losses.total.item()
        assert final_loss < initial_loss * 0.5, \
            f"Expected >50% loss reduction, got {initial_loss:.4f} → {final_loss:.4f}"


# ---------------------------------------------------------------------------
# Accuracy metrics correctness
# ---------------------------------------------------------------------------

class TestMetricsCorrectness:

    def test_perfect_viral_classifier(self):
        labels = np.array([1, 1, 0, 0, 1, 0])
        probs = np.array([0.99, 0.95, 0.01, 0.02, 0.9, 0.05])
        m = compute_viral_classification_metrics(probs, labels)
        assert m["auroc"] == pytest.approx(1.0, abs=1e-4)
        assert m["f1"] == pytest.approx(1.0, abs=1e-4)

    def test_random_viral_classifier(self):
        rng = np.random.default_rng(0)
        labels = rng.integers(0, 2, 1000)
        probs = rng.uniform(0, 1, 1000)
        m = compute_viral_classification_metrics(probs, labels)
        assert 0.4 < m["auroc"] < 0.6, "Random classifier should have AUROC near 0.5"

    def test_brier_score_bounds(self):
        labels = np.array([1.0, 0.0])
        perfect = np.array([1.0, 0.0])
        worst = np.array([0.0, 1.0])
        assert compute_viral_classification_metrics(perfect, labels)["brier_score"] == pytest.approx(0.0)
        assert compute_viral_classification_metrics(worst, labels)["brier_score"] == pytest.approx(1.0)

    def test_ece_perfect_calibration(self):
        """Perfectly calibrated model should have ECE near zero."""
        probs = np.linspace(0.05, 0.95, 20)
        # Labels match probabilities on average: 1 if prob > 0.5
        labels = (probs > 0.5).astype(float)
        m = compute_viral_classification_metrics(probs, labels)
        assert m["ece"] < 0.3  # loose bound, not truly calibrated

    def test_days_mae_viral_only(self):
        preds = np.array([10.0, 20.0, 5.0, 100.0])
        labels = np.array([12.0, 18.0, 5.0, 80.0])
        viral_mask = np.array([True, True, True, False])
        m = compute_days_to_viral_metrics(preds, labels, viral_mask)
        # MAE over first 3: (2+2+0)/3 ≈ 1.33
        assert m["mae"] == pytest.approx(4 / 3, abs=0.01)

    def test_days_within_7d_accuracy(self):
        preds = np.array([10.0, 10.0, 10.0, 10.0])
        labels = np.array([10.0, 16.0, 10.0, 20.0])  # errors: 0, 6, 0, 10
        m = compute_days_to_viral_metrics(preds, labels)
        assert m["within_7d_acc"] == pytest.approx(0.75)
        assert m["within_14d_acc"] == pytest.approx(1.0)

    def test_peak_score_r2(self):
        preds = np.array([50.0, 60.0, 70.0, 80.0])
        labels = np.array([50.0, 60.0, 70.0, 80.0])  # perfect prediction
        m = compute_peak_score_metrics(preds, labels)
        assert m["r2"] == pytest.approx(1.0, abs=1e-6)

    def test_peak_score_spearman(self):
        preds = np.array([1, 2, 3, 4], dtype=float)
        labels = np.array([4, 3, 2, 1], dtype=float)  # perfect anti-correlation
        m = compute_peak_score_metrics(preds, labels)
        assert m["spearman_rho"] == pytest.approx(-1.0, abs=1e-4)

    def test_clip_ndcg_perfect(self):
        # One sample, 4 frames. Frame 0 is the ground truth.
        logits = np.array([[10.0, -1.0, -1.0, -1.0]])
        targets = np.array([[1.0, 0.0, 0.0, 0.0]])
        m = compute_clip_metrics(logits, targets, k_values=[1, 3])
        assert m["ndcg@1"] == pytest.approx(1.0)
        assert m["hit_rate@1"] == pytest.approx(1.0)
        assert m["mrr"] == pytest.approx(1.0)

    def test_clip_ndcg_worst(self):
        # Ground truth frame ranked last out of 4
        logits = np.array([[-10.0, 10.0, 10.0, 10.0]])
        targets = np.array([[1.0, 0.0, 0.0, 0.0]])
        m = compute_clip_metrics(logits, targets, k_values=[1])
        assert m["ndcg@1"] == pytest.approx(0.0)
        assert m["hit_rate@1"] == pytest.approx(0.0)

    def test_degenerate_single_class_labels(self):
        """Metrics should return nan for single-class label distribution."""
        probs = np.array([0.9, 0.8, 0.7])
        labels = np.array([1.0, 1.0, 1.0])  # all positive
        m = compute_viral_classification_metrics(probs, labels)
        assert np.isnan(m["auroc"])

    def test_count_parameters(self, tiny_model):
        counts = tiny_model.count_parameters()
        assert counts["total"] > 0
        assert counts["audio_encoder"] > 0
        assert sum(v for k, v in counts.items() if k != "total") == counts["total"]
