"""
Cross-modal fusion layers for ViralTransformer.

Two-stage fusion:
  1. CrossModalFusion — pairwise cross-attention between all modality pairs,
     producing refined per-modality embeddings that are context-aware.
  2. GatedFusion — learned gating that weights modality contributions before
     producing the final fused representation.
"""

from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Multi-head cross-attention (one modality attending to another)
# ---------------------------------------------------------------------------

class CrossAttentionBlock(nn.Module):
    """
    Single cross-attention block: query from modality A, key/value from modality B.
    Produces a refined embedding for A that incorporates context from B.
    """

    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(
            embed_dim=d_model,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.norm_q = nn.LayerNorm(d_model)
        self.norm_kv = nn.LayerNorm(d_model)
        self.norm_out = nn.LayerNorm(d_model)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_model * 4),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 4, d_model),
            nn.Dropout(dropout),
        )
        self.dropout = nn.Dropout(dropout)

    def forward(
        self,
        query: torch.Tensor,   # (B, d_model)
        context: torch.Tensor, # (B, d_model)
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Returns:
            refined query embedding (B, d_model)
            attention weights (B, 1, 1) — averaged over heads, for visualization
        """
        # Unsqueeze to (B, 1, d_model) for MultiheadAttention sequence dimension
        q = self.norm_q(query).unsqueeze(1)
        kv = self.norm_kv(context).unsqueeze(1)

        attn_out, attn_weights = self.attn(q, kv, kv, need_weights=True)
        attn_out = attn_out.squeeze(1)

        # Residual + FFN
        x = query + self.dropout(attn_out)
        x = x + self.ffn(self.norm_out(x))
        return x, attn_weights.squeeze(1)  # (B, d_model), (B, 1)


# ---------------------------------------------------------------------------
# Full cross-modal fusion (all-pairs)
# ---------------------------------------------------------------------------

class CrossModalFusion(nn.Module):
    """
    Applies cross-attention for every ordered modality pair:
      audio  ← timeseries, audio  ← text, audio  ← meta
      ts     ← audio,      ts     ← text, ts     ← meta
      text   ← audio,      text   ← ts,   text   ← meta
      meta   ← audio,      meta   ← ts,   meta   ← text

    Each modality receives context from every other modality, producing
    refined representations that are semantically aligned.

    The fused modality embeddings are summed with the original to preserve
    input signal (residual style).
    """

    MODALITIES = ["audio", "timeseries", "text", "meta"]

    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        # One cross-attention block per ordered pair (A→B)
        self.cross_attn: nn.ModuleDict = nn.ModuleDict()
        for q_mod in self.MODALITIES:
            for kv_mod in self.MODALITIES:
                if q_mod != kv_mod:
                    key = f"{q_mod}_from_{kv_mod}"
                    self.cross_attn[key] = CrossAttentionBlock(d_model, num_heads, dropout)

    def forward(
        self,
        audio: torch.Tensor,       # (B, d_model)
        timeseries: torch.Tensor,  # (B, d_model)
        text: torch.Tensor,        # (B, d_model)
        meta: torch.Tensor,        # (B, d_model)
    ) -> Tuple[Dict[str, torch.Tensor], Dict[str, torch.Tensor]]:
        """
        Returns:
            fused: dict mapping modality name → refined (B, d_model) tensor
            attn_weights: dict mapping "{q}_from_{kv}" → (B, 1) attention weight
        """
        inputs = {"audio": audio, "timeseries": timeseries, "text": text, "meta": meta}
        fused: Dict[str, torch.Tensor] = {k: v.clone() for k, v in inputs.items()}
        attn_weights: Dict[str, torch.Tensor] = {}

        for q_mod in self.MODALITIES:
            accumulated = inputs[q_mod].clone()
            for kv_mod in self.MODALITIES:
                if q_mod == kv_mod:
                    continue
                key = f"{q_mod}_from_{kv_mod}"
                refined, w = self.cross_attn[key](accumulated, inputs[kv_mod])
                accumulated = refined
                attn_weights[key] = w
            fused[q_mod] = accumulated

        return fused, attn_weights


# ---------------------------------------------------------------------------
# Gated fusion — learned weighting of modality contributions
# ---------------------------------------------------------------------------

class GatedFusion(nn.Module):
    """
    Gated fusion over the four (post-cross-attention) modality embeddings.

    Produces a single fused vector via:
      1. Compute per-modality gate scalars via a shared linear layer
         (softmax across modalities → importance weights)
      2. Weighted sum of modality embeddings
      3. Optional residual MLP to refine the fused vector

    The gate weights are interpretable: they reveal which modality the model
    is relying on most for each prediction.
    """

    def __init__(
        self,
        d_model: int,
        num_modalities: int = 4,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.num_modalities = num_modalities

        # Gate network: concatenated embeddings → per-modality scalar weights
        self.gate_proj = nn.Sequential(
            nn.Linear(d_model * num_modalities, d_model),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model, num_modalities),
        )

        # Refinement MLP after gated fusion
        self.refine = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, d_model),
            nn.LayerNorm(d_model),
        )
        self.output_dim = d_model

    def forward(
        self,
        modality_embeddings: Dict[str, torch.Tensor],
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            modality_embeddings: dict with keys "audio","timeseries","text","meta",
                                 each (B, d_model)

        Returns:
            fused: (B, d_model) — final fused representation
            gate_weights: (B, 4) — softmax gate weights per modality (interpretable)
        """
        ordered_keys = ["audio", "timeseries", "text", "meta"]
        stacked = torch.stack(
            [modality_embeddings[k] for k in ordered_keys], dim=1
        )  # (B, 4, d_model)

        concat = stacked.view(stacked.size(0), -1)  # (B, 4*d_model)
        gate_logits = self.gate_proj(concat)         # (B, 4)
        gate_weights = F.softmax(gate_logits, dim=-1)  # (B, 4)

        # Weighted sum
        fused = (stacked * gate_weights.unsqueeze(-1)).sum(dim=1)  # (B, d_model)
        fused = self.refine(fused)
        return fused, gate_weights
