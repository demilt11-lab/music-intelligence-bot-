"""
Multi-task output heads for ViralTransformer.

Four prediction tasks:
  1. ViralClassificationHead  — binary: will this go viral? (BCE loss)
  2. DaysToViralHead          — regression: how many days until viral? (Huber loss)
  3. PeakScoreHead            — regression: predicted peak popularity score (MSE loss)
  4. ClipRecommendationHead   — segmentation: which audio segment is clip-worthy?
                                  (cross-entropy over frame positions)
"""

from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


class ViralClassificationHead(nn.Module):
    """
    Binary classification: P(track/artist goes viral within `horizon` days).

    Output: scalar logit (apply sigmoid at inference; BCEWithLogitsLoss in training).
    """

    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, d_model // 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 4, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, d_model) — fused representation
        Returns:
            (batch, 1) — raw logit
        """
        return self.net(x)

    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """Returns probability in [0, 1]."""
        return torch.sigmoid(self.forward(x))


class DaysToViralHead(nn.Module):
    """
    Regression head predicting days until the entity goes viral.
    Outputs a positive scalar via softplus activation.

    Only meaningful when viral_prob > threshold; mask in loss accordingly.

    Loss: SmoothL1Loss (Huber) — robust to outliers in the day-count distribution.
    """

    def __init__(self, d_model: int, max_days: float = 365.0, dropout: float = 0.1):
        super().__init__()
        self.max_days = max_days
        self.net = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, d_model // 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 4, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Returns:
            (batch, 1) — predicted days (positive, capped at max_days)
        """
        raw = self.net(x)
        # Softplus ensures positivity; scale to [0, max_days]
        return F.softplus(raw) * (self.max_days / 10.0)


class PeakScoreHead(nn.Module):
    """
    Regression head predicting the entity's peak popularity score (0–100 scale).

    Uses sigmoid × 100 to constrain output to a valid range.
    Loss: MSELoss (or HuberLoss for robustness).
    """

    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, d_model // 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 4, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Returns:
            (batch, 1) — peak score in [0, 100]
        """
        return torch.sigmoid(self.net(x)) * 100.0


class ClipRecommendationHead(nn.Module):
    """
    Segmentation head: given the audio encoder's per-frame output sequence,
    predicts which frame positions are most clip-worthy (e.g. hook, drop, chorus).

    This is a sequence-level classification over audio frames, NOT over the
    pooled embedding — it operates on the raw AudioEncoder sequence output
    before pooling.

    Output: logits (batch, seq_len) — apply softmax for a probability
    distribution over frame positions, or sigmoid for independent frame scoring.

    Loss: CrossEntropyLoss with the target being the index of the most
    engaging segment (e.g. labeled from engagement data or music analysis).
    Alternatively, binary cross-entropy if multiple segments are labeled.
    """

    def __init__(
        self,
        d_model: int,
        dropout: float = 0.1,
        mode: str = "multiclass",  # "multiclass" | "multilabel"
    ):
        super().__init__()
        assert mode in ("multiclass", "multilabel")
        self.mode = mode

        self.frame_classifier = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, 1),
        )

    def forward(
        self,
        audio_sequence: torch.Tensor,
        src_key_padding_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Args:
            audio_sequence: (batch, seq_len, d_model) — per-frame encoder outputs
            src_key_padding_mask: (batch, seq_len) — True = padding frame

        Returns:
            logits: (batch, seq_len) — clip score per audio frame
        """
        logits = self.frame_classifier(audio_sequence).squeeze(-1)  # (B, T)

        # Mask out padding positions with large negative value
        if src_key_padding_mask is not None:
            logits = logits.masked_fill(src_key_padding_mask, float("-inf"))

        return logits

    def predict_segments(
        self,
        audio_sequence: torch.Tensor,
        src_key_padding_mask: Optional[torch.Tensor] = None,
        top_k: int = 3,
    ) -> torch.Tensor:
        """
        Returns indices of the top-k most clip-worthy frames per sample.

        Args:
            top_k: number of candidate clip positions to return

        Returns:
            (batch, top_k) — frame indices of recommended clip starts
        """
        logits = self.forward(audio_sequence, src_key_padding_mask)
        probs = torch.softmax(logits, dim=-1)
        _, indices = torch.topk(probs, k=min(top_k, probs.size(-1)), dim=-1)
        return indices
