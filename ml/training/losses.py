"""
Multi-task loss for ViralTransformer training.

Four task losses combined into a single weighted objective:

  L_total = w_viral * L_viral
          + w_days  * L_days  * mask_viral
          + w_peak  * L_peak
          + w_clip  * L_clip

Where mask_viral = 1 for samples labeled viral=1 (days_to_viral is only
meaningful for samples that actually went viral).

Loss functions:
  - L_viral: BCEWithLogitsLoss with label smoothing and class-weight balancing
  - L_days:  SmoothL1Loss (Huber) — robust to long-tail day-count distribution
  - L_peak:  HuberLoss — robust regression for [0, 100] peak score
  - L_clip:  CrossEntropyLoss on clip segment logits (multiclass) or
             BCEWithLogitsLoss (multilabel)
"""

from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Label-smoothed BCE
# ---------------------------------------------------------------------------

class LabelSmoothBCELoss(nn.Module):
    """
    BCEWithLogitsLoss with label smoothing and optional positive class weight.

    Label smoothing replaces hard 0/1 targets with:
      y_smooth = y * (1 - eps) + eps / 2
    which prevents overconfident predictions.
    """

    def __init__(
        self,
        smoothing: float = 0.05,
        pos_weight: Optional[torch.Tensor] = None,
        reduction: str = "mean",
    ):
        super().__init__()
        self.smoothing = smoothing
        self.pos_weight = pos_weight
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        targets_smooth = targets * (1 - self.smoothing) + self.smoothing / 2
        loss = F.binary_cross_entropy_with_logits(
            logits,
            targets_smooth,
            pos_weight=self.pos_weight,
            reduction=self.reduction,
        )
        return loss


# ---------------------------------------------------------------------------
# Multi-task loss container
# ---------------------------------------------------------------------------

@dataclass
class MultiTaskLossWeights:
    viral: float = 1.0
    days: float = 0.5
    peak: float = 0.5
    clip: float = 0.25


@dataclass
class TaskLosses:
    viral: torch.Tensor
    days: torch.Tensor
    peak: torch.Tensor
    clip: torch.Tensor
    total: torch.Tensor


class ViralTransformerLoss(nn.Module):
    """
    Multi-task loss for ViralTransformer.

    Combines four task-specific losses with configurable weights.
    Supports class-rebalancing for the viral binary task (typical datasets
    have <10% viral samples, creating severe imbalance).

    Args:
        weights:          Per-task loss weights (MultiTaskLossWeights).
        viral_pos_weight: Scalar up-weight for positive viral class (e.g. 9.0
                          if 10% viral = 9:1 imbalance).
        label_smoothing:  Label smoothing epsilon for viral classification.
        days_beta:        Huber loss beta for days regression.
        peak_beta:        Huber loss beta for peak score regression.
        clip_mode:        "multiclass" | "multilabel" for clip segmentation.
    """

    def __init__(
        self,
        weights: Optional[MultiTaskLossWeights] = None,
        viral_pos_weight: float = 5.0,
        label_smoothing: float = 0.05,
        days_beta: float = 10.0,
        peak_beta: float = 5.0,
        clip_mode: str = "multiclass",
    ):
        super().__init__()
        self.weights = weights or MultiTaskLossWeights()
        self.clip_mode = clip_mode

        # Viral: label-smoothed BCE with positive class weighting
        pw = torch.tensor([viral_pos_weight])
        self.viral_loss_fn = LabelSmoothBCELoss(
            smoothing=label_smoothing,
            pos_weight=pw,
        )

        # Days to viral: Huber loss (masked to viral=1 samples)
        self.days_loss_fn = nn.HuberLoss(reduction="sum", delta=days_beta)

        # Peak score: Huber loss
        self.peak_loss_fn = nn.HuberLoss(reduction="mean", delta=peak_beta)

        # Clip segmentation
        if clip_mode == "multiclass":
            self.clip_loss_fn = nn.CrossEntropyLoss(ignore_index=-1, label_smoothing=0.1)
        else:
            self.clip_loss_fn = nn.BCEWithLogitsLoss()

    def forward(
        self,
        viral_logits: torch.Tensor,      # (B, 1)
        days_to_viral: torch.Tensor,     # (B, 1)
        peak_score: torch.Tensor,        # (B, 1)
        clip_logits: Optional[torch.Tensor],  # (B, T) or None

        viral_labels: torch.Tensor,      # (B, 1)
        days_labels: torch.Tensor,       # (B, 1)
        peak_labels: torch.Tensor,       # (B, 1)
        clip_targets: Optional[torch.Tensor] = None,  # (B,) or (B, T)
    ) -> TaskLosses:
        """
        Compute all task losses and the weighted total.

        The days loss is masked to only viral=1 samples (days_to_viral is
        undefined / uninformative for non-viral samples).
        """
        # ── Viral classification ──────────────────────────────────────────────
        l_viral = self.viral_loss_fn(viral_logits, viral_labels)

        # ── Days to viral (masked) ────────────────────────────────────────────
        viral_mask = (viral_labels.squeeze(-1) > 0.5)  # (B,)
        n_viral = viral_mask.sum().clamp(min=1)

        if viral_mask.any():
            pred_days = days_to_viral[viral_mask]
            true_days = days_labels[viral_mask]
            l_days = self.days_loss_fn(pred_days, true_days) / n_viral
        else:
            l_days = torch.tensor(0.0, device=viral_logits.device, requires_grad=True)

        # ── Peak score ────────────────────────────────────────────────────────
        l_peak = self.peak_loss_fn(peak_score, peak_labels)

        # ── Clip segmentation ─────────────────────────────────────────────────
        if clip_logits is not None and clip_targets is not None:
            if self.clip_mode == "multiclass":
                # targets: (B,) — index of best clip segment
                target_idx = clip_targets.argmax(dim=-1).long()  # (B,)
                l_clip = self.clip_loss_fn(clip_logits, target_idx)
            else:
                l_clip = self.clip_loss_fn(clip_logits, clip_targets.float())
        else:
            l_clip = torch.tensor(0.0, device=viral_logits.device)

        # ── Weighted total ────────────────────────────────────────────────────
        w = self.weights
        total = (
            w.viral * l_viral
            + w.days * l_days
            + w.peak * l_peak
            + w.clip * l_clip
        )

        return TaskLosses(
            viral=l_viral,
            days=l_days,
            peak=l_peak,
            clip=l_clip,
            total=total,
        )
