"""
MusicIntelligenceNet — Multi-task neural network

Architecture:
  Four specialised input branches → cross-branch attention fusion → shared trunk
  → four task heads simultaneously predicting:
    - viral_30d        (binary: will go viral within 30 days)
    - popular_30d      (binary: will sustain mainstream popularity)
    - trend_class      (4-class: NONE / TRENDING / POPULAR / VIRAL)
    - trajectory_class (4-class: DECLINING / STABLE / GROWING / ABOUT_TO_BREAK)

Branches:
  audio_branch    — sound DNA (BPM, key, mode, energy, danceability, valence, loudness)
  streaming_branch— Spotify signals (streams, velocity, playlist adds, editorial count)
  ugc_branch      — TikTok/social signals (video count, growth rates, geo spread)
  radio_branch    — Radio/chart signals (spins, market count, chart rank/velocity)

Cross-branch attention fuses the four branch embeddings so each branch can
condition on all others before the shared trunk makes final predictions.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Dimension constants ───────────────────────────────────────────────────────

AUDIO_IN    = 8    # bpm, energy, danceability, valence, loudness, mode, key_sin, key_cos
STREAMING_IN= 9    # log_streams, popularity, velocity_7d, velocity_30d,
                   # log_playlist, log_editorial, log_adds_7d, stream_accel, log_adds_30d
UGC_IN      = 8    # log_videos, growth_7d, growth_30d, accel, log_avg_views,
                   # log_avg_likes, geo_diversity, log_yt_shorts
RADIO_IN    = 6    # log_spins_7d, spin_vel, log_markets, chart_rank_inv, chart_days, chart_vel

BRANCH_DIM  = 64   # embedding size per branch
TRUNK_DIM   = 128
NUM_ATTN_HEADS = 4

VIRAL_CLASSES   = 2    # [not_viral, viral]
POPULAR_CLASSES = 2    # [not_popular, popular]
TREND_CLASSES   = 4    # NONE / TRENDING / POPULAR / VIRAL
TRAJ_CLASSES    = 4    # DECLINING / STABLE / GROWING / ABOUT_TO_BREAK


# ── Helpers ───────────────────────────────────────────────────────────────────

class _Branch(nn.Module):
    """Small fully-connected branch that maps raw features → branch embedding."""

    def __init__(self, in_dim: int, hidden: int = 32, out_dim: int = BRANCH_DIM):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.LayerNorm(hidden),
            nn.GELU(),
            nn.Dropout(0.05),
            nn.Linear(hidden, out_dim),
            nn.LayerNorm(out_dim),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _TaskHead(nn.Module):
    """Single-task classification head with dropout regularisation."""

    def __init__(self, in_dim: int, num_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Dropout(0.1),
            nn.Linear(in_dim, in_dim // 2),
            nn.GELU(),
            nn.Linear(in_dim // 2, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ── Main network ──────────────────────────────────────────────────────────────

class MusicIntelligenceNet(nn.Module):
    """
    Multi-task neural network for music trend prediction.

    Inputs (all optional — zero-padded when absent):
      audio_feats     (B, AUDIO_IN)
      streaming_feats (B, STREAMING_IN)
      ugc_feats       (B, UGC_IN)
      radio_feats     (B, RADIO_IN)
      sequence_embed  (B, BRANCH_DIM)   — optional, from TemporalEncoder

    Outputs dict:
      viral_logits     (B, 2)
      popular_logits   (B, 2)
      trend_logits     (B, 4)
      traj_logits      (B, 4)
      embeddings       (B, TRUNK_DIM)   — shared representation for contrastive use
    """

    def __init__(self, seq_embed_dim: int = BRANCH_DIM):
        super().__init__()

        self.audio_branch     = _Branch(AUDIO_IN,     hidden=32, out_dim=BRANCH_DIM)
        self.streaming_branch = _Branch(STREAMING_IN, hidden=32, out_dim=BRANCH_DIM)
        self.ugc_branch       = _Branch(UGC_IN,       hidden=32, out_dim=BRANCH_DIM)
        self.radio_branch     = _Branch(RADIO_IN,     hidden=32, out_dim=BRANCH_DIM)

        # Sequence branch projection (aligns temporal encoder output dimension)
        self.seq_proj = nn.Linear(seq_embed_dim, BRANCH_DIM)

        # Cross-branch multi-head attention
        # Treats each branch embedding as one "token" → 5 tokens (4 static + 1 temporal)
        self.cross_attn = nn.MultiheadAttention(
            embed_dim=BRANCH_DIM,
            num_heads=NUM_ATTN_HEADS,
            dropout=0.05,
            batch_first=True,
        )
        self.attn_norm = nn.LayerNorm(BRANCH_DIM)

        # Shared trunk (fused representation → task heads)
        self.trunk = nn.Sequential(
            nn.Linear(BRANCH_DIM * 5, TRUNK_DIM),
            nn.LayerNorm(TRUNK_DIM),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(TRUNK_DIM, TRUNK_DIM),
            nn.LayerNorm(TRUNK_DIM),
            nn.GELU(),
        )

        self.viral_head   = _TaskHead(TRUNK_DIM, VIRAL_CLASSES)
        self.popular_head = _TaskHead(TRUNK_DIM, POPULAR_CLASSES)
        self.trend_head   = _TaskHead(TRUNK_DIM, TREND_CLASSES)
        self.traj_head    = _TaskHead(TRUNK_DIM, TRAJ_CLASSES)

        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(
        self,
        audio_feats:     Optional[torch.Tensor] = None,
        streaming_feats: Optional[torch.Tensor] = None,
        ugc_feats:       Optional[torch.Tensor] = None,
        radio_feats:     Optional[torch.Tensor] = None,
        sequence_embed:  Optional[torch.Tensor] = None,
    ) -> Dict[str, torch.Tensor]:

        B = self._batch_size(audio_feats, streaming_feats, ugc_feats, radio_feats)

        # Encode each branch (zero-pad if input is missing)
        a = self.audio_branch(self._ensure(audio_feats,     B, AUDIO_IN))
        s = self.streaming_branch(self._ensure(streaming_feats, B, STREAMING_IN))
        u = self.ugc_branch(self._ensure(ugc_feats,         B, UGC_IN))
        r = self.radio_branch(self._ensure(radio_feats,     B, RADIO_IN))

        if sequence_embed is not None:
            t = self.seq_proj(sequence_embed)
        else:
            t = torch.zeros(B, BRANCH_DIM, device=a.device)

        # Stack into token sequence: (B, 5, BRANCH_DIM)
        tokens = torch.stack([a, s, u, r, t], dim=1)

        # Cross-branch attention: each branch learns from all others
        attended, _ = self.cross_attn(tokens, tokens, tokens)
        tokens = self.attn_norm(tokens + attended)          # residual + norm

        # Flatten all branch outputs → trunk
        fused = tokens.reshape(B, BRANCH_DIM * 5)
        emb   = self.trunk(fused)

        return {
            "viral_logits":   self.viral_head(emb),
            "popular_logits": self.popular_head(emb),
            "trend_logits":   self.trend_head(emb),
            "traj_logits":    self.traj_head(emb),
            "embeddings":     emb,
        }

    @staticmethod
    def _batch_size(*tensors) -> int:
        for t in tensors:
            if t is not None:
                return t.shape[0]
        return 1

    @staticmethod
    def _ensure(
        t: Optional[torch.Tensor], B: int, dim: int
    ) -> torch.Tensor:
        if t is not None:
            return t
        return torch.zeros(B, dim)


# ── Multi-task loss ───────────────────────────────────────────────────────────

TASK_WEIGHTS = {
    "viral":    1.5,    # highest priority — catching viral tracks early
    "popular":  1.0,
    "trend":    1.2,
    "traj":     0.8,
}


def compute_loss(
    outputs: Dict[str, torch.Tensor],
    targets: Dict[str, Optional[torch.Tensor]],
    class_weights: Optional[Dict[str, torch.Tensor]] = None,
) -> Tuple[torch.Tensor, Dict[str, float]]:
    """
    Computes weighted multi-task cross-entropy loss.

    targets keys: viral, popular, trend, traj (each LongTensor of shape B)
    Missing targets are skipped (mask = label != -1).
    Returns (total_loss, {task: loss_value}).
    """
    total   = torch.tensor(0.0, requires_grad=True)
    per_task: Dict[str, float] = {}

    task_map = [
        ("viral",   "viral_logits",   "viral"),
        ("popular", "popular_logits", "popular"),
        ("trend",   "trend_logits",   "trend"),
        ("traj",    "traj_logits",    "traj"),
    ]

    for task, logit_key, target_key in task_map:
        y = targets.get(target_key)
        if y is None:
            continue

        # Mask out -1 (unknown label)
        mask = y != -1
        if mask.sum() == 0:
            continue

        logits = outputs[logit_key][mask]
        labels = y[mask]

        weight = (class_weights or {}).get(task)
        loss = F.cross_entropy(logits, labels, weight=weight)
        weighted = TASK_WEIGHTS[task] * loss

        total = total + weighted
        per_task[task] = float(loss)

    return total, per_task
