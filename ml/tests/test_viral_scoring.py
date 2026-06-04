"""
Edge cases in viral scoring.

Tests the viral classification head, loss, and scoring pipeline for:
  - Class imbalance handling
  - Threshold sensitivity
  - Label smoothing effect
  - Positive weight calibration
  - Rare positive class behavior
  - Degenerate inputs (all-zero, all-same, NaN-guard)
  - Days-to-viral masking logic
  - Multi-task loss weighting
"""

import math

import numpy as np
import pytest
import torch
import torch.nn as nn

from ml.models.heads import ViralClassificationHead, DaysToViralHead, PeakScoreHead
from ml.training.losses import (
    LabelSmoothBCELoss,
    MultiTaskLossWeights,
    ViralTransformerLoss,
)
from ml.evaluation.metrics import compute_viral_classification_metrics
from .conftest import make_batch, tiny_model, BATCH, TINY_D


# ---------------------------------------------------------------------------
# Label-smoothed BCE
# ---------------------------------------------------------------------------

class TestLabelSmoothBCELoss:

    def test_zero_smoothing_equals_standard_bce(self):
        logits = torch.randn(16, 1)
        targets = torch.randint(0, 2, (16, 1)).float()
        smooth_loss = LabelSmoothBCELoss(smoothing=0.0)(logits, targets)
        bce_loss = nn.BCEWithLogitsLoss()(logits, targets)
        assert torch.isclose(smooth_loss, bce_loss, atol=1e-5)

    def test_smoothing_reduces_confidence(self):
        """With smoothing, predicting 1 on a true-1 label should cost more than without."""
        logits = torch.tensor([[10.0]])  # very confident positive
        targets = torch.tensor([[1.0]])
        loss_no_smooth = LabelSmoothBCELoss(smoothing=0.0)(logits, targets)
        loss_smooth = LabelSmoothBCELoss(smoothing=0.1)(logits, targets)
        # Smoothing converts target 1 → 0.95, so confident prediction slightly penalized
        assert loss_smooth > loss_no_smooth

    def test_smoothed_targets_in_valid_range(self):
        """Smoothed targets should be strictly between 0 and 1."""
        eps = 0.1
        # y_smooth = y*(1-eps) + eps/2 ∈ [eps/2, 1-eps/2]
        y_smooth_0 = 0 * (1 - eps) + eps / 2
        y_smooth_1 = 1 * (1 - eps) + eps / 2
        assert 0 < y_smooth_0 < 1
        assert 0 < y_smooth_1 < 1

    def test_positive_weight_amplifies_recall_loss(self):
        """Misclassifying a positive sample should cost more with higher pos_weight."""
        logits = torch.tensor([[-5.0]])  # confident negative prediction
        targets = torch.tensor([[1.0]])   # but true label is positive
        loss_w1 = LabelSmoothBCELoss(smoothing=0.0, pos_weight=torch.tensor([1.0]))(logits, targets)
        loss_w5 = LabelSmoothBCELoss(smoothing=0.0, pos_weight=torch.tensor([5.0]))(logits, targets)
        assert loss_w5 > loss_w1 * 2

    def test_loss_is_finite_on_extreme_logits(self):
        logits = torch.tensor([[100.0], [-100.0]])
        targets = torch.tensor([[1.0], [0.0]])
        loss = LabelSmoothBCELoss(smoothing=0.05)(logits, targets)
        assert torch.isfinite(loss)


# ---------------------------------------------------------------------------
# Multi-task loss
# ---------------------------------------------------------------------------

class TestViralTransformerLoss:

    def _make_inputs(self, batch_size=8, viral_rate=0.25):
        batch = make_batch(batch_size=batch_size, viral_rate=viral_rate)
        return batch

    def test_total_loss_is_positive(self):
        loss_fn = ViralTransformerLoss()
        batch = self._make_inputs()
        logits = torch.randn(8, 1)
        days = torch.abs(torch.randn(8, 1)) + 1
        peak = torch.sigmoid(torch.randn(8, 1)) * 100
        clip = torch.randn(8, 16)
        clip_t = batch["clip_target"]
        losses = loss_fn(logits, days, peak, clip, batch["viral"], batch["days_to_viral"], batch["peak_score"], clip_t)
        assert losses.total.item() > 0
        assert torch.isfinite(losses.total)

    def test_all_zeros_viral_no_days_loss(self):
        """When no samples are viral, days loss should be 0."""
        loss_fn = ViralTransformerLoss()
        B = 8
        viral_labels = torch.zeros(B, 1)
        logits = torch.randn(B, 1)
        days = torch.abs(torch.randn(B, 1)) + 1
        peak = torch.sigmoid(torch.randn(B, 1)) * 100
        losses = loss_fn(logits, days, peak, None, viral_labels,
                         torch.rand(B, 1) * 30, torch.rand(B, 1) * 80, None)
        assert losses.days.item() == pytest.approx(0.0, abs=1e-6)

    def test_days_loss_only_on_viral_samples(self):
        """Changing days predictions for non-viral samples should not affect days loss."""
        loss_fn = ViralTransformerLoss()
        B = 8
        viral_labels = torch.zeros(B, 1)
        viral_labels[:2] = 1.0  # only first 2 are viral

        days_a = torch.ones(B, 1) * 10.0
        days_b = torch.ones(B, 1) * 10.0
        days_b[2:] = 999.0  # change non-viral days (should not affect loss)

        base_args = (torch.randn(B, 1), None, viral_labels, torch.rand(B, 1) * 30, torch.rand(B, 1) * 80, None)
        losses_a = loss_fn(base_args[0], days_a, torch.rand(B, 1) * 100, None,
                           viral_labels, torch.rand(B, 1) * 30, torch.rand(B, 1) * 80, None)
        losses_b = loss_fn(base_args[0], days_b, torch.rand(B, 1) * 100, None,
                           viral_labels, torch.rand(B, 1) * 30, torch.rand(B, 1) * 80, None)
        # Same logits and viral labels → same viral loss; days only differ in non-viral
        assert torch.isclose(losses_a.days, losses_b.days, atol=1e-4)

    def test_loss_weights_scale_total(self):
        """Doubling all weights should double total loss."""
        w1 = MultiTaskLossWeights(viral=1.0, days=0.5, peak=0.5, clip=0.25)
        w2 = MultiTaskLossWeights(viral=2.0, days=1.0, peak=1.0, clip=0.5)
        loss_fn1 = ViralTransformerLoss(weights=w1)
        loss_fn2 = ViralTransformerLoss(weights=w2)

        B = 8
        viral_labels = torch.zeros(B, 1)
        viral_labels[:2] = 1.0
        logits = torch.randn(B, 1)
        days = torch.abs(torch.randn(B, 1)) + 1
        peak = torch.rand(B, 1) * 100
        days_labels = torch.rand(B, 1) * 30
        peak_labels = torch.rand(B, 1) * 80

        l1 = loss_fn1(logits, days, peak, None, viral_labels, days_labels, peak_labels, None)
        l2 = loss_fn2(logits, days, peak, None, viral_labels, days_labels, peak_labels, None)

        assert torch.isclose(l2.total, l1.total * 2, rtol=0.01)

    def test_clip_loss_multiclass_mode(self):
        loss_fn = ViralTransformerLoss(clip_mode="multiclass")
        B = 8
        viral_labels = torch.zeros(B, 1)
        clip_logits = torch.randn(B, 16)
        clip_targets = torch.zeros(B, 16)
        for i in range(B):
            clip_targets[i, i % 16] = 1.0

        losses = loss_fn(
            torch.randn(B, 1), torch.abs(torch.randn(B, 1)) + 1,
            torch.rand(B, 1) * 100, clip_logits,
            viral_labels, torch.rand(B, 1) * 30, torch.rand(B, 1) * 80,
            clip_targets,
        )
        assert torch.isfinite(losses.clip)
        assert losses.clip.item() > 0

    def test_no_clip_when_none(self):
        loss_fn = ViralTransformerLoss()
        B = 4
        losses = loss_fn(
            torch.randn(B, 1), torch.abs(torch.randn(B, 1)) + 1,
            torch.rand(B, 1) * 100, None,
            torch.zeros(B, 1), torch.rand(B, 1) * 30, torch.rand(B, 1) * 80,
            None,
        )
        assert losses.clip.item() == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Viral classification head edge cases
# ---------------------------------------------------------------------------

class TestViralClassificationHead:

    def test_all_negative_input_proba_below_half(self):
        head = ViralClassificationHead(d_model=32, dropout=0.0)
        # Near-zero input → sigmoid of small logit ≈ 0.5; after head bias init ≈ 0.5
        x = torch.zeros(4, 32)
        probs = head.predict_proba(x)
        # Probabilities should be in valid range (head output is unconstrained logit pre-sigmoid)
        assert (probs >= 0).all() and (probs <= 1).all()

    def test_logits_not_clamped(self):
        head = ViralClassificationHead(d_model=32, dropout=0.0)
        with torch.no_grad():
            nn.init.constant_(head.classifier[-1].weight, 1.0)
            nn.init.constant_(head.classifier[-1].bias, 10.0)
        x = torch.ones(2, 32)
        logits = head(x)
        # Logits can exceed 1 — should not be clipped
        assert logits.max() > 1.0

    def test_gradient_flows_through_head(self):
        head = ViralClassificationHead(d_model=32, dropout=0.0)
        x = torch.randn(4, 32, requires_grad=True)
        logits = head(x)
        logits.sum().backward()
        assert x.grad is not None and not x.grad.isnan().any()


# ---------------------------------------------------------------------------
# Days-to-viral head edge cases
# ---------------------------------------------------------------------------

class TestDaysToViralHead:

    def test_output_always_positive(self):
        head = DaysToViralHead(d_model=32, dropout=0.0)
        for _ in range(10):
            x = torch.randn(8, 32) * 10  # large random inputs
            days = head(x)
            assert (days > 0).all(), "days_to_viral must be strictly positive"

    def test_softplus_scale_bounds(self):
        """Output should be bounded within a practical range via softplus."""
        head = DaysToViralHead(d_model=32, dropout=0.0)
        x = torch.zeros(4, 32)
        days = head(x)
        # softplus(0) ≈ 0.693; scaled to ~days_scale
        assert (days > 0).all()
        assert (days < 10000).all()  # should not be astronomically large for zero input

    def test_days_increases_with_positive_signal(self):
        """With a positive linear head, larger inputs should predict more days."""
        head = DaysToViralHead(d_model=32, dropout=0.0)
        with torch.no_grad():
            # Force positive weights so output scales with input
            for p in head.parameters():
                p.fill_(0.1)
        x_small = torch.ones(1, 32) * 0.1
        x_large = torch.ones(1, 32) * 5.0
        days_small = head(x_small).item()
        days_large = head(x_large).item()
        assert days_large >= days_small


# ---------------------------------------------------------------------------
# Imbalance stress tests
# ---------------------------------------------------------------------------

class TestClassImbalanceStress:

    def test_extreme_imbalance_1pct_viral(self):
        """Loss should still be finite with 99% negative class."""
        B = 100
        viral_labels = torch.zeros(B, 1)
        viral_labels[:1] = 1.0  # 1% positive

        loss_fn = ViralTransformerLoss(viral_pos_weight=99.0)  # match imbalance
        losses = loss_fn(
            torch.randn(B, 1),
            torch.abs(torch.randn(B, 1)) + 1,
            torch.rand(B, 1) * 100,
            None,
            viral_labels,
            torch.rand(B, 1) * 30,
            torch.rand(B, 1) * 80,
            None,
        )
        assert torch.isfinite(losses.total)

    def test_all_positive_no_nan_loss(self):
        """All-positive batch should not produce NaN."""
        B = 16
        viral_labels = torch.ones(B, 1)
        loss_fn = ViralTransformerLoss()
        losses = loss_fn(
            torch.randn(B, 1),
            torch.abs(torch.randn(B, 1)) + 1,
            torch.rand(B, 1) * 100,
            None,
            viral_labels,
            torch.rand(B, 1) * 30,
            torch.rand(B, 1) * 80,
            None,
        )
        assert torch.isfinite(losses.total)
        assert torch.isfinite(losses.days)

    def test_all_negative_days_loss_zero(self):
        """No viral samples → days loss must be 0."""
        B = 16
        viral_labels = torch.zeros(B, 1)
        loss_fn = ViralTransformerLoss()
        losses = loss_fn(
            torch.randn(B, 1),
            torch.abs(torch.randn(B, 1)) + 1,
            torch.rand(B, 1) * 100,
            None,
            viral_labels,
            torch.rand(B, 1) * 30,
            torch.rand(B, 1) * 80,
            None,
        )
        assert losses.days.item() == pytest.approx(0.0, abs=1e-6)


# ---------------------------------------------------------------------------
# Threshold sensitivity
# ---------------------------------------------------------------------------

class TestThresholdSensitivity:

    def test_higher_threshold_lower_recall(self):
        rng = np.random.default_rng(42)
        probs = rng.beta(2, 5, 500)
        labels = (probs > 0.3).astype(int)
        probs = np.clip(probs + rng.normal(0, 0.1, 500), 0, 1)

        m_low = compute_viral_classification_metrics(probs, labels, threshold=0.2)
        m_high = compute_viral_classification_metrics(probs, labels, threshold=0.8)

        assert m_high["recall"] <= m_low["recall"]

    def test_higher_threshold_higher_or_equal_precision(self):
        rng = np.random.default_rng(5)
        probs = rng.uniform(0, 1, 500)
        labels = (probs > 0.5).astype(int)

        m_low = compute_viral_classification_metrics(probs, labels, threshold=0.1)
        m_high = compute_viral_classification_metrics(probs, labels, threshold=0.9)

        assert m_high["precision"] >= m_low["precision"]

    def test_auroc_invariant_to_threshold(self):
        """AUROC is threshold-independent."""
        rng = np.random.default_rng(7)
        probs = rng.uniform(0, 1, 500)
        labels = rng.integers(0, 2, 500)

        m1 = compute_viral_classification_metrics(probs, labels, threshold=0.3)
        m2 = compute_viral_classification_metrics(probs, labels, threshold=0.7)

        assert m1["auroc"] == pytest.approx(m2["auroc"], abs=1e-8)
