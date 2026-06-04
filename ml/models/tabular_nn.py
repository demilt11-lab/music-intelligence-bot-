"""Deep tabular NN for audio features + engagement statistics."""

from dataclasses import dataclass, field
from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor


@dataclass
class TabularConfig:
    input_dim: int = 64
    hidden_dims: tuple = (512, 256, 128, 64)
    dropout: float = 0.3
    use_batch_norm: bool = True
    use_residual: bool = True
    activation: str = "gelu"


@dataclass
class TabularOutput:
    embedding: Tensor    # (B, last_hidden_dim)
    viral_prob: Tensor   # (B, 1)
    days_to_viral: Tensor
    peak_score: Tensor
    clip_logits: Tensor


def _get_activation(name: str) -> nn.Module:
    return {"gelu": nn.GELU(), "relu": nn.ReLU(), "silu": nn.SiLU()}.get(name, nn.GELU())


class ResidualBlock(nn.Module):
    """Two linear layers with BN + activation + dropout; skip connection."""

    def __init__(
        self,
        in_dim: int,
        out_dim: int,
        dropout: float = 0.3,
        use_batch_norm: bool = True,
        activation: str = "gelu",
    ) -> None:
        super().__init__()
        self.fc1 = nn.Linear(in_dim, out_dim)
        self.fc2 = nn.Linear(out_dim, out_dim)
        self.bn1 = nn.BatchNorm1d(out_dim) if use_batch_norm else nn.Identity()
        self.bn2 = nn.BatchNorm1d(out_dim) if use_batch_norm else nn.Identity()
        self.act = _get_activation(activation)
        self.drop = nn.Dropout(dropout)
        # project skip connection if dims differ
        self.skip = nn.Linear(in_dim, out_dim, bias=False) if in_dim != out_dim else nn.Identity()

    def forward(self, x: Tensor) -> Tensor:
        residual = self.skip(x)
        out = self.drop(self.act(self.bn1(self.fc1(x))))
        out = self.bn2(self.fc2(out))
        return self.act(out + residual)


class TabularNN(nn.Module):
    """Stack of ResidualBlocks for tabular feature processing."""

    def __init__(self, cfg: TabularConfig) -> None:
        super().__init__()
        dims = [cfg.input_dim] + list(cfg.hidden_dims)
        if cfg.use_residual:
            self.blocks: nn.Module = nn.Sequential(*[
                ResidualBlock(dims[i], dims[i + 1], cfg.dropout, cfg.use_batch_norm, cfg.activation)
                for i in range(len(dims) - 1)
            ])
        else:
            layers = []
            for i in range(len(dims) - 1):
                layers.append(nn.Linear(dims[i], dims[i + 1]))
                if cfg.use_batch_norm:
                    layers.append(nn.BatchNorm1d(dims[i + 1]))
                layers.append(_get_activation(cfg.activation))
                layers.append(nn.Dropout(cfg.dropout))
            self.blocks = nn.Sequential(*layers)

        out_dim = dims[-1]
        self.head_viral = nn.Linear(out_dim, 1)
        self.head_days = nn.Linear(out_dim, 1)
        self.head_peak = nn.Linear(out_dim, 1)
        self.head_clip = nn.Linear(out_dim, 1)

    def forward(self, x: Tensor) -> TabularOutput:
        """
        Args:
            x: (B, input_dim) tabular features
        Returns:
            TabularOutput with all task predictions
        """
        emb = self.blocks(x)  # (B, last_hidden_dim)

        viral_logit = self.head_viral(emb)
        days = torch.nn.functional.softplus(self.head_days(emb)) * 36.5
        peak = torch.sigmoid(self.head_peak(emb)) * 100.0
        clip = self.head_clip(emb)

        return TabularOutput(
            embedding=emb,
            viral_prob=torch.sigmoid(viral_logit),
            days_to_viral=days,
            peak_score=peak,
            clip_logits=clip,
        )
