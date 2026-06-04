"""
Multi-modal encoders for the ViralTransformer architecture.

Four input modalities:
  - Audio: pre-trained music transformer features → 128-dim embedding
  - TimeSeries: engagement timeseries (streams, TikTok uses, views) → temporal encoding
  - Text: song title + lyrics + captions via BERT-style transformer
  - Metadata: artist, genre, release date via embedding + MLP
"""

import math
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Positional encoding shared across sequence-based encoders
# ---------------------------------------------------------------------------

class SinusoidalPositionalEncoding(nn.Module):
    """Standard sinusoidal positional encoding (Vaswani et al., 2017)."""

    def __init__(self, d_model: int, max_len: int = 512, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (batch, seq_len, d_model)"""
        x = x + self.pe[:, : x.size(1)]
        return self.dropout(x)


# ---------------------------------------------------------------------------
# Audio Encoder
# ---------------------------------------------------------------------------

class AudioEncoder(nn.Module):
    """
    Encodes pre-extracted audio features (e.g. from a music transformer or
    mel-spectrogram CNN) into a fixed 128-dimensional embedding.

    Expects input of shape (batch, audio_seq_len, audio_input_dim) where
    audio_input_dim is the raw feature dimension (e.g. 128 mel bins × time
    frames, or a pre-trained backbone output).

    A lightweight transformer refines the sequence, then mean-pools to a
    single 128-dim vector.
    """

    def __init__(
        self,
        input_dim: int = 128,
        d_model: int = 128,
        num_heads: int = 8,
        num_layers: int = 4,
        dropout: float = 0.1,
        max_seq_len: int = 512,
    ):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, d_model)
        self.pos_enc = SinusoidalPositionalEncoding(d_model, max_seq_len, dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=num_heads,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,  # pre-norm for stability
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)
        self.output_dim = d_model

    def forward(
        self,
        x: torch.Tensor,
        src_key_padding_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len, input_dim) — raw audio feature frames
            src_key_padding_mask: (batch, seq_len) bool mask, True = ignore

        Returns:
            (batch, d_model) — pooled audio embedding
        """
        x = self.input_proj(x)
        x = self.pos_enc(x)
        x = self.transformer(x, src_key_padding_mask=src_key_padding_mask)
        x = self.norm(x)
        # Masked mean pooling
        if src_key_padding_mask is not None:
            mask = (~src_key_padding_mask).float().unsqueeze(-1)  # (B, T, 1)
            x = (x * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
        else:
            x = x.mean(dim=1)
        return x


# ---------------------------------------------------------------------------
# Time-Series Encoder
# ---------------------------------------------------------------------------

class TimeSeriesEncoder(nn.Module):
    """
    Encodes multi-variate engagement timeseries into a temporal embedding.

    Input shape: (batch, time_steps, num_features)
    Features per timestep can include: spotify_streams, tiktok_video_count,
    tiktok_views, shazam_count, youtube_views, radio_spins, chart_rank, etc.

    Uses a causal Transformer so the model can attend over the full
    historical window without data leakage at inference time.
    """

    def __init__(
        self,
        num_features: int = 8,
        d_model: int = 128,
        num_heads: int = 8,
        num_layers: int = 4,
        dropout: float = 0.1,
        max_steps: int = 365,
    ):
        super().__init__()
        self.feature_proj = nn.Linear(num_features, d_model)
        self.pos_enc = SinusoidalPositionalEncoding(d_model, max_steps, dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=num_heads,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)

        # Learnable [CLS]-style token to aggregate the sequence
        self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
        nn.init.trunc_normal_(self.cls_token, std=0.02)

        self.output_dim = d_model

    def forward(
        self,
        x: torch.Tensor,
        src_key_padding_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Args:
            x: (batch, time_steps, num_features)
            src_key_padding_mask: (batch, time_steps) — True = pad timestep

        Returns:
            (batch, d_model) — temporal embedding via CLS token
        """
        B = x.size(0)
        x = self.feature_proj(x)
        x = self.pos_enc(x)

        # Prepend CLS token
        cls = self.cls_token.expand(B, -1, -1)
        x = torch.cat([cls, x], dim=1)

        # Extend padding mask for the CLS token (always attend to it)
        if src_key_padding_mask is not None:
            cls_mask = torch.zeros(B, 1, dtype=torch.bool, device=x.device)
            src_key_padding_mask = torch.cat([cls_mask, src_key_padding_mask], dim=1)

        x = self.transformer(x, src_key_padding_mask=src_key_padding_mask)
        x = self.norm(x)
        return x[:, 0]  # CLS token output


# ---------------------------------------------------------------------------
# Text Encoder
# ---------------------------------------------------------------------------

class TextEncoder(nn.Module):
    """
    Encodes tokenized text (title + lyrics + captions) using a BERT-style
    transformer with learned positional embeddings.

    For production, initialize from a pre-trained checkpoint (e.g. bert-base
    or a music-domain fine-tuned model). In this implementation we provide
    a trainable transformer that can be initialized from scratch or loaded
    from HuggingFace weights externally.

    Input: token ids (batch, seq_len) with optional attention mask.
    Output: (batch, d_model) [CLS] representation.
    """

    def __init__(
        self,
        vocab_size: int = 30522,  # BERT-base vocab
        d_model: int = 128,
        num_heads: int = 8,
        num_layers: int = 6,
        max_seq_len: int = 512,
        dropout: float = 0.1,
        pad_token_id: int = 0,
    ):
        super().__init__()
        self.pad_token_id = pad_token_id
        self.d_model = d_model

        self.token_emb = nn.Embedding(vocab_size, d_model, padding_idx=pad_token_id)
        self.pos_emb = nn.Embedding(max_seq_len, d_model)
        self.emb_norm = nn.LayerNorm(d_model)
        self.emb_dropout = nn.Dropout(dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=num_heads,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)
        self.output_dim = d_model

        self._init_weights()

    def _init_weights(self):
        nn.init.trunc_normal_(self.token_emb.weight, std=0.02)
        nn.init.trunc_normal_(self.pos_emb.weight, std=0.02)

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Args:
            input_ids: (batch, seq_len) — token IDs
            attention_mask: (batch, seq_len) — 1=attend, 0=mask

        Returns:
            (batch, d_model) — [CLS] token embedding (position 0)
        """
        B, T = input_ids.shape
        positions = torch.arange(T, device=input_ids.device).unsqueeze(0)

        x = self.token_emb(input_ids) + self.pos_emb(positions)
        x = self.emb_dropout(self.emb_norm(x))

        # TransformerEncoder expects src_key_padding_mask: True = ignore
        if attention_mask is not None:
            padding_mask = attention_mask == 0
        else:
            padding_mask = input_ids == self.pad_token_id

        x = self.transformer(x, src_key_padding_mask=padding_mask)
        x = self.norm(x)
        return x[:, 0]  # [CLS]


# ---------------------------------------------------------------------------
# Metadata Encoder
# ---------------------------------------------------------------------------

class MetadataEncoder(nn.Module):
    """
    Encodes structured metadata: artist ID, genre ID, release date features,
    and any additional categorical/continuous attributes.

    Uses embedding tables for categorical fields and a shared MLP to project
    everything into a unified d_model-dimensional vector.
    """

    def __init__(
        self,
        num_artists: int = 100_000,
        num_genres: int = 512,
        artist_emb_dim: int = 64,
        genre_emb_dim: int = 32,
        # Continuous date features: [sin_month, cos_month, sin_dow, cos_dow, year_norm]
        num_date_features: int = 5,
        # Additional continuous metadata: e.g. track duration, BPM, key, mode
        num_continuous: int = 8,
        d_model: int = 128,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.artist_emb = nn.Embedding(num_artists, artist_emb_dim, padding_idx=0)
        self.genre_emb = nn.Embedding(num_genres, genre_emb_dim, padding_idx=0)

        input_dim = artist_emb_dim + genre_emb_dim + num_date_features + num_continuous

        self.mlp = nn.Sequential(
            nn.Linear(input_dim, d_model * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, d_model),
            nn.LayerNorm(d_model),
        )
        self.output_dim = d_model

        nn.init.trunc_normal_(self.artist_emb.weight, std=0.02)
        nn.init.trunc_normal_(self.genre_emb.weight, std=0.02)

    def forward(
        self,
        artist_ids: torch.Tensor,       # (batch,)
        genre_ids: torch.Tensor,        # (batch,)
        date_features: torch.Tensor,    # (batch, num_date_features)
        continuous: torch.Tensor,       # (batch, num_continuous)
    ) -> torch.Tensor:
        """
        Returns:
            (batch, d_model) — metadata embedding
        """
        a = self.artist_emb(artist_ids)   # (B, artist_emb_dim)
        g = self.genre_emb(genre_ids)     # (B, genre_emb_dim)
        x = torch.cat([a, g, date_features, continuous], dim=-1)
        return self.mlp(x)
