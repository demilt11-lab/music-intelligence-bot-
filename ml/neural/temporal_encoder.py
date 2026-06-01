"""
Temporal Encoder

Processes a time-series of daily track metrics and produces a fixed-size
embedding that captures trajectory momentum, acceleration, and inflection points.

Input: (B, T, TEMPORAL_IN) — B tracks, T timesteps (default 90 days), 5 features
  - spotify_streams_norm   (log-normalised daily streams)
  - tiktok_growth          (7d rolling UGC growth rate)
  - playlist_adds          (log daily playlist additions)
  - radio_spins            (log daily spins)
  - viral_score            (daily composite viral score from talent scout)

Architecture:
  Bi-directional LSTM (captures both forward and backward patterns)
  → Attention-weighted pooling (model learns which time points matter most)
  → Output embedding (BRANCH_DIM)

Design choice: LSTM over Transformer for temporal data of this length because:
  - Sequences are short (≤ 90 days), favoring RNNs over attention-heavy Transformers
  - LSTM naturally models decay and momentum (ideal for trend tracking)
  - Bidirectional allows the model to spot both "rise then plateau" and "plateau then rise"
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

TEMPORAL_IN  = 5    # features per timestep (streams, tiktok, playlists, radio, viral_score)
LSTM_HIDDEN  = 32
LSTM_LAYERS  = 2
BRANCH_DIM   = 64   # must match network.py BRANCH_DIM


class TemporalEncoder(nn.Module):
    """
    Bi-LSTM with attention pooling over daily track metrics.

    Input:
      x         (B, T, TEMPORAL_IN)   — time-series of daily stats
      lengths   (B,) optional         — actual lengths if sequences are padded

    Output:
      embedding (B, BRANCH_DIM)
    """

    def __init__(
        self,
        input_dim:   int = TEMPORAL_IN,
        hidden_dim:  int = LSTM_HIDDEN,
        num_layers:  int = LSTM_LAYERS,
        out_dim:     int = BRANCH_DIM,
    ):
        super().__init__()

        self.input_norm = nn.LayerNorm(input_dim)

        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=0.1 if num_layers > 1 else 0.0,
        )
        lstm_out_dim = hidden_dim * 2   # bidirectional

        # Attention: scalar score for each timestep
        self.attn_query = nn.Linear(lstm_out_dim, 1, bias=False)

        # Project to branch dimension
        self.proj = nn.Sequential(
            nn.Linear(lstm_out_dim, out_dim),
            nn.LayerNorm(out_dim),
            nn.GELU(),
        )

        # Momentum features: explicit short/long-term delta features
        # These augment the LSTM output with explicit momentum signals
        self.momentum_net = nn.Sequential(
            nn.Linear(4, 16),   # 4 explicit delta features
            nn.GELU(),
            nn.Linear(16, out_dim),
        )

        self.fusion = nn.Sequential(
            nn.Linear(out_dim * 2, out_dim),
            nn.LayerNorm(out_dim),
            nn.GELU(),
        )

    def forward(
        self,
        x: torch.Tensor,
        lengths: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        B, T, _ = x.shape
        x = self.input_norm(x)

        # Bi-LSTM
        if lengths is not None:
            packed = nn.utils.rnn.pack_padded_sequence(
                x, lengths.cpu(), batch_first=True, enforce_sorted=False
            )
            out, _ = self.lstm(packed)
            out, _ = nn.utils.rnn.pad_packed_sequence(out, batch_first=True)
        else:
            out, _ = self.lstm(x)   # (B, T, hidden*2)

        # Attention pooling — timesteps closer to the trend inflection get higher weight
        attn_scores = self.attn_query(out).squeeze(-1)      # (B, T)

        # Mask padding positions if lengths provided
        if lengths is not None:
            mask = torch.arange(T, device=x.device).unsqueeze(0) >= lengths.unsqueeze(1)
            attn_scores = attn_scores.masked_fill(mask, -1e9)

        attn_weights = F.softmax(attn_scores, dim=-1).unsqueeze(-1)  # (B, T, 1)
        context      = (out * attn_weights).sum(dim=1)               # (B, hidden*2)

        lstm_embed = self.proj(context)   # (B, BRANCH_DIM)

        # Explicit momentum features: last-7d vs last-30d delta for each channel
        # x[:, -7:, :].mean vs x[:, -30:, :].mean for streams + tiktok
        if T >= 7:
            last_7  = x[:, -7:,  :2].mean(dim=1)   # streams + tiktok
            last_30 = x[:, max(0, T-30):, :2].mean(dim=1)
            momentum = torch.cat([last_7, last_30], dim=-1)   # (B, 4)
        else:
            momentum = torch.zeros(B, 4, device=x.device)

        momentum_embed = self.momentum_net(momentum)   # (B, BRANCH_DIM)

        # Fuse LSTM embedding with explicit momentum
        fused = self.fusion(torch.cat([lstm_embed, momentum_embed], dim=-1))
        return fused   # (B, BRANCH_DIM)


def build_sequence_tensor(
    daily_stats_list: list,
    max_len: int = 90,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Converts a list of daily stat sequences to a padded tensor.

    daily_stats_list: list of lists of dicts, one per track.
      Each dict has keys: streams, tiktok_growth, playlist_adds, radio_spins, viral_score

    Returns:
      x       (B, max_len, TEMPORAL_IN)
      lengths (B,)
    """
    import numpy as np

    batch = []
    lengths = []

    for seq in daily_stats_list:
        # Take last max_len entries
        seq = seq[-max_len:] if len(seq) > max_len else seq
        T = len(seq)
        arr = np.zeros((max_len, TEMPORAL_IN), dtype=np.float32)

        for i, day in enumerate(seq):
            arr[max_len - T + i] = [
                float(day.get("streams", 0) or 0),
                float(day.get("tiktok_growth", 0) or 0),
                float(day.get("playlist_adds", 0) or 0),
                float(day.get("radio_spins", 0) or 0),
                float(day.get("viral_score", 0) or 0),
            ]

        batch.append(arr)
        lengths.append(T)

    x = torch.tensor(np.stack(batch), dtype=torch.float32)
    L = torch.tensor(lengths, dtype=torch.long)
    return x, L
