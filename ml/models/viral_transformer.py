"""
ViralTransformer — top-level multi-modal model for music + TikTok virality prediction.

Architecture:
  ┌──────────────────────────────────────────────────────────────────┐
  │  Input Modalities                                                │
  │  ─────────────────────────────────────────────────────────────  │
  │  Audio features   → AudioEncoder    → (B, 128)                  │
  │  Time-series      → TimeSeriesEnc.  → (B, 128)                  │
  │  Text tokens      → TextEncoder     → (B, 128)                  │
  │  Metadata         → MetadataEnc.    → (B, 128)                  │
  ├──────────────────────────────────────────────────────────────────┤
  │  Fusion                                                          │
  │  ─────────────────────────────────────────────────────────────  │
  │  CrossModalFusion  (all-pairs cross-attention)                   │
  │  GatedFusion       (learned modality weighting)  → (B, 128)     │
  ├──────────────────────────────────────────────────────────────────┤
  │  Output Heads                                                    │
  │  ─────────────────────────────────────────────────────────────  │
  │  ViralClassificationHead   → (B, 1)  logit                       │
  │  DaysToViralHead           → (B, 1)  days                        │
  │  PeakScoreHead             → (B, 1)  score ∈ [0, 100]            │
  │  ClipRecommendationHead    → (B, T)  per-frame logits            │
  └──────────────────────────────────────────────────────────────────┘

Forward returns a ViralTransformerOutput dataclass containing:
  - viral_logits, viral_prob
  - days_to_viral
  - peak_score
  - clip_logits
  - gate_weights (modality importance for interpretability)
  - cross_attn_weights (all cross-modal attention maps)
"""

from dataclasses import dataclass, field
from typing import Dict, Optional

import torch
import torch.nn as nn

from .encoders import AudioEncoder, MetadataEncoder, TextEncoder, TimeSeriesEncoder
from .fusion import CrossModalFusion, GatedFusion
from .heads import (
    ClipRecommendationHead,
    DaysToViralHead,
    PeakScoreHead,
    ViralClassificationHead,
)


# ---------------------------------------------------------------------------
# Output dataclass
# ---------------------------------------------------------------------------

@dataclass
class ViralTransformerOutput:
    """All outputs from a single ViralTransformer forward pass."""

    # Task predictions
    viral_logits: torch.Tensor            # (B, 1) — raw logit for BCE loss
    viral_prob: torch.Tensor              # (B, 1) — sigmoid(viral_logits)
    days_to_viral: torch.Tensor           # (B, 1) — predicted days (positive)
    peak_score: torch.Tensor              # (B, 1) — [0, 100]
    clip_logits: Optional[torch.Tensor]   # (B, T) — per-frame logits or None

    # Interpretability
    gate_weights: torch.Tensor            # (B, 4) — modality importance weights
    cross_attn_weights: Dict[str, torch.Tensor] = field(default_factory=dict)
    # keys: "{query_mod}_from_{kv_mod}" → (B, 1)

    # Fused embedding (useful for downstream tasks / fine-tuning)
    fused_embedding: Optional[torch.Tensor] = None  # (B, d_model)


# ---------------------------------------------------------------------------
# ViralTransformer
# ---------------------------------------------------------------------------

class ViralTransformer(nn.Module):
    """
    Multi-modal transformer for predicting music + TikTok virality.

    Args:
        d_model:               Shared embedding dimension across all encoders/fusion.
        audio_input_dim:       Raw audio feature dimension.
        audio_seq_len:         Max audio frame sequence length.
        ts_num_features:       Number of timeseries channels.
        ts_max_steps:          Max timeseries history length (days).
        text_vocab_size:       Text encoder vocabulary size.
        text_max_seq_len:      Max text sequence length.
        num_artists:           Artist embedding table size.
        num_genres:            Genre embedding table size.
        num_date_features:     Cyclic date feature dimension.
        num_continuous_meta:   Continuous metadata feature dimension.
        num_heads:             Attention heads (used in all sub-modules).
        audio_enc_layers:      Audio transformer layers.
        ts_enc_layers:         Timeseries transformer layers.
        text_enc_layers:       Text transformer layers.
        dropout:               Global dropout rate.
        clip_mode:             "multiclass" | "multilabel" for clip head.
    """

    def __init__(
        self,
        d_model: int = 128,
        audio_input_dim: int = 128,
        audio_seq_len: int = 512,
        ts_num_features: int = 8,
        ts_max_steps: int = 365,
        text_vocab_size: int = 30522,
        text_max_seq_len: int = 512,
        num_artists: int = 100_000,
        num_genres: int = 512,
        num_date_features: int = 5,
        num_continuous_meta: int = 8,
        num_heads: int = 8,
        audio_enc_layers: int = 4,
        ts_enc_layers: int = 4,
        text_enc_layers: int = 6,
        dropout: float = 0.1,
        clip_mode: str = "multiclass",
    ):
        super().__init__()

        # ── Encoders ──────────────────────────────────────────────────────────
        self.audio_encoder = AudioEncoder(
            input_dim=audio_input_dim,
            d_model=d_model,
            num_heads=num_heads,
            num_layers=audio_enc_layers,
            dropout=dropout,
            max_seq_len=audio_seq_len,
        )
        self.ts_encoder = TimeSeriesEncoder(
            num_features=ts_num_features,
            d_model=d_model,
            num_heads=num_heads,
            num_layers=ts_enc_layers,
            dropout=dropout,
            max_steps=ts_max_steps,
        )
        self.text_encoder = TextEncoder(
            vocab_size=text_vocab_size,
            d_model=d_model,
            num_heads=num_heads,
            num_layers=text_enc_layers,
            max_seq_len=text_max_seq_len,
            dropout=dropout,
        )
        self.meta_encoder = MetadataEncoder(
            num_artists=num_artists,
            num_genres=num_genres,
            num_date_features=num_date_features,
            num_continuous=num_continuous_meta,
            d_model=d_model,
            dropout=dropout,
        )

        # ── Fusion ────────────────────────────────────────────────────────────
        self.cross_fusion = CrossModalFusion(d_model, num_heads, dropout)
        self.gated_fusion = GatedFusion(d_model, num_modalities=4, dropout=dropout)

        # ── Output heads ──────────────────────────────────────────────────────
        self.viral_head = ViralClassificationHead(d_model, dropout)
        self.days_head = DaysToViralHead(d_model, dropout=dropout)
        self.peak_head = PeakScoreHead(d_model, dropout)
        self.clip_head = ClipRecommendationHead(d_model, dropout, mode=clip_mode)

        # Store d_model for downstream access
        self.d_model = d_model

        self._init_weights()

    def _init_weights(self):
        """Initialize linear layers with truncated normal; biases to zero."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.trunc_normal_(module.weight, std=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def encode_all(
        self,
        audio_features: torch.Tensor,
        timeseries: torch.Tensor,
        input_ids: torch.Tensor,
        artist_ids: torch.Tensor,
        genre_ids: torch.Tensor,
        date_features: torch.Tensor,
        continuous_meta: torch.Tensor,
        audio_mask: Optional[torch.Tensor] = None,
        ts_mask: Optional[torch.Tensor] = None,
        text_attention_mask: Optional[torch.Tensor] = None,
    ) -> Dict[str, torch.Tensor]:
        """Run all four encoders and return a dict of (B, d_model) embeddings."""
        audio_emb = self.audio_encoder(audio_features, src_key_padding_mask=audio_mask)
        ts_emb = self.ts_encoder(timeseries, src_key_padding_mask=ts_mask)
        text_emb = self.text_encoder(input_ids, attention_mask=text_attention_mask)
        meta_emb = self.meta_encoder(artist_ids, genre_ids, date_features, continuous_meta)
        return {
            "audio": audio_emb,
            "timeseries": ts_emb,
            "text": text_emb,
            "meta": meta_emb,
        }

    def forward(
        self,
        # Audio modality
        audio_features: torch.Tensor,           # (B, T_audio, audio_input_dim)
        audio_mask: Optional[torch.Tensor],      # (B, T_audio) bool, True=pad

        # Time-series modality
        timeseries: torch.Tensor,                # (B, T_ts, ts_num_features)
        ts_mask: Optional[torch.Tensor],         # (B, T_ts) bool, True=pad

        # Text modality
        input_ids: torch.Tensor,                 # (B, T_text)
        text_attention_mask: Optional[torch.Tensor],  # (B, T_text) 1=attend

        # Metadata modality
        artist_ids: torch.Tensor,               # (B,)
        genre_ids: torch.Tensor,                # (B,)
        date_features: torch.Tensor,            # (B, num_date_features)
        continuous_meta: torch.Tensor,          # (B, num_continuous_meta)

        # Whether to run clip recommendation head (needs audio sequence, not pooled)
        return_clip_logits: bool = True,
    ) -> ViralTransformerOutput:
        """
        Full forward pass through all encoders, fusion, and output heads.

        Returns a ViralTransformerOutput with all task predictions and
        interpretability tensors (gate weights, cross-attention maps).
        """
        # ── 1. Encode ─────────────────────────────────────────────────────────
        audio_emb = self.audio_encoder(audio_features, src_key_padding_mask=audio_mask)
        ts_emb = self.ts_encoder(timeseries, src_key_padding_mask=ts_mask)
        text_emb = self.text_encoder(input_ids, attention_mask=text_attention_mask)
        meta_emb = self.meta_encoder(artist_ids, genre_ids, date_features, continuous_meta)

        # ── 2. Cross-modal fusion ─────────────────────────────────────────────
        fused_mods, cross_attn_weights = self.cross_fusion(
            audio_emb, ts_emb, text_emb, meta_emb
        )

        # ── 3. Gated fusion → single vector ───────────────────────────────────
        fused, gate_weights = self.gated_fusion(fused_mods)

        # ── 4. Output heads ───────────────────────────────────────────────────
        viral_logits = self.viral_head(fused)
        days_to_viral = self.days_head(fused)
        peak_score = self.peak_head(fused)

        clip_logits: Optional[torch.Tensor] = None
        if return_clip_logits:
            # Re-run audio encoder to get the un-pooled sequence
            # We need raw sequence output; AudioEncoder only exposes pooled output.
            # Here we tap into internal transformer output by re-running with a hook.
            clip_logits = self._compute_clip_logits(audio_features, audio_mask)

        return ViralTransformerOutput(
            viral_logits=viral_logits,
            viral_prob=torch.sigmoid(viral_logits),
            days_to_viral=days_to_viral,
            peak_score=peak_score,
            clip_logits=clip_logits,
            gate_weights=gate_weights,
            cross_attn_weights=cross_attn_weights,
            fused_embedding=fused,
        )

    def _compute_clip_logits(
        self,
        audio_features: torch.Tensor,
        audio_mask: Optional[torch.Tensor],
    ) -> torch.Tensor:
        """
        Compute clip recommendation logits by running the audio encoder in
        sequence mode (bypassing the mean-pooling step).
        """
        x = self.audio_encoder.input_proj(audio_features)
        x = self.audio_encoder.pos_enc(x)
        x = self.audio_encoder.transformer(x, src_key_padding_mask=audio_mask)
        x = self.audio_encoder.norm(x)  # (B, T, d_model)
        return self.clip_head(x, src_key_padding_mask=audio_mask)

    def count_parameters(self) -> Dict[str, int]:
        """Returns parameter counts by sub-module."""
        counts = {}
        for name, module in [
            ("audio_encoder", self.audio_encoder),
            ("ts_encoder", self.ts_encoder),
            ("text_encoder", self.text_encoder),
            ("meta_encoder", self.meta_encoder),
            ("cross_fusion", self.cross_fusion),
            ("gated_fusion", self.gated_fusion),
            ("viral_head", self.viral_head),
            ("days_head", self.days_head),
            ("peak_head", self.peak_head),
            ("clip_head", self.clip_head),
        ]:
            counts[name] = sum(p.numel() for p in module.parameters() if p.requires_grad)
        counts["total"] = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return counts
