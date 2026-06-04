"""
Temporal Fusion Transformer (TFT) for viral trajectory forecasting.

TFT is specifically designed for multi-horizon time-series with:
  - Mixed static covariates (genre, country, entity_type)
  - Dynamic known covariates (time features: day-of-week, month)
  - Dynamic observed covariates (streaming signals — only known up to present)
  - Multi-horizon output (predict next 7, 14, 30, 90 days of viral score)

Reference: "Temporal Fusion Transformers for Interpretable Multi-horizon
Time Series Forecasting" (Lim et al., 2021)

Architecture:
  Static context → Variable Selection → Gating → LSTM encoder
  Dynamic inputs → Variable Selection → Gating → LSTM encoder
  [Static + Dynamic] → Multi-head attention → Gating → Dense → Output
"""
from dataclasses import dataclass, field
from typing import Optional
import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class TFTConfig:
    # Input dimensions
    n_static_features: int = 8        # static artist features (genre, country, etc.)
    n_dynamic_observed: int = 10      # observed time-varying signals (our 10 signals)
    n_dynamic_known: int = 4          # known future features (day-of-week sin/cos, month sin/cos)

    # Architecture
    hidden_dim: int = 128             # d_model throughout
    lstm_layers: int = 2
    attention_heads: int = 4
    dropout: float = 0.1

    # Sequence config
    encoder_steps: int = 90           # lookback window (90 days)
    decoder_steps: int = 30           # forecast horizon (30 days ahead)

    # Output
    output_quantiles: list = field(default_factory=lambda: [0.1, 0.5, 0.9])
    # 3 quantiles: low/median/high forecast — for uncertainty estimation


class GatedResidualNetwork(nn.Module):
    """Core TFT building block: dense + ELU + gate + skip connection."""

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        output_dim: int,
        dropout: float = 0.1,
        use_context: bool = False,
        context_dim: Optional[int] = None,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.use_context = use_context

        # First dense layer
        self.fc1 = nn.Linear(input_dim, hidden_dim)

        # Optional context projection (added before first dense activation)
        if use_context:
            ctx_dim = context_dim if context_dim is not None else hidden_dim
            self.context_proj = nn.Linear(ctx_dim, hidden_dim, bias=False)
        else:
            self.context_proj = None

        # Second dense layer
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.dropout = nn.Dropout(dropout)

        # GLU gate: produces 2 * output_dim, split into value + gate
        self.gate = nn.Linear(hidden_dim, output_dim * 2)

        # Skip connection projection (if dims differ)
        if input_dim != output_dim:
            self.skip_proj = nn.Linear(input_dim, output_dim, bias=False)
        else:
            self.skip_proj = None

        self.layer_norm = nn.LayerNorm(output_dim)

    def forward(
        self, x: torch.Tensor, context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        # x: (B, T, input_dim) or (B, input_dim) for static
        # context: (B, hidden_dim) — static context injected via addition
        residual = x

        h = self.fc1(x)  # (..., hidden_dim)

        if self.use_context and context is not None and self.context_proj is not None:
            # Broadcast context to match temporal dim if needed
            ctx_proj = self.context_proj(context)
            if x.dim() == 3 and ctx_proj.dim() == 2:
                ctx_proj = ctx_proj.unsqueeze(1)  # (B, 1, hidden_dim)
            h = h + ctx_proj

        h = F.elu(h)
        h = self.fc2(h)
        h = self.dropout(h)

        # GLU gate
        gate_out = self.gate(h)
        value, gate = gate_out.chunk(2, dim=-1)
        gated = value * torch.sigmoid(gate)  # (..., output_dim)

        # Skip connection
        if self.skip_proj is not None:
            residual = self.skip_proj(residual)

        return self.layer_norm(residual + gated)


class VariableSelectionNetwork(nn.Module):
    """Learns which input variables are relevant at each timestep."""

    def __init__(
        self,
        input_sizes: list,
        hidden_dim: int,
        dropout: float,
        context_dim: Optional[int] = None,
    ):
        super().__init__()
        self.n_vars = len(input_sizes)
        self.hidden_dim = hidden_dim
        self.context_dim = context_dim

        # One GRN per variable: maps each variable to hidden_dim
        self.var_grns = nn.ModuleList([
            GatedResidualNetwork(
                input_dim=sz,
                hidden_dim=hidden_dim,
                output_dim=hidden_dim,
                dropout=dropout,
            )
            for sz in input_sizes
        ])

        # Softmax weight GRN: takes concatenated flattened input → n_vars weights
        total_input = sum(input_sizes)
        use_ctx = context_dim is not None
        self.weight_grn = GatedResidualNetwork(
            input_dim=total_input,
            hidden_dim=hidden_dim,
            output_dim=self.n_vars,
            dropout=dropout,
            use_context=use_ctx,
            context_dim=context_dim,
        )

    def forward(
        self,
        x: list,
        context: Optional[torch.Tensor] = None,
    ):
        # x: list of tensors, each (B, T, sz_i) or (B, sz_i) for static
        # Returns: (selected_features, variable_weights)

        # Process each variable through its GRN
        processed = [grn(xi) for grn, xi in zip(self.var_grns, x)]
        # Each processed[i]: (..., hidden_dim)

        # Concatenate raw inputs for weight computation
        raw_concat = torch.cat(x, dim=-1)  # (..., total_input)

        # Compute softmax weights
        weights_logits = self.weight_grn(raw_concat, context=context)  # (..., n_vars)
        weights = torch.softmax(weights_logits, dim=-1)

        # Weighted sum of processed variables
        # Stack: (..., n_vars, hidden_dim)
        stacked = torch.stack(processed, dim=-2)
        # weights: (..., n_vars) → (..., n_vars, 1)
        selected = (stacked * weights.unsqueeze(-1)).sum(dim=-2)  # (..., hidden_dim)

        return selected, weights


class InterpretableMultiHeadAttention(nn.Module):
    """
    TFT's attention: shares values across heads (interpretable).
    Standard MHA uses per-head V; TFT uses shared V for interpretability.
    """

    def __init__(self, embed_dim: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        assert embed_dim % num_heads == 0
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads
        self.dropout = nn.Dropout(dropout)

        # Per-head Q and K projections
        self.q_proj = nn.Linear(embed_dim, embed_dim)
        self.k_proj = nn.Linear(embed_dim, embed_dim)
        # Shared V projection (single set, not per-head)
        self.v_proj = nn.Linear(embed_dim, self.head_dim)
        self.out_proj = nn.Linear(self.head_dim, embed_dim)

    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
        value: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ):
        # query: (B, Tq, embed_dim)
        # key:   (B, Tk, embed_dim)
        # value: (B, Tk, embed_dim)
        B, Tq, _ = query.shape
        Tk = key.shape[1]

        # Project Q and K per head
        Q = self.q_proj(query)  # (B, Tq, embed_dim)
        K = self.k_proj(key)    # (B, Tk, embed_dim)
        # Shared V
        V = self.v_proj(value)  # (B, Tk, head_dim)

        # Reshape Q, K to (B, num_heads, T, head_dim)
        Q = Q.view(B, Tq, self.num_heads, self.head_dim).transpose(1, 2)
        K = K.view(B, Tk, self.num_heads, self.head_dim).transpose(1, 2)

        scale = self.head_dim ** -0.5
        attn_scores = torch.matmul(Q, K.transpose(-2, -1)) * scale  # (B, H, Tq, Tk)

        if mask is not None:
            attn_scores = attn_scores.masked_fill(mask == 0, float("-inf"))

        attn_weights = torch.softmax(attn_scores, dim=-1)  # (B, H, Tq, Tk)
        attn_weights = self.dropout(attn_weights)

        # Average attention weights across heads for interpretability
        avg_attn_weights = attn_weights.mean(dim=1)  # (B, Tq, Tk)

        # Apply attention to shared V — average across heads then apply
        avg_attn = attn_weights.mean(dim=1)  # (B, Tq, Tk)
        attended = torch.matmul(avg_attn, V)  # (B, Tq, head_dim)
        output = self.out_proj(attended)       # (B, Tq, embed_dim)

        return output, avg_attn_weights


@dataclass
class TFTOutput:
    predictions: torch.Tensor          # (B, decoder_steps, n_quantiles)
    encoder_attention: torch.Tensor    # (B, encoder_steps, encoder_steps)
    decoder_attention: torch.Tensor    # (B, decoder_steps, encoder_steps)
    static_variable_weights: torch.Tensor   # (B, n_static_features)
    encoder_variable_weights: torch.Tensor  # (B, encoder_steps, n_dynamic_observed)
    viral_prob_horizon: torch.Tensor   # (B, decoder_steps) — median quantile as probability


class TemporalFusionTransformer(nn.Module):

    def __init__(self, cfg: TFTConfig):
        super().__init__()
        self.cfg = cfg
        H = cfg.hidden_dim
        n_q = len(cfg.output_quantiles)

        # ── Static pipeline ─────────────────────────────────────────────────
        # VSN: one variable per static feature (each dim=1)
        self.static_vsn = VariableSelectionNetwork(
            input_sizes=[1] * cfg.n_static_features,
            hidden_dim=H,
            dropout=cfg.dropout,
        )
        # 4 context GRNs: enrichment, state_h, state_c, gating
        self.static_enrichment_grn = GatedResidualNetwork(H, H, H, cfg.dropout)
        self.static_state_h_grn = GatedResidualNetwork(H, H, H, cfg.dropout)
        self.static_state_c_grn = GatedResidualNetwork(H, H, H, cfg.dropout)
        self.static_gating_grn = GatedResidualNetwork(H, H, H, cfg.dropout)

        # ── Encoder pipeline ─────────────────────────────────────────────────
        # VSN: one variable per observed signal (each dim=1)
        self.encoder_vsn = VariableSelectionNetwork(
            input_sizes=[1] * cfg.n_dynamic_observed,
            hidden_dim=H,
            dropout=cfg.dropout,
            context_dim=H,
        )
        self.encoder_lstm = nn.LSTM(
            input_size=H,
            hidden_size=H,
            num_layers=cfg.lstm_layers,
            batch_first=True,
            dropout=cfg.dropout if cfg.lstm_layers > 1 else 0.0,
        )

        # ── Decoder pipeline ─────────────────────────────────────────────────
        self.decoder_vsn = VariableSelectionNetwork(
            input_sizes=[1] * cfg.n_dynamic_known,
            hidden_dim=H,
            dropout=cfg.dropout,
            context_dim=H,
        )
        self.decoder_lstm = nn.LSTM(
            input_size=H,
            hidden_size=H,
            num_layers=cfg.lstm_layers,
            batch_first=True,
            dropout=cfg.dropout if cfg.lstm_layers > 1 else 0.0,
        )

        # ── Static enrichment ────────────────────────────────────────────────
        self.enrichment_grn = GatedResidualNetwork(
            H, H, H, cfg.dropout, use_context=True, context_dim=H
        )

        # ── Temporal self-attention ──────────────────────────────────────────
        self.attention = InterpretableMultiHeadAttention(H, cfg.attention_heads, cfg.dropout)
        self.attn_gate_grn = GatedResidualNetwork(H, H, H, cfg.dropout)

        # ── Position-wise FFN ────────────────────────────────────────────────
        self.poswise_grn = GatedResidualNetwork(H, H, H, cfg.dropout)

        # ── Output projection ─────────────────────────────────────────────────
        self.output_proj = nn.Linear(H, n_q)

        # ── Encoder attention (self-attention on encoder for output) ──────────
        self.enc_self_attn = InterpretableMultiHeadAttention(H, cfg.attention_heads, cfg.dropout)

    def forward(
        self,
        static_inputs: torch.Tensor,         # (B, n_static_features)
        encoder_inputs: torch.Tensor,        # (B, encoder_steps, n_dynamic_observed)
        decoder_known_inputs: torch.Tensor,  # (B, decoder_steps, n_dynamic_known)
    ) -> TFTOutput:
        B = static_inputs.shape[0]
        H = self.cfg.hidden_dim
        cfg = self.cfg

        # ── 1. Static encoder ────────────────────────────────────────────────
        # Split static inputs into list of (B, 1) tensors
        static_list = [static_inputs[:, i:i+1] for i in range(cfg.n_static_features)]
        static_features, static_weights = self.static_vsn(static_list)
        # static_features: (B, hidden_dim)

        static_enrichment_ctx = self.static_enrichment_grn(static_features)
        static_state_h = self.static_state_h_grn(static_features)
        static_state_c = self.static_state_c_grn(static_features)
        # state: (num_layers, B, H)
        state_h = static_state_h.unsqueeze(0).expand(cfg.lstm_layers, -1, -1).contiguous()
        state_c = static_state_c.unsqueeze(0).expand(cfg.lstm_layers, -1, -1).contiguous()

        # ── 2. Encoder ───────────────────────────────────────────────────────
        enc_list = [encoder_inputs[:, :, i:i+1] for i in range(cfg.n_dynamic_observed)]
        enc_selected, enc_var_weights = self.encoder_vsn(enc_list, context=static_enrichment_ctx)
        # enc_selected: (B, encoder_steps, H)
        enc_out, (enc_h, enc_c) = self.encoder_lstm(enc_selected, (state_h, state_c))

        # ── 3. Decoder ───────────────────────────────────────────────────────
        dec_list = [decoder_known_inputs[:, :, i:i+1] for i in range(cfg.n_dynamic_known)]
        dec_selected, _ = self.decoder_vsn(dec_list, context=static_enrichment_ctx)
        # dec_selected: (B, decoder_steps, H)
        dec_out, _ = self.decoder_lstm(dec_selected, (enc_h, enc_c))

        # ── 4. Static enrichment on encoder ─────────────────────────────────
        enc_enriched = self.enrichment_grn(enc_out, context=static_enrichment_ctx)

        # ── Encoder self-attention (for encoder_attention output) ────────────
        _, enc_self_attn_weights = self.enc_self_attn(enc_enriched, enc_enriched, enc_enriched)

        # ── 5. Temporal attention: decoder queries encoder ───────────────────
        attended_dec, dec_attn_weights = self.attention(
            query=dec_out,
            key=enc_enriched,
            value=enc_enriched,
        )
        # Gate
        attended_dec = self.attn_gate_grn(attended_dec)

        # ── 6. Position-wise FFN ─────────────────────────────────────────────
        output = self.poswise_grn(attended_dec)

        # ── 7. Output projection ─────────────────────────────────────────────
        predictions = self.output_proj(output)  # (B, decoder_steps, n_quantiles)

        # Derive viral_prob_horizon from median quantile (index 1), sigmoid-bounded
        median_idx = 1  # q50
        viral_prob = torch.sigmoid(predictions[:, :, median_idx])  # (B, decoder_steps)

        return TFTOutput(
            predictions=predictions,
            encoder_attention=enc_self_attn_weights,
            decoder_attention=dec_attn_weights,
            static_variable_weights=static_weights,
            encoder_variable_weights=enc_var_weights,
            viral_prob_horizon=viral_prob,
        )


class QuantileLoss(nn.Module):
    """Pinball loss for quantile regression. Sum over quantiles."""

    def __init__(self, quantiles: list):
        super().__init__()
        self.register_buffer("quantiles", torch.tensor(quantiles, dtype=torch.float32))

    def forward(self, predictions: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        # predictions: (B, T, n_quantiles), targets: (B, T)
        targets_expanded = targets.unsqueeze(-1)  # (B, T, 1)
        errors = targets_expanded - predictions   # (B, T, n_quantiles)
        # Pinball: q * max(e, 0) + (1-q) * max(-e, 0)
        q = self.quantiles  # (n_quantiles,)
        loss = torch.max(q * errors, (q - 1) * errors)  # (B, T, n_quantiles)
        return loss.mean()


def create_tft_default() -> TemporalFusionTransformer:
    """Factory function — creates TFT with default TFTConfig settings."""
    return TemporalFusionTransformer(TFTConfig())
