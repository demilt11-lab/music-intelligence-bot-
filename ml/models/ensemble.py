"""Stacking ensemble: combines Transformer + LSTM + TabularNN + XGBoost predictions."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
from torch import Tensor


@dataclass
class EnsembleConfig:
    model_names: List[str] = field(default_factory=lambda: ["transformer", "lstm", "tabular", "xgboost"])
    weights: Dict[str, float] = field(default_factory=dict)   # empty → equal weights
    meta_learner: str = "logistic"    # "logistic" | "mlp" | "weighted_avg"
    calibrate_probabilities: bool = True
    temperature: float = 1.0          # temperature scaling factor


@dataclass
class EnsemblePrediction:
    viral_prob: Tensor                            # (B,) calibrated final probability
    is_viral: Tensor                              # (B,) bool
    days_to_viral: Tensor                         # (B,)
    peak_score: Tensor                            # (B,)
    model_weights: Dict[str, float]
    confidence: Tensor                            # (B,) std-based uncertainty
    individual_predictions: Dict[str, Tensor]     # model_name → viral_prob (B,)


class EnsemblePredictor(nn.Module):
    """Weighted average combiner for viral probability predictions."""

    def __init__(self, model_names: List[str], weights: Optional[Dict[str, float]] = None) -> None:
        super().__init__()
        self.model_names = model_names
        if weights:
            self.weights = weights
        else:
            # equal weights
            w = 1.0 / len(model_names)
            self.weights = {n: w for n in model_names}

        # learnable log-weights (initialized to equal)
        self.log_weights = nn.Parameter(
            torch.zeros(len(model_names))
        )

    def weighted_average(self, preds: Dict[str, Tensor]) -> Tensor:
        """Weighted average of viral probabilities from each model."""
        w = torch.softmax(self.log_weights, dim=0)  # normalized weights
        stacked = torch.stack([preds[n] for n in self.model_names], dim=-1)  # (B, N)
        return (stacked * w).sum(dim=-1)  # (B,)

    def forward(self, preds: Dict[str, Tensor]) -> Tensor:
        return self.weighted_average(preds)


class ModelEnsemble:
    """Holds all trained models and combines their predictions."""

    def __init__(self, cfg: EnsembleConfig) -> None:
        self.cfg = cfg
        self.models: Dict[str, Any] = {}
        self.predictor = EnsemblePredictor(cfg.model_names, cfg.weights or None)
        self.meta_model: Optional[Any] = None  # sklearn meta-learner
        self.temperature = cfg.temperature

    def add_model(self, name: str, model: Any) -> None:
        self.models[name] = model

    def _run_model(self, name: str, batch: Dict[str, Any]) -> Dict[str, Tensor]:
        """Run a single model on a batch and return standardized outputs."""
        model = self.models[name]
        device = next(iter(batch.values())).device if isinstance(next(iter(batch.values())), Tensor) else torch.device("cpu")

        if name == "transformer":
            with torch.no_grad():
                out = model(**batch)
            return {
                "viral_prob": out.viral_prob.squeeze(-1),
                "days_to_viral": out.days_to_viral.squeeze(-1),
                "peak_score": out.peak_score.squeeze(-1),
            }
        elif name == "lstm":
            with torch.no_grad():
                out = model(batch["timeseries"], batch.get("lengths"))
            return {
                "viral_prob": out.viral_prob.squeeze(-1),
                "days_to_viral": out.days_to_viral.squeeze(-1),
                "peak_score": out.peak_score.squeeze(-1),
            }
        elif name == "tabular":
            with torch.no_grad():
                out = model(batch["tabular_features"])
            return {
                "viral_prob": out.viral_prob.squeeze(-1),
                "days_to_viral": out.days_to_viral.squeeze(-1),
                "peak_score": out.peak_score.squeeze(-1),
            }
        elif name == "xgboost":
            X = batch["tabular_features"].cpu().numpy()
            pred = model.predict(X)
            return {
                "viral_prob": torch.tensor(pred.viral_prob, dtype=torch.float32, device=device),
                "days_to_viral": torch.tensor(pred.days_to_viral, dtype=torch.float32, device=device),
                "peak_score": torch.tensor(pred.peak_score, dtype=torch.float32, device=device),
            }
        else:
            raise ValueError(f"Unknown model name: {name}")

    def _temperature_scale(self, prob: Tensor) -> Tensor:
        """Apply temperature scaling for calibration."""
        logit = torch.logit(prob.clamp(1e-6, 1 - 1e-6))
        return torch.sigmoid(logit / self.temperature)

    def predict(self, batch: Dict[str, Any]) -> EnsemblePrediction:
        """Run all models and combine predictions."""
        individual: Dict[str, Tensor] = {}
        days_preds: List[Tensor] = []
        peak_preds: List[Tensor] = []

        for name in self.cfg.model_names:
            if name not in self.models:
                continue
            out = self._run_model(name, batch)
            individual[name] = out["viral_prob"]
            days_preds.append(out["days_to_viral"])
            peak_preds.append(out["peak_score"])

        if self.cfg.meta_learner == "weighted_avg" or self.meta_model is None:
            viral_prob = self.predictor.weighted_average(individual)
        else:
            # stack predictions for meta-learner
            stacked = torch.stack(list(individual.values()), dim=-1).cpu().numpy()
            prob_np = self.meta_model.predict_proba(stacked)[:, 1]
            dev = next(iter(individual.values())).device
            viral_prob = torch.tensor(prob_np, dtype=torch.float32, device=dev)

        if self.cfg.calibrate_probabilities:
            viral_prob = self._temperature_scale(viral_prob)

        # ensemble regression outputs by simple mean
        days = torch.stack(days_preds, dim=0).mean(dim=0) if days_preds else torch.zeros_like(viral_prob)
        peak = torch.stack(peak_preds, dim=0).mean(dim=0) if peak_preds else torch.zeros_like(viral_prob)

        # confidence via std across models
        if len(individual) > 1:
            stk = torch.stack(list(individual.values()), dim=-1)  # (B, N)
            confidence = 1.0 - stk.std(dim=-1)  # high confidence = low disagreement
        else:
            confidence = torch.ones_like(viral_prob)

        return EnsemblePrediction(
            viral_prob=viral_prob,
            is_viral=viral_prob >= 0.5,
            days_to_viral=days,
            peak_score=peak,
            model_weights=dict(zip(self.cfg.model_names,
                                   torch.softmax(self.predictor.log_weights, 0).tolist())),
            confidence=confidence,
            individual_predictions=individual,
        )

    def fit_meta_learner(self, val_predictions: Dict[str, np.ndarray], val_labels: np.ndarray) -> None:
        """Train a logistic regression or MLP meta-learner on OOF predictions."""
        X = np.stack(list(val_predictions.values()), axis=-1)
        if self.cfg.meta_learner == "logistic":
            from sklearn.linear_model import LogisticRegression
            self.meta_model = LogisticRegression(C=1.0, max_iter=1000)
            self.meta_model.fit(X, val_labels)
        elif self.cfg.meta_learner == "mlp":
            from sklearn.neural_network import MLPClassifier
            self.meta_model = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=500)
            self.meta_model.fit(X, val_labels)

    def save(self, dir: str) -> None:
        """Save ensemble components to directory."""
        import cloudpickle
        Path(dir).mkdir(parents=True, exist_ok=True)
        torch.save(self.predictor.state_dict(), os.path.join(dir, "predictor.pt"))
        if self.meta_model is not None:
            with open(os.path.join(dir, "meta_model.pkl"), "wb") as f:
                cloudpickle.dump(self.meta_model, f)
        with open(os.path.join(dir, "config.pkl"), "wb") as f:
            cloudpickle.dump(self.cfg, f)

    @classmethod
    def load(cls, dir: str) -> "ModelEnsemble":
        """Load from directory."""
        import cloudpickle
        with open(os.path.join(dir, "config.pkl"), "rb") as f:
            cfg = cloudpickle.load(f)
        obj = cls(cfg)
        state = torch.load(os.path.join(dir, "predictor.pt"), map_location="cpu")
        obj.predictor.load_state_dict(state)
        meta_path = os.path.join(dir, "meta_model.pkl")
        if os.path.exists(meta_path):
            with open(meta_path, "rb") as f:
                obj.meta_model = cloudpickle.load(f)
        return obj
