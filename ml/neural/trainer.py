"""
Neural Trainer — Full Offline Training

Orchestrates the complete training cycle:
  1. Load all feature parquet files (ETL labels + user feedback)
  2. Train SongEncoder with Supervised Contrastive Loss
  3. Train MusicIntelligenceNet with multi-task loss
  4. Run EWC consolidation to protect learned weights
  5. Build the ViralSoundIndex from all viral track embeddings
  6. Export all model artifacts + metrics

Run:
  python -m ml.neural.trainer
  or: npm run ml:neural:train
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

from ml.config import MODEL_DIR, DATA_DIR, LOG_DIR, configure_logging
from ml.neural.network import MusicIntelligenceNet, compute_loss, TREND_CLASSES
from ml.neural.temporal_encoder import TemporalEncoder
from ml.neural.song_analyzer import SongEncoder, SupervisedContrastiveLoss
from ml.neural.continual_learner import ContinualLearner
from ml.neural.dataset import build_dataloader, MusicDataset

logger = configure_logging("ml.neural.trainer")

NEURAL_METRICS_PATH = LOG_DIR / "metrics" / "neural_training_metrics.json"
VIRAL_INDEX_PATH    = str(MODEL_DIR / "viral_sound_index")
SONG_ENC_PATH       = MODEL_DIR / "song_encoder.pt"
TEMPORAL_ENC_PATH   = MODEL_DIR / "temporal_encoder.pt"

# ── Hyperparameters ───────────────────────────────────────────────────────────

OFFLINE_LR       = 5e-4
CONTRASTIVE_LR   = 1e-4
NUM_EPOCHS       = 15
BATCH_SIZE       = 64
GRAD_CLIP        = 1.0
WARMUP_STEPS     = 200
LABEL_SMOOTH     = 0.05   # reduces overconfidence on noisy labels

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Contrastive pre-training ──────────────────────────────────────────────────

def pretrain_song_encoder(dataloader: DataLoader) -> SongEncoder:
    """
    Phase 1: Pre-train the SongEncoder with Supervised Contrastive Loss.
    This creates the audio embedding space where similar trend sounds cluster.
    """
    logger.info("=== Phase 1: Contrastive pre-training of SongEncoder ===")
    encoder = SongEncoder().to(DEVICE)
    criterion = SupervisedContrastiveLoss(temperature=0.07)
    optimizer = torch.optim.AdamW(encoder.parameters(), lr=CONTRASTIVE_LR)

    encoder.train()
    for epoch in range(5):   # fewer epochs: contrastive converges quickly
        total_loss = 0.0
        n_batches  = 0
        for feat, tgt in dataloader:
            audio   = feat.get("audio_feats")
            labels  = tgt.get("trend")        # use trend label as positive class

            if audio is None or labels is None:
                continue

            audio  = audio.to(DEVICE)
            labels = labels.to(DEVICE)

            # Skip samples with unknown label
            mask = labels != -1
            if mask.sum() < 2:
                continue

            embs = encoder(audio[mask])
            loss = criterion(embs, labels[mask])

            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(encoder.parameters(), GRAD_CLIP)
            optimizer.step()

            total_loss += float(loss)
            n_batches  += 1

        logger.info("Contrastive epoch %d, mean loss=%.4f", epoch + 1, total_loss / max(n_batches, 1))

    torch.save(encoder.state_dict(), SONG_ENC_PATH)
    logger.info("SongEncoder saved to %s", SONG_ENC_PATH)
    return encoder


# ── Multi-task main training ──────────────────────────────────────────────────

def train_main_network(
    learner: ContinualLearner,
    dataloader: DataLoader,
) -> Dict:
    """
    Phase 2: Full multi-task training of MusicIntelligenceNet.
    Uses EWC penalty from previous consolidation to protect prior knowledge.
    """
    logger.info("=== Phase 2: Multi-task training of MusicIntelligenceNet ===")

    optimizer = torch.optim.AdamW(
        learner.model.parameters(), lr=OFFLINE_LR, weight_decay=1e-4
    )

    # Cosine annealing with warm restarts — adapts LR to new trends
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=5, T_mult=2, eta_min=1e-6
    )

    global_step = 0
    metrics_history: List[Dict] = []

    for epoch in range(NUM_EPOCHS):
        epoch_start = time.time()
        task_losses: Dict[str, List[float]] = {
            "viral": [], "popular": [], "trend": [], "traj": []
        }
        ewc_losses: List[float] = []

        learner.model.train()

        for feat, tgt in dataloader:
            feat = {k: v.to(DEVICE) for k, v in feat.items()}
            tgt  = {k: v.to(DEVICE) for k, v in tgt.items()}

            optimizer.zero_grad()
            out = learner.model(**feat)

            task_loss, per_task = compute_loss(out, tgt)
            ewc_penalty = learner.ewc.penalty(learner.model)

            total = task_loss + ewc_penalty
            total.backward()
            nn.utils.clip_grad_norm_(learner.model.parameters(), GRAD_CLIP)
            optimizer.step()

            # Warmup: scale LR from 0 to OFFLINE_LR over first WARMUP_STEPS
            if global_step < WARMUP_STEPS:
                scale = global_step / WARMUP_STEPS
                for g in optimizer.param_groups:
                    g["lr"] = OFFLINE_LR * scale

            for k, v in per_task.items():
                if k in task_losses:
                    task_losses[k].append(v)
            ewc_losses.append(float(ewc_penalty))
            global_step += 1

        scheduler.step()
        elapsed = time.time() - epoch_start

        epoch_metrics = {
            "epoch":    epoch + 1,
            "elapsed":  round(elapsed, 1),
            "lr":       optimizer.param_groups[0]["lr"],
            **{f"loss_{k}": round(float(np.mean(v)), 4) if v else None
               for k, v in task_losses.items()},
            "ewc_penalty": round(float(np.mean(ewc_losses)), 4),
        }
        metrics_history.append(epoch_metrics)
        logger.info("Epoch %d | %s", epoch + 1, epoch_metrics)

    return {"epochs": metrics_history}


# ── Viral sound index build ───────────────────────────────────────────────────

def build_viral_index(song_encoder: SongEncoder, dataset: MusicDataset):
    """
    Phase 3: Build ViralSoundIndex from all viral tracks in the training set.
    The index is used at inference time to compute audio similarity to known hits.
    """
    from ml.neural.song_analyzer import ViralSoundIndex

    logger.info("=== Phase 3: Building ViralSoundIndex ===")
    index = ViralSoundIndex()
    song_encoder.eval()

    viral_embeds = []
    viral_ids    = []

    with torch.no_grad():
        for idx in range(len(dataset)):
            feat, tgt, _ = dataset[idx]
            row = dataset.df.iloc[idx]

            is_viral = (tgt["trend"].item() == 3 or   # VIRAL
                        tgt.get("viral", torch.tensor(-1)).item() == 1)
            if not is_viral:
                continue

            audio = feat["audio_feats"].unsqueeze(0).to(DEVICE)
            emb   = song_encoder(audio)
            viral_embeds.append(emb.cpu().numpy())
            viral_ids.append(int(row.get("trackId") or 0))

    if viral_embeds:
        all_embs = np.vstack(viral_embeds)
        index.add(all_embs, viral_ids)
        index.save(VIRAL_INDEX_PATH)
        logger.info("ViralSoundIndex built with %d tracks", len(viral_ids))
    else:
        logger.warning("No viral tracks found for index. Index will be empty.")

    return index


# ── Full training pipeline ────────────────────────────────────────────────────

def main():
    logger.info("Device: %s", DEVICE)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    # Build DataLoader (includes all parquet + feedback files)
    logger.info("Building DataLoader...")
    dataloader = build_dataloader(
        batch_size=BATCH_SIZE,
        num_workers=0,
        use_weighted=True,
    )
    dataset = dataloader.dataset

    # ── Phase 1: Contrastive pre-training ────────────────────────────────
    song_encoder = pretrain_song_encoder(dataloader)

    # ── Phase 2: Multi-task training ─────────────────────────────────────
    learner = ContinualLearner(device=DEVICE)
    learner.load()   # Load existing model + EWC state if available

    train_metrics = train_main_network(learner, dataloader)

    # ── EWC consolidation (protect weights learned in this run) ──────────
    logger.info("=== Phase 2b: EWC consolidation ===")
    learner.ewc.consolidate(learner.model, dataloader, DEVICE)

    # ── Phase 3: Build viral sound index ─────────────────────────────────
    build_viral_index(song_encoder, dataset)

    # ── Save everything ───────────────────────────────────────────────────
    learner.save()

    NEURAL_METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with NEURAL_METRICS_PATH.open("w") as f:
        json.dump(train_metrics, f, indent=2)
    logger.info("Training metrics saved to %s", NEURAL_METRICS_PATH)

    logger.info("=== Neural training complete ===")


if __name__ == "__main__":
    main()
