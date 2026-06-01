"""
Song Analyzer — Contrastive Audio Embedding Network

Learns a 128-dimensional embedding space where:
  - Tracks with similar viral/trend trajectories cluster together
  - "Hit sound" patterns emerge as dense clusters of viral tracks
  - Tracks close to known viral hits get a similarity boost in predictions

Architecture:
  Audio features → Deep encoder → L2-normalised embedding (128-d)

Training objective: Supervised Contrastive Loss (SupCon)
  - Anchor: a track's audio features
  - Positives: other tracks with the same trend label (both VIRAL, or both POPULAR)
  - Negatives: tracks with different trend labels

Why contrastive:
  The model can't be told explicitly "this sounds viral" — it needs to learn that
  through comparison. Contrastive learning forces it to discover what audio
  properties (BPM range, energy profile, danceability distribution) are shared
  among tracks that went viral in similar genres/periods.

At inference: we retrieve the K nearest neighbours from a viral-track index and
boost the viral probability based on audio similarity.
"""

from __future__ import annotations

from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


AUDIO_IN    = 8    # matches network.py AUDIO_IN
EMBED_DIM   = 128
GENRE_VOCAB = 64   # number of distinct genres (embeddings)
LANG_VOCAB  = 32


class SongEncoder(nn.Module):
    """
    Encodes audio features + genre + language into a normalised 128-d embedding.

    Inputs:
      audio_feats  (B, AUDIO_IN)      — BPM, energy, danceability, valence,
                                        loudness, mode, key_sin, key_cos
      genre_ids    (B,)   optional    — integer genre index
      lang_ids     (B,)   optional    — integer language index

    Output:
      embeddings   (B, EMBED_DIM)     — L2-normalised
    """

    def __init__(
        self,
        audio_in:    int = AUDIO_IN,
        embed_dim:   int = EMBED_DIM,
        genre_vocab: int = GENRE_VOCAB,
        lang_vocab:  int = LANG_VOCAB,
    ):
        super().__init__()

        # Categorical embeddings (captures "hip-hop songs tend to go viral differently from pop")
        self.genre_embed = nn.Embedding(genre_vocab + 1, 16, padding_idx=0)
        self.lang_embed  = nn.Embedding(lang_vocab  + 1, 8,  padding_idx=0)

        # Audio encoder trunk (deeper than branches in main network — richer audio features)
        proj_in = audio_in + 16 + 8   # audio + genre_emb + lang_emb
        self.encoder = nn.Sequential(
            nn.Linear(proj_in, 128),
            nn.LayerNorm(128),
            nn.GELU(),
            nn.Dropout(0.05),
            nn.Linear(128, 128),
            nn.LayerNorm(128),
            nn.GELU(),
            nn.Dropout(0.05),
            nn.Linear(128, embed_dim),
        )

    def forward(
        self,
        audio_feats: torch.Tensor,
        genre_ids:   Optional[torch.Tensor] = None,
        lang_ids:    Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        B = audio_feats.shape[0]

        g = self.genre_embed(
            genre_ids if genre_ids is not None
            else torch.zeros(B, dtype=torch.long, device=audio_feats.device)
        )
        l = self.lang_embed(
            lang_ids if lang_ids is not None
            else torch.zeros(B, dtype=torch.long, device=audio_feats.device)
        )

        x = torch.cat([audio_feats, g, l], dim=-1)
        emb = self.encoder(x)
        return F.normalize(emb, p=2, dim=-1)   # L2-normalise


# ── Supervised Contrastive Loss ───────────────────────────────────────────────

class SupervisedContrastiveLoss(nn.Module):
    """
    SupCon loss (Khosla et al. 2020).

    Treats tracks with the same trend label as positives of each other.
    Forces the encoder to group VIRAL tracks together, TRENDING together, etc.

    temperature: controls how sharp the distribution is.
      Lower = harder assignments, more discriminative but prone to instability.
      0.07 is a typical starting value.
    """

    def __init__(self, temperature: float = 0.07):
        super().__init__()
        self.temp = temperature

    def forward(
        self,
        embeddings: torch.Tensor,   # (B, D) — L2-normalised
        labels:     torch.Tensor,   # (B,)   — integer class labels
    ) -> torch.Tensor:
        B = embeddings.shape[0]
        device = embeddings.device

        # Similarity matrix: (B, B)
        sim = torch.matmul(embeddings, embeddings.T) / self.temp

        # Remove self-similarity from denominator
        self_mask = torch.eye(B, dtype=torch.bool, device=device)
        sim = sim.masked_fill(self_mask, -1e9)

        # Positive mask: same label, different index
        labels = labels.unsqueeze(1)
        pos_mask = (labels == labels.T) & ~self_mask

        if pos_mask.sum() == 0:
            return torch.tensor(0.0, device=device, requires_grad=True)

        # Log-softmax over all non-self similarities
        log_prob = F.log_softmax(sim, dim=-1)

        # Mean log-probability assigned to positives
        pos_log_prob = (log_prob * pos_mask.float()).sum(dim=-1) / (
            pos_mask.float().sum(dim=-1).clamp(min=1.0)
        )

        loss = -pos_log_prob.mean()
        return loss


# ── Audio feature preparation ─────────────────────────────────────────────────

GENRE_REGISTRY: dict[str, int] = {}
LANG_REGISTRY:  dict[str, int] = {}


def _registry_id(registry: dict, value: Optional[str], max_id: int) -> int:
    if not value:
        return 0
    v = value.lower().strip()
    if v not in registry:
        new_id = len(registry) + 1
        if new_id <= max_id:
            registry[v] = new_id
        else:
            return 0
    return registry.get(v, 0)


def encode_audio_features(record: dict) -> torch.Tensor:
    """
    Converts a TrackFeatureRow dict to the AUDIO_IN tensor used by SongEncoder.

    Encodes musical key as (sin, cos) of the circle-of-fifths angle so
    relationships like "C → G" are geometrically close.
    """
    import math
    import numpy as np

    bpm        = float(record.get("bpm") or record.get("tempo") or 120.0)
    energy     = float(record.get("energy") or 0.5)
    dance      = float(record.get("danceability") or 0.5)
    valence    = float(record.get("valence") or 0.5)
    loudness   = float(record.get("loudness") or -10.0)
    mode       = 1.0 if str(record.get("mode") or "major").lower() == "major" else 0.0

    key_str = str(record.get("musical_key") or record.get("key") or "C")
    key_names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
    # Map to circle-of-fifths index (0–11)
    cof_order = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]   # C G D A E B F# C# G# D# A# F
    try:
        chromatic_idx = key_names.index(key_str.split("/")[0].strip())
    except ValueError:
        chromatic_idx = 0
    cof_idx = cof_order[chromatic_idx]
    angle   = 2 * math.pi * cof_idx / 12.0
    key_sin = math.sin(angle)
    key_cos = math.cos(angle)

    # Normalise BPM to [0, 1] range (60–200 BPM typical)
    bpm_norm = (min(max(bpm, 60.0), 200.0) - 60.0) / 140.0
    # Normalise loudness to [0, 1] (typical range -60 to 0 dB)
    loud_norm = (min(max(loudness, -60.0), 0.0) + 60.0) / 60.0

    feats = [bpm_norm, energy, dance, valence, loud_norm, mode, key_sin, key_cos]
    return torch.tensor(feats, dtype=torch.float32).unsqueeze(0)   # (1, AUDIO_IN)


# ── Nearest-neighbour retrieval ───────────────────────────────────────────────

class ViralSoundIndex:
    """
    Maintains an in-memory FAISS-like index of viral track embeddings.
    At inference, computes cosine similarity between a new track's audio
    embedding and the viral index to produce an "audio similarity to hits" score.

    Uses simple NumPy inner-product when FAISS is not available.
    """

    def __init__(self, dim: int = EMBED_DIM):
        self.dim   = dim
        self._embs: Optional["np.ndarray"] = None   # (N, dim)
        self._ids:  list[int] = []

    def add(self, embeddings: "np.ndarray", track_ids: list[int]):
        import numpy as np
        if self._embs is None:
            self._embs = embeddings.astype(np.float32)
        else:
            self._embs = np.vstack([self._embs, embeddings.astype(np.float32)])
        self._ids.extend(track_ids)

    def query(self, embedding: "np.ndarray", k: int = 5) -> dict:
        """
        Returns the top-k most similar tracks and their similarity scores.
        embedding: (dim,) numpy array, already L2-normalised.
        """
        import numpy as np
        if self._embs is None or len(self._embs) == 0:
            return {"similar_track_ids": [], "similarity_score": 0.0}

        sims = (self._embs @ embedding).flatten()    # dot product of unit vectors = cosine
        top_k_idx = np.argsort(sims)[::-1][:k]
        top_sims  = sims[top_k_idx].tolist()
        top_ids   = [self._ids[i] for i in top_k_idx]

        # Aggregate similarity as mean of top-k scores
        agg_score = float(np.mean(top_sims)) if top_sims else 0.0
        return {
            "similar_track_ids": top_ids,
            "top_similarities": [round(s, 4) for s in top_sims],
            "similarity_score": round(max(agg_score, 0.0), 4),
        }

    def save(self, path: str):
        import numpy as np
        import json
        np.save(path + ".npy", self._embs if self._embs is not None else np.zeros((0, self.dim)))
        with open(path + ".ids.json", "w") as f:
            json.dump(self._ids, f)

    def load(self, path: str):
        import numpy as np
        import json
        import os
        npy = path + ".npy"
        ids = path + ".ids.json"
        if os.path.exists(npy):
            self._embs = np.load(npy)
        if os.path.exists(ids):
            with open(ids) as f:
                self._ids = json.load(f)
