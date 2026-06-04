"""
Focal loss for handling extreme class imbalance (viral rate ~8%).
Also includes class-balanced sampling utilities.
"""

from typing import Optional

import numpy as np
import torch
import torch.nn as nn
from torch import Tensor
from torch.utils.data import WeightedRandomSampler


class FocalLoss(nn.Module):
    """
    Focal loss: FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)
    Uses numerically stable sigmoid + manual log formulation.
    Handles binary (logits) targets.
    """

    def __init__(
        self,
        alpha: float = 0.25,
        gamma: float = 2.0,
        reduction: str = "mean",
    ) -> None:
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction

    def forward(self, logits: Tensor, targets: Tensor) -> Tensor:
        """
        Args:
            logits:  (B,) or (B, 1) raw logits
            targets: (B,) or (B, 1) binary labels in {0, 1}
        Returns:
            scalar loss (or unreduced tensor)
        """
        logits = logits.view(-1)
        targets = targets.view(-1).float()

        # numerically stable: p = sigmoid(logit), log_p via log-sum-exp trick
        p = torch.sigmoid(logits)
        log_p = -torch.nn.functional.softplus(-logits)          # log(sigmoid(x))
        log_1mp = -torch.nn.functional.softplus(logits)         # log(1 - sigmoid(x))

        # per-sample alpha_t and p_t
        alpha_t = targets * self.alpha + (1 - targets) * (1 - self.alpha)
        p_t = targets * p + (1 - targets) * (1 - p)
        log_pt = targets * log_p + (1 - targets) * log_1mp

        loss = -alpha_t * (1 - p_t).pow(self.gamma) * log_pt

        if self.reduction == "mean":
            return loss.mean()
        elif self.reduction == "sum":
            return loss.sum()
        return loss


class AsymmetricFocalLoss(nn.Module):
    """
    Asymmetric Focal Loss (ASL): separate gamma for pos/neg.
    Better for extreme imbalance — down-weights easy negatives more aggressively.
    Reference: Ridnik et al., ICCV 2021.
    """

    def __init__(
        self,
        gamma_pos: float = 0.0,
        gamma_neg: float = 4.0,
        clip: float = 0.05,
        reduction: str = "mean",
    ) -> None:
        super().__init__()
        self.gamma_pos = gamma_pos
        self.gamma_neg = gamma_neg
        self.clip = clip          # shift negative probabilities to avoid near-zero logs
        self.reduction = reduction

    def forward(self, logits: Tensor, targets: Tensor) -> Tensor:
        """
        Args:
            logits:  (B,) raw logits
            targets: (B,) binary labels
        """
        logits = logits.view(-1)
        targets = targets.view(-1).float()

        p = torch.sigmoid(logits)

        # shift: clip negatives away from zero
        p_m = (p + self.clip).clamp(max=1.0)

        # compute cross-entropy loss for each class
        loss_pos = targets * torch.log(p.clamp(min=1e-8))
        loss_neg = (1 - targets) * torch.log((1 - p_m).clamp(min=1e-8))

        # asymmetric focusing
        p_t_pos = p
        p_t_neg = 1 - p_m
        loss_pos = loss_pos * (1 - p_t_pos).pow(self.gamma_pos)
        loss_neg = loss_neg * p_t_neg.pow(self.gamma_neg)

        loss = -(loss_pos + loss_neg)

        if self.reduction == "mean":
            return loss.mean()
        elif self.reduction == "sum":
            return loss.sum()
        return loss


class MultiTaskFocalLoss(nn.Module):
    """
    Multi-task loss: FocalLoss for viral classification + SmoothL1 for regressions.
    Task weights learned via uncertainty weighting (Kendall et al., NeurIPS 2018).
    """

    def __init__(
        self,
        focal_alpha: float = 0.25,
        focal_gamma: float = 2.0,
    ) -> None:
        super().__init__()
        self.focal = FocalLoss(alpha=focal_alpha, gamma=focal_gamma)
        self.smooth_l1 = nn.SmoothL1Loss()
        # log(sigma^2) — learnable uncertainty weights per task
        self.log_var_viral = nn.Parameter(torch.zeros(1))
        self.log_var_days = nn.Parameter(torch.zeros(1))
        self.log_var_peak = nn.Parameter(torch.zeros(1))

    def forward(
        self,
        preds: dict,   # {"viral_logit": Tensor, "days": Tensor, "peak": Tensor}
        targets: dict, # {"viral": Tensor, "days": Tensor, "peak": Tensor, "viral_mask": Tensor}
    ) -> dict:
        """
        Returns dict with "total", "viral", "days", "peak" losses.
        Uncertainty weighting: L_total = sum_i L_i / (2*sigma_i^2) + log(sigma_i^2)
        """
        loss_viral = self.focal(preds["viral_logit"], targets["viral"])

        # mask days loss to viral samples only
        viral_mask = targets.get("viral_mask", targets["viral"] > 0.5)
        if viral_mask.sum() > 0:
            loss_days = self.smooth_l1(
                preds["days"][viral_mask], targets["days"][viral_mask]
            )
        else:
            loss_days = torch.tensor(0.0, device=preds["days"].device)

        loss_peak = self.smooth_l1(preds["peak"], targets["peak"])

        # uncertainty weighting
        precision_viral = torch.exp(-self.log_var_viral)
        precision_days = torch.exp(-self.log_var_days)
        precision_peak = torch.exp(-self.log_var_peak)

        total = (
            precision_viral * loss_viral + self.log_var_viral
            + precision_days * loss_days + self.log_var_days
            + precision_peak * loss_peak + self.log_var_peak
        )

        return {
            "total": total.squeeze(),
            "viral": loss_viral.detach(),
            "days": loss_days.detach(),
            "peak": loss_peak.detach(),
        }


def compute_class_weights(labels: np.ndarray) -> Tensor:
    """Inverse-frequency class weights as a float tensor."""
    classes, counts = np.unique(labels, return_counts=True)
    weights = 1.0 / counts.astype(float)
    weights = weights / weights.sum()  # normalize
    return torch.tensor(weights, dtype=torch.float32)


class StratifiedWeightedSampler:
    """WeightedRandomSampler factory for imbalanced datasets."""

    def __init__(self, labels: np.ndarray, oversample_factor: float = 10.0) -> None:
        self.labels = labels
        self.oversample_factor = oversample_factor

    def get_sampler(self) -> WeightedRandomSampler:
        classes, counts = np.unique(self.labels, return_counts=True)
        class_weights = 1.0 / counts.astype(float)
        if len(classes) == 2:
            minority = classes[np.argmin(counts)]
            class_weights[classes == minority] *= self.oversample_factor

        sample_weights = np.array([
            class_weights[np.where(classes == l)[0][0]] for l in self.labels
        ])
        return WeightedRandomSampler(
            weights=torch.tensor(sample_weights, dtype=torch.float64),
            num_samples=len(self.labels),
            replacement=True,
        )
