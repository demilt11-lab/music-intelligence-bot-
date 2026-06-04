"""LSTM/GRU encoder for temporal engagement sequence modeling."""

from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence


@dataclass
class LSTMConfig:
    input_dim: int = 8          # per-timestep feature count
    hidden_dim: int = 256
    num_layers: int = 3
    dropout: float = 0.3
    bidirectional: bool = True
    cell_type: str = "lstm"     # "lstm" | "gru"
    use_attention: bool = True
    output_dim: int = 128


@dataclass
class LSTMOutput:
    embedding: Tensor       # (B, output_dim)
    viral_prob: Tensor      # (B, 1)
    days_to_viral: Tensor   # (B, 1)
    peak_score: Tensor      # (B, 1)
    clip_logits: Tensor     # (B, 1)
    hidden: Tensor          # (B, H) — last hidden state
    attn_weights: Tensor    # (B, T)


class TemporalAttention(nn.Module):
    """Scaled dot-product self-attention over LSTM hidden states with a learned query."""

    def __init__(self, hidden_dim: int) -> None:
        super().__init__()
        self.query = nn.Parameter(torch.randn(hidden_dim))  # learned query vector
        self.scale = hidden_dim ** -0.5

    def forward(self, x: Tensor) -> tuple[Tensor, Tensor]:
        """
        Args:
            x: (B, T, H) LSTM output hidden states
        Returns:
            context: (B, H), attn_weights: (B, T)
        """
        # (B, T) scores via dot product with learned query
        scores = torch.matmul(x, self.query) * self.scale  # (B, T)
        weights = torch.softmax(scores, dim=-1)             # (B, T)
        context = torch.bmm(weights.unsqueeze(1), x).squeeze(1)  # (B, H)
        return context, weights


class LSTMViralModel(nn.Module):
    """Bidirectional LSTM/GRU with temporal attention for viral prediction."""

    def __init__(self, cfg: LSTMConfig) -> None:
        super().__init__()
        self.cfg = cfg
        rnn_cls = nn.LSTM if cfg.cell_type == "lstm" else nn.GRU
        self.rnn = rnn_cls(
            input_size=cfg.input_dim,
            hidden_size=cfg.hidden_dim,
            num_layers=cfg.num_layers,
            dropout=cfg.dropout if cfg.num_layers > 1 else 0.0,
            bidirectional=cfg.bidirectional,
            batch_first=True,
        )
        # actual output dim of RNN (doubles when bidirectional)
        rnn_out_dim = cfg.hidden_dim * (2 if cfg.bidirectional else 1)

        self.attention = TemporalAttention(rnn_out_dim) if cfg.use_attention else None
        self.proj = nn.Sequential(
            nn.LayerNorm(rnn_out_dim),
            nn.Linear(rnn_out_dim, cfg.output_dim),
            nn.GELU(),
        )

        # multi-task heads
        self.head_viral = nn.Linear(cfg.output_dim, 1)
        self.head_days = nn.Linear(cfg.output_dim, 1)
        self.head_peak = nn.Linear(cfg.output_dim, 1)
        self.head_clip = nn.Linear(cfg.output_dim, 1)

    def forward(self, x: Tensor, lengths: Optional[Tensor] = None) -> LSTMOutput:
        """
        Args:
            x:       (B, T, input_dim) padded sequences
            lengths: (B,) actual sequence lengths (optional)
        Returns:
            LSTMOutput with all task predictions
        """
        # (B, T, input_dim)
        if lengths is not None:
            packed = pack_padded_sequence(
                x, lengths.cpu(), batch_first=True, enforce_sorted=False
            )
            rnn_out, hidden_state = self.rnn(packed)
            out, _ = pad_packed_sequence(rnn_out, batch_first=True)  # (B, T, H)
        else:
            out, hidden_state = self.rnn(x)  # (B, T, H)

        if self.attention is not None:
            context, attn_weights = self.attention(out)  # (B, H), (B, T)
        else:
            context = out[:, -1, :]  # last timestep
            attn_weights = torch.zeros(x.size(0), x.size(1), device=x.device)

        emb = self.proj(context)  # (B, output_dim)

        # extract last hidden for passthrough
        if isinstance(hidden_state, tuple):
            h = hidden_state[0]  # LSTM: (num_layers * dirs, B, H)
        else:
            h = hidden_state     # GRU
        # take top layer, concat dirs
        dirs = 2 if self.cfg.bidirectional else 1
        h_last = h[-dirs:].permute(1, 0, 2).reshape(x.size(0), -1)  # (B, H*dirs)

        viral_logit = self.head_viral(emb)                      # (B, 1)
        days = torch.nn.functional.softplus(self.head_days(emb)) * 36.5  # positive
        peak = torch.sigmoid(self.head_peak(emb)) * 100.0       # [0, 100]
        clip = self.head_clip(emb)                               # (B, 1)

        return LSTMOutput(
            embedding=emb,
            viral_prob=torch.sigmoid(viral_logit),
            days_to_viral=days,
            peak_score=peak,
            clip_logits=clip,
            hidden=h_last,
            attn_weights=attn_weights,
        )
