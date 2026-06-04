"""
Training loop for ViralTransformer.

Implements:
  - AdamW optimizer with cosine annealing LR schedule + linear warmup
  - Gradient clipping
  - Mixed-precision training (torch.cuda.amp)
  - Multi-task loss with configurable weights
  - Early stopping based on validation viral AUC
  - Checkpoint saving (best model + periodic)
  - TensorBoard / dict-based metric logging
"""

import time
from pathlib import Path
from typing import Dict, Optional

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader

from ..models.viral_transformer import ViralTransformer
from .losses import MultiTaskLossWeights, ViralTransformerLoss


# ---------------------------------------------------------------------------
# Trainer config
# ---------------------------------------------------------------------------

class TrainerConfig:
    """Configuration for the ViralTransformer training loop."""

    def __init__(
        self,
        # Optimization
        learning_rate: float = 3e-4,
        weight_decay: float = 1e-2,
        beta1: float = 0.9,
        beta2: float = 0.98,
        max_grad_norm: float = 1.0,
        # Schedule
        num_epochs: int = 100,
        warmup_epochs: int = 5,
        batch_size: int = 256,
        # Loss
        loss_weights: Optional[MultiTaskLossWeights] = None,
        viral_pos_weight: float = 5.0,
        label_smoothing: float = 0.05,
        # Early stopping
        patience: int = 10,
        min_delta: float = 1e-4,
        # Checkpointing
        checkpoint_dir: str = "checkpoints",
        save_every_n_epochs: int = 10,
        # Mixed precision
        use_amp: bool = True,
        # Device
        device: str = "cuda",
    ):
        self.learning_rate = learning_rate
        self.weight_decay = weight_decay
        self.beta1 = beta1
        self.beta2 = beta2
        self.max_grad_norm = max_grad_norm
        self.num_epochs = num_epochs
        self.warmup_epochs = warmup_epochs
        self.batch_size = batch_size
        self.loss_weights = loss_weights or MultiTaskLossWeights()
        self.viral_pos_weight = viral_pos_weight
        self.label_smoothing = label_smoothing
        self.patience = patience
        self.min_delta = min_delta
        self.checkpoint_dir = Path(checkpoint_dir)
        self.save_every_n_epochs = save_every_n_epochs
        self.use_amp = use_amp and torch.cuda.is_available()
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")


# ---------------------------------------------------------------------------
# Trainer
# ---------------------------------------------------------------------------

class Trainer:
    """
    Manages the full training lifecycle for ViralTransformer.

    Usage:
        trainer = Trainer(model, train_loader, val_loader, config)
        history = trainer.train()
    """

    def __init__(
        self,
        model: ViralTransformer,
        train_loader: DataLoader,
        val_loader: DataLoader,
        config: Optional[TrainerConfig] = None,
    ):
        self.config = config or TrainerConfig()
        self.device = self.config.device

        self.model = model.to(self.device)
        self.train_loader = train_loader
        self.val_loader = val_loader

        self.loss_fn = ViralTransformerLoss(
            weights=self.config.loss_weights,
            viral_pos_weight=self.config.viral_pos_weight,
            label_smoothing=self.config.label_smoothing,
        ).to(self.device)

        self.optimizer = AdamW(
            self.model.parameters(),
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
            betas=(self.config.beta1, self.config.beta2),
        )

        # Cosine annealing after warmup
        self.scheduler = CosineAnnealingLR(
            self.optimizer,
            T_max=max(1, self.config.num_epochs - self.config.warmup_epochs),
            eta_min=self.config.learning_rate * 1e-2,
        )

        self.scaler = torch.cuda.amp.GradScaler(enabled=self.config.use_amp)

        # State
        self.epoch = 0
        self.best_val_auc = 0.0
        self.no_improve_count = 0
        self.history: Dict[str, list] = {
            "train_loss": [], "val_loss": [],
            "val_viral_auc": [], "val_peak_mae": [], "val_days_mae": [],
        }

        self.config.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # ── Public API ────────────────────────────────────────────────────────────

    def train(self) -> Dict[str, list]:
        """Run the full training loop. Returns training history dict."""
        for epoch in range(1, self.config.num_epochs + 1):
            self.epoch = epoch
            self._warmup_lr(epoch)

            t0 = time.time()
            train_metrics = self._train_epoch()
            val_metrics = self._val_epoch()

            self.history["train_loss"].append(train_metrics["loss"])
            self.history["val_loss"].append(val_metrics["loss"])
            self.history["val_viral_auc"].append(val_metrics.get("viral_auc", 0.0))
            self.history["val_peak_mae"].append(val_metrics.get("peak_mae", 0.0))
            self.history["val_days_mae"].append(val_metrics.get("days_mae", 0.0))

            elapsed = time.time() - t0
            self._log_epoch(epoch, train_metrics, val_metrics, elapsed)

            # LR schedule step (after warmup)
            if epoch > self.config.warmup_epochs:
                self.scheduler.step()

            # Checkpoint
            if epoch % self.config.save_every_n_epochs == 0:
                self._save_checkpoint(f"epoch_{epoch:03d}.pt")

            # Early stopping on val viral AUC
            val_auc = val_metrics.get("viral_auc", 0.0)
            if val_auc > self.best_val_auc + self.config.min_delta:
                self.best_val_auc = val_auc
                self.no_improve_count = 0
                self._save_checkpoint("best_model.pt")
            else:
                self.no_improve_count += 1
                if self.no_improve_count >= self.config.patience:
                    print(f"\nEarly stopping at epoch {epoch} (no improvement for {self.config.patience} epochs)")
                    break

        return self.history

    # ── Private: train one epoch ──────────────────────────────────────────────

    def _train_epoch(self) -> Dict[str, float]:
        self.model.train()
        total_loss = 0.0
        task_losses: Dict[str, float] = {"viral": 0.0, "days": 0.0, "peak": 0.0, "clip": 0.0}
        n_batches = 0

        for batch in self.train_loader:
            batch = {k: v.to(self.device, non_blocking=True) for k, v in batch.items()}

            self.optimizer.zero_grad(set_to_none=True)

            with torch.cuda.amp.autocast(enabled=self.config.use_amp):
                outputs = self._forward(batch)
                losses = self.loss_fn(
                    viral_logits=outputs.viral_logits,
                    days_to_viral=outputs.days_to_viral,
                    peak_score=outputs.peak_score,
                    clip_logits=outputs.clip_logits,
                    viral_labels=batch["viral"],
                    days_labels=batch["days_to_viral"],
                    peak_labels=batch["peak_score"],
                    clip_targets=batch.get("clip_target"),
                )

            self.scaler.scale(losses.total).backward()
            self.scaler.unscale_(self.optimizer)
            nn.utils.clip_grad_norm_(self.model.parameters(), self.config.max_grad_norm)
            self.scaler.step(self.optimizer)
            self.scaler.update()

            total_loss += losses.total.item()
            task_losses["viral"] += losses.viral.item()
            task_losses["days"] += losses.days.item()
            task_losses["peak"] += losses.peak.item()
            task_losses["clip"] += losses.clip.item()
            n_batches += 1

        n = max(n_batches, 1)
        return {
            "loss": total_loss / n,
            **{f"loss_{k}": v / n for k, v in task_losses.items()},
            "lr": self.optimizer.param_groups[0]["lr"],
        }

    # ── Private: validate one epoch ───────────────────────────────────────────

    @torch.no_grad()
    def _val_epoch(self) -> Dict[str, float]:
        self.model.eval()
        total_loss = 0.0
        all_viral_probs: list = []
        all_viral_labels: list = []
        all_peak_preds: list = []
        all_peak_labels: list = []
        all_days_preds: list = []
        all_days_labels: list = []
        n_batches = 0

        for batch in self.val_loader:
            batch = {k: v.to(self.device, non_blocking=True) for k, v in batch.items()}

            with torch.cuda.amp.autocast(enabled=self.config.use_amp):
                outputs = self._forward(batch)
                losses = self.loss_fn(
                    viral_logits=outputs.viral_logits,
                    days_to_viral=outputs.days_to_viral,
                    peak_score=outputs.peak_score,
                    clip_logits=outputs.clip_logits,
                    viral_labels=batch["viral"],
                    days_labels=batch["days_to_viral"],
                    peak_labels=batch["peak_score"],
                    clip_targets=batch.get("clip_target"),
                )

            total_loss += losses.total.item()
            all_viral_probs.append(outputs.viral_prob.cpu())
            all_viral_labels.append(batch["viral"].cpu())
            all_peak_preds.append(outputs.peak_score.cpu())
            all_peak_labels.append(batch["peak_score"].cpu())
            all_days_preds.append(outputs.days_to_viral.cpu())
            all_days_labels.append(batch["days_to_viral"].cpu())
            n_batches += 1

        n = max(n_batches, 1)
        metrics: Dict[str, float] = {"loss": total_loss / n}

        # AUROC for viral classification
        try:
            from sklearn.metrics import roc_auc_score
            import numpy as np
            probs = torch.cat(all_viral_probs).numpy().flatten()
            labels = torch.cat(all_viral_labels).numpy().flatten()
            if labels.sum() > 0:
                metrics["viral_auc"] = float(roc_auc_score(labels, probs))
        except ImportError:
            pass

        # MAE for regression tasks
        peak_preds = torch.cat(all_peak_preds).numpy().flatten()
        peak_labels = torch.cat(all_peak_labels).numpy().flatten()
        metrics["peak_mae"] = float(abs(peak_preds - peak_labels).mean())

        days_preds = torch.cat(all_days_preds).numpy().flatten()
        days_labels_arr = torch.cat(all_days_labels).numpy().flatten()
        viral_mask = torch.cat(all_viral_labels).numpy().flatten() > 0.5
        if viral_mask.sum() > 0:
            metrics["days_mae"] = float(abs(days_preds[viral_mask] - days_labels_arr[viral_mask]).mean())

        return metrics

    # ── Private: helpers ──────────────────────────────────────────────────────

    def _forward(self, batch: Dict[str, torch.Tensor]):
        return self.model(
            audio_features=batch["audio_features"],
            audio_mask=batch["audio_mask"],
            timeseries=batch["timeseries"],
            ts_mask=batch["ts_mask"],
            input_ids=batch["input_ids"],
            text_attention_mask=batch["text_attention_mask"],
            artist_ids=batch["artist_ids"],
            genre_ids=batch["genre_ids"],
            date_features=batch["date_features"],
            continuous_meta=batch["continuous_meta"],
            return_clip_logits="clip_target" in batch,
        )

    def _warmup_lr(self, epoch: int) -> None:
        """Linear LR warmup for the first `warmup_epochs` epochs."""
        if epoch <= self.config.warmup_epochs:
            lr = self.config.learning_rate * epoch / self.config.warmup_epochs
            for pg in self.optimizer.param_groups:
                pg["lr"] = lr

    def _save_checkpoint(self, filename: str) -> None:
        path = self.config.checkpoint_dir / filename
        torch.save(
            {
                "epoch": self.epoch,
                "model_state_dict": self.model.state_dict(),
                "optimizer_state_dict": self.optimizer.state_dict(),
                "scheduler_state_dict": self.scheduler.state_dict(),
                "best_val_auc": self.best_val_auc,
                "history": self.history,
            },
            path,
        )

    def load_checkpoint(self, path: str) -> None:
        """Load a previously saved checkpoint."""
        ckpt = torch.load(path, map_location=self.device)
        self.model.load_state_dict(ckpt["model_state_dict"])
        self.optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        self.scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        self.epoch = ckpt["epoch"]
        self.best_val_auc = ckpt["best_val_auc"]
        self.history = ckpt["history"]

    @staticmethod
    def _log_epoch(
        epoch: int,
        train: Dict[str, float],
        val: Dict[str, float],
        elapsed: float,
    ) -> None:
        auc = val.get("viral_auc", float("nan"))
        peak_mae = val.get("peak_mae", float("nan"))
        print(
            f"Epoch {epoch:3d} | "
            f"train_loss={train['loss']:.4f} | "
            f"val_loss={val['loss']:.4f} | "
            f"val_auc={auc:.4f} | "
            f"peak_mae={peak_mae:.2f} | "
            f"lr={train['lr']:.2e} | "
            f"{elapsed:.1f}s"
        )
