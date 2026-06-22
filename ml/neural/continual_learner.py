"""
Continual Learner

Implements online learning that continuously improves the neural network
as new data arrives, without forgetting what it already knows.

Two complementary mechanisms:

1. Experience Replay Buffer
   Stores every labelled sample seen so far (capped at MAX_BUFFER).
   When a new sample arrives, we don't just learn from it alone — we also
   sample a mini-batch from the buffer and learn from both simultaneously.
   This prevents the network from "overwriting" knowledge about earlier trends
   with the current batch's distribution.

2. Elastic Weight Consolidation (EWC)
   After each major retraining phase (offline), we compute the Fisher Information
   of the model weights — which weights mattered most for past predictions.
   A regularisation penalty is added to future gradient steps proportional to
   how much each weight is changing from its "important" value.
   This prevents important weights from drifting even as the model adapts to
   new patterns.

Online update flow:
  New data arrives (feedback, ETL endpoint, API query)
  →  push to replay buffer
  →  sample mini-batch from buffer (old knowledge)
  →  construct batch = new sample + replayed samples
  →  forward pass + multi-task loss + EWC penalty
  →  backward pass with small learning rate (online_lr << offline_lr)
  →  checkpoint if update_count % CHECKPOINT_EVERY == 0

Key hyperparameters:
  online_lr           = 1e-4   (slow enough not to catastrophically forget)
  offline_lr          = 5e-4   (used during full batch retraining)
  ewc_lambda          = 0.4    (strength of EWC regularisation)
  replay_batch_size   = 32
  max_buffer_size     = 50_000
"""

from __future__ import annotations

import json
import queue
import random
import threading
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

from ml.config import MODEL_DIR, configure_logging
from ml.neural.network import MusicIntelligenceNet, compute_loss

logger = configure_logging("ml.neural.continual_learner")

# ── Hyperparameters ───────────────────────────────────────────────────────────

ONLINE_LR          = 1e-4
OFFLINE_LR         = 5e-4
EWC_LAMBDA         = 0.4
MAX_BUFFER         = 50_000
REPLAY_BATCH_SIZE  = 32
CHECKPOINT_EVERY   = 100    # gradient steps
FISHER_SAMPLES     = 512    # samples for Fisher estimation

ONLINE_MODEL_PATH  = MODEL_DIR / "music_intelligence_net_online.pt"
EWC_STATE_PATH     = MODEL_DIR / "ewc_state.pt"


# ── Experience Replay Buffer ──────────────────────────────────────────────────

class ReplayBuffer:
    """
    Ring buffer that stores (features_dict, targets_dict) samples.
    Thread-safe for concurrent reads/writes from the inference service.
    """

    def __init__(self, max_size: int = MAX_BUFFER):
        self._buffer: deque = deque(maxlen=max_size)
        self._lock = threading.Lock()

    def push(self, features: Dict[str, torch.Tensor], targets: Dict[str, torch.Tensor]):
        with self._lock:
            self._buffer.append((features, targets))

    def sample(self, n: int) -> List[Tuple[Dict, Dict]]:
        with self._lock:
            size = len(self._buffer)
            if size == 0:
                return []
            # sample indices first to avoid materialising the full deque
            buf_list = list(self._buffer)
        k = min(n, len(buf_list))
        indices = random.sample(range(len(buf_list)), k)
        return [buf_list[i] for i in indices]

    def __len__(self) -> int:
        with self._lock:
            return len(self._buffer)


# ── EWC State ─────────────────────────────────────────────────────────────────

class EWCState:
    """
    Stores Fisher Information matrix diagonal (approximation) and the
    parameter values at the time of the last consolidation.

    Fisher diagonal is computed as the average squared gradient of the
    log-likelihood with respect to each parameter, over a sample of
    training data. High Fisher value = this weight is important for past tasks.
    """

    def __init__(self):
        self.fisher: Dict[str, torch.Tensor] = {}
        self.means:  Dict[str, torch.Tensor] = {}

    def consolidate(
        self,
        model: MusicIntelligenceNet,
        dataloader: "torch.utils.data.DataLoader",
        device: torch.device,
        n_samples: int = FISHER_SAMPLES,
    ):
        """
        Compute Fisher diagonal approximation and store current parameter means.
        Should be called after each full offline training run.
        """
        logger.info("Computing EWC Fisher diagonal over %d samples...", n_samples)
        model.eval()

        fisher: Dict[str, torch.Tensor] = {
            n: torch.zeros_like(p)
            for n, p in model.named_parameters()
            if p.requires_grad
        }

        sampled = 0
        for batch in dataloader:
            if sampled >= n_samples:
                break

            feat, tgt = _unpack_batch(batch, device)
            out = model(**feat)

            # Use viral head as the primary loss for Fisher (most task-specific)
            y_viral = tgt.get("viral")
            if y_viral is not None:
                mask = y_viral != -1
                if mask.sum() > 0:
                    logits = out["viral_logits"][mask]
                    labels = y_viral[mask]
                    loss = F.cross_entropy(logits, labels)
                    model.zero_grad()
                    loss.backward()

                    for name, param in model.named_parameters():
                        if param.grad is not None:
                            fisher[name] += param.grad.detach() ** 2

                    sampled += mask.sum().item()

        # Normalise
        for name in fisher:
            fisher[name] /= max(sampled, 1)

        self.fisher = fisher
        self.means  = {
            n: p.detach().clone()
            for n, p in model.named_parameters()
            if p.requires_grad
        }
        logger.info("EWC consolidation complete. %d parameter tensors stored.", len(self.means))

    def penalty(self, model: MusicIntelligenceNet) -> torch.Tensor:
        """
        EWC penalty: sum over all parameters of
          λ * F_i * (θ_i - θ*_i)²
        where F_i = Fisher diagonal, θ*_i = parameter values after consolidation.
        """
        if not self.fisher:
            return torch.tensor(0.0)

        penalty: Optional[torch.Tensor] = None
        for name, param in model.named_parameters():
            if name in self.fisher:
                f = self.fisher[name].to(param.device)
                m = self.means[name].to(param.device)
                term = (f * (param - m) ** 2).sum()
                penalty = term if penalty is None else penalty + term

        if penalty is None:
            return torch.tensor(0.0)
        return EWC_LAMBDA * penalty

    def save(self, path: Path = EWC_STATE_PATH):
        torch.save({"fisher": self.fisher, "means": self.means}, path)
        logger.info("EWC state saved to %s", path)

    def load(self, path: Path = EWC_STATE_PATH):
        if not path.exists():
            logger.info("No EWC state found at %s — starting fresh.", path)
            return
        state = torch.load(path, map_location="cpu", weights_only=True)
        self.fisher = state["fisher"]
        self.means  = state["means"]
        logger.info("EWC state loaded from %s", path)


# ── Continual Learner ─────────────────────────────────────────────────────────

class ContinualLearner:
    """
    Wraps MusicIntelligenceNet with online learning capability.

    Usage:
        learner = ContinualLearner()
        learner.load()  # load saved model + EWC state

        # Runs after every incoming data point
        learner.online_update(features, targets)

        # Runs after full offline retrain
        learner.consolidate(train_loader)
        learner.save()
    """

    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model  = MusicIntelligenceNet().to(self.device)
        self.ewc    = EWCState()
        self.buffer = ReplayBuffer()

        self._optimizer    = torch.optim.Adam(self.model.parameters(), lr=ONLINE_LR)
        self._update_count = 0

        # Online updates are queued and processed by a single background thread.
        # This keeps inference threads non-blocking while serialising gradient steps.
        self._update_queue: queue.Queue = queue.Queue(maxsize=2048)
        self._worker_thread = threading.Thread(
            target=self._update_worker, daemon=True, name="online-learner"
        )
        self._worker_thread.start()

        logger.info("ContinualLearner initialised on device=%s", self.device)

    # ── Model I/O ─────────────────────────────────────────────────────────

    def save(self):
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), ONLINE_MODEL_PATH)
        self.ewc.save()
        logger.info("Model saved to %s", ONLINE_MODEL_PATH)

    def load(self):
        if ONLINE_MODEL_PATH.exists():
            self.model.load_state_dict(
                torch.load(ONLINE_MODEL_PATH, map_location=self.device, weights_only=True)
            )
            logger.info("Loaded model from %s", ONLINE_MODEL_PATH)
        self.ewc.load()
        self.model.train()

    # ── Inference ─────────────────────────────────────────────────────────

    @torch.no_grad()
    def predict(self, features: Dict[str, torch.Tensor]) -> Dict[str, Any]:
        self.model.eval()
        feat = {k: v.to(self.device) for k, v in features.items()
                if isinstance(v, torch.Tensor)}
        out = self.model(**feat)
        self.model.train()

        # Convert logits → probabilities
        viral_prob   = F.softmax(out["viral_logits"],   dim=-1)[:, 1]
        popular_prob = F.softmax(out["popular_logits"], dim=-1)[:, 1]
        trend_probs  = F.softmax(out["trend_logits"],   dim=-1)
        traj_probs   = F.softmax(out["traj_logits"],    dim=-1)

        trend_labels = ["NONE", "TRENDING", "POPULAR", "VIRAL"]
        traj_labels  = ["DECLINING", "STABLE", "GROWING", "ABOUT_TO_BREAK"]

        return {
            "viral_probability":   float(viral_prob[0]),
            "popular_probability": float(popular_prob[0]),
            "trend_label":         trend_labels[int(trend_probs[0].argmax())],
            "trend_probs":         {
                l: round(float(trend_probs[0, i]), 4)
                for i, l in enumerate(trend_labels)
            },
            "trajectory_label":    traj_labels[int(traj_probs[0].argmax())],
            "trajectory_probs":    {
                l: round(float(traj_probs[0, i]), 4)
                for i, l in enumerate(traj_labels)
            },
            "embeddings": out["embeddings"][0].cpu().numpy().tolist(),
        }

    # ── Background update worker ──────────────────────────────────────────

    def _update_worker(self):
        """Drains the update queue and runs gradient steps on the background thread."""
        while True:
            try:
                features, targets = self._update_queue.get(timeout=5)
            except queue.Empty:
                continue

            self.buffer.push(features, targets)
            self.model.train()
            self._optimizer.zero_grad()

            replayed = self.buffer.sample(REPLAY_BATCH_SIZE)
            all_feats, all_tgts = _collate_samples(
                [(features, targets)] + replayed, self.device
            )

            out = self.model(**all_feats)
            task_loss, per_task = compute_loss(out, all_tgts)
            ewc_penalty = self.ewc.penalty(self.model)
            (task_loss + ewc_penalty).backward()
            nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self._optimizer.step()

            self._update_count += 1
            self._update_queue.task_done()

            if self._update_count % CHECKPOINT_EVERY == 0:
                self.save()
                logger.info(
                    "Online checkpoint at update %d | losses: %s | EWC: %.4f",
                    self._update_count, per_task, float(ewc_penalty),
                )

    # ── Online update (called per new data point) ─────────────────────────

    def online_update(
        self,
        features: Dict[str, torch.Tensor],
        targets:  Dict[str, torch.Tensor],
    ) -> Dict[str, Any]:
        """
        Non-blocking online update — enqueues sample for background gradient step.
        Returns immediately; gradient step happens asynchronously.
        """
        try:
            self._update_queue.put_nowait((features, targets))
        except queue.Full:
            # Drop silently under extreme load rather than blocking inference
            logger.debug("Online update queue full — sample dropped")
        return {"queued": True, "queue_depth": self._update_queue.qsize()}

    # ── Offline consolidation (called after full retraining) ──────────────

    def consolidate(self, dataloader: "torch.utils.data.DataLoader"):
        """
        Full offline training pass + EWC consolidation.
        Call after completing ml:all:train.
        """
        self.model.train()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=OFFLINE_LR)

        total_steps = 0
        for epoch in range(3):   # 3 passes over the offline dataset
            epoch_loss = 0.0
            for batch in dataloader:
                feat, tgt = _unpack_batch(batch, self.device)
                optimizer.zero_grad()
                out = self.model(**feat)
                loss, _ = compute_loss(out, tgt)
                loss.backward()
                nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                optimizer.step()
                epoch_loss += float(loss)
                total_steps += 1

            logger.info("Offline epoch %d, mean loss=%.4f", epoch + 1, epoch_loss / max(total_steps, 1))

        # After offline training, consolidate: compute Fisher + save means
        self.ewc.consolidate(self.model, dataloader, self.device)
        self.save()
        logger.info("Offline training and EWC consolidation complete.")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _unpack_batch(
    batch: Tuple,
    device: torch.device,
) -> Tuple[Dict[str, torch.Tensor], Dict[str, torch.Tensor]]:
    """Unpacks a DataLoader batch tuple into (features, targets)."""
    feat, tgt = batch
    feat = {k: v.to(device) for k, v in feat.items() if isinstance(v, torch.Tensor)}
    tgt  = {k: v.to(device) for k, v in tgt.items()  if isinstance(v, torch.Tensor)}
    return feat, tgt


def _collate_samples(
    samples: List[Tuple[Dict, Dict]],
    device: torch.device,
) -> Tuple[Dict[str, torch.Tensor], Dict[str, torch.Tensor]]:
    """
    Collates a list of (features, targets) pairs into batched tensors.
    Missing keys are zero-padded.
    """
    if not samples:
        return {}, {}

    feat_keys = set()
    tgt_keys  = set()
    for f, t in samples:
        feat_keys.update(f.keys())
        tgt_keys.update(t.keys())

    batched_feat: Dict[str, torch.Tensor] = {}
    for key in feat_keys:
        tensors = []
        for f, _ in samples:
            v = f.get(key)
            if v is None:
                continue
            tensors.append(v if v.dim() > 1 else v.unsqueeze(0))
        if tensors:
            batched_feat[key] = torch.cat(tensors, dim=0).to(device)

    batched_tgt: Dict[str, torch.Tensor] = {}
    for key in tgt_keys:
        tensors = []
        for _, t in samples:
            v = t.get(key)
            if v is None:
                tensors.append(torch.tensor([-1], dtype=torch.long))
            else:
                tensors.append(v if v.dim() > 0 else v.unsqueeze(0))
        if tensors:
            batched_tgt[key] = torch.cat(tensors, dim=0).to(device)

    return batched_feat, batched_tgt
