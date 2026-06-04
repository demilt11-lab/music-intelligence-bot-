"""
Feature importance analysis: XGBoost gain/split, permutation importance,
gradient-based saliency for neural models.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np

_BG = "#09090b"
_AX = "#18181b"
_FG = "#e4e4e7"

# Color groups for feature types
_GROUP_COLORS = {
    "audio":    "#8b5cf6",   # violet
    "temporal": "#10b981",   # emerald
    "metadata": "#f59e0b",   # amber
}


@dataclass
class FeatureImportanceResult:
    feature_names: List[str]
    importance_scores: np.ndarray   # (N,) normalized importance
    method: str
    model_name: str


class FeatureImportanceAnalyzer:
    """Computes feature importance via multiple methods."""

    def xgboost_importance(
        self,
        model: Any,   # ViralXGBoost
        importance_type: str = "gain",
    ) -> FeatureImportanceResult:
        """Extract and average XGBoost importance across all three models."""
        df = model.get_feature_importance(importance_type=importance_type)
        return FeatureImportanceResult(
            feature_names=df["feature"].tolist(),
            importance_scores=df["importance"].values,
            method=f"xgboost_{importance_type}",
            model_name="xgboost",
        )

    def permutation_importance(
        self,
        model: Any,
        X_val: np.ndarray,
        y_val: np.ndarray,
        n_repeats: int = 10,
    ) -> FeatureImportanceResult:
        """
        Sklearn permutation_importance wrapper.
        Works for any model with a predict_proba method.
        """
        from sklearn.inspection import permutation_importance as sk_perm
        from sklearn.metrics import roc_auc_score

        def scorer(estimator: Any, X: np.ndarray, y: np.ndarray) -> float:
            if hasattr(estimator, "predict_proba"):
                probs = estimator.predict_proba(X)
                if probs.ndim == 2:
                    probs = probs[:, 1]
            else:
                probs = estimator.predict(X)
            if len(np.unique(y)) < 2:
                return 0.5
            return float(roc_auc_score(y, probs))

        result = sk_perm(model, X_val, y_val, n_repeats=n_repeats, scoring=scorer)
        names = [f"f{i}" for i in range(X_val.shape[1])]
        return FeatureImportanceResult(
            feature_names=names,
            importance_scores=result.importances_mean,
            method="permutation",
            model_name=getattr(model, "__class__", type(model)).__name__,
        )

    def gradient_saliency(
        self,
        model: Any,   # nn.Module
        batch: Dict[str, Any],
        target_output: str = "viral_prob",
    ) -> FeatureImportanceResult:
        """
        Compute ∂output/∂input via autograd, aggregate absolute gradients over batch.
        Uses enable_grad context so this works even inside no_grad blocks.
        """
        import torch

        model.eval()
        feature_key = "timeseries"  # primary input for saliency
        if feature_key not in batch:
            feature_key = next(iter(batch))

        x_orig = batch[feature_key]
        grad_sum = torch.zeros_like(x_orig)

        with torch.enable_grad():
            x = x_orig.detach().requires_grad_(True)
            b = {k: (v if k != feature_key else x) for k, v in batch.items()}

            out = model(b[feature_key], b.get("lengths"))
            val = getattr(out, target_output)  # (B, 1) or (B,)
            scalar = val.mean()
            scalar.backward()

            if x.grad is not None:
                grad_sum = x.grad.detach().abs()

        # aggregate: mean absolute gradient over batch and time dims
        if grad_sum.ndim == 3:
            importance = grad_sum.mean(dim=(0, 1)).cpu().numpy()   # (D,)
        elif grad_sum.ndim == 2:
            importance = grad_sum.mean(dim=0).cpu().numpy()        # (D,)
        else:
            importance = grad_sum.cpu().numpy()

        names = [f"f{i}" for i in range(len(importance))]
        return FeatureImportanceResult(
            feature_names=names,
            importance_scores=importance,
            method="gradient_saliency",
            model_name=type(model).__name__,
        )

    def attention_importance(
        self,
        transformer_output: Any,   # ViralTransformerOutput
    ) -> Dict[str, np.ndarray]:
        """
        Extract cross-attention weights from transformer output, average over heads.
        Returns modality importance dict.
        """
        import torch
        weights = transformer_output.cross_attn_weights
        modality_importance: Dict[str, np.ndarray] = {}
        for key, tensor in weights.items():
            # tensor: (B, heads, ...) or (B, 1)
            if isinstance(tensor, torch.Tensor):
                avg = tensor.detach().abs().mean(dim=0).cpu().numpy()
                modality_importance[key] = avg.flatten()
        return modality_importance

    def plot_importance(
        self,
        result: FeatureImportanceResult,
        output_path: str,
        top_n: int = 20,
    ) -> None:
        """Horizontal bar chart of top_n features colored by group."""
        import matplotlib.pyplot as plt

        scores = result.importance_scores
        names = result.feature_names

        # sort descending, take top_n
        idx = np.argsort(scores)[::-1][:top_n]
        top_names = [names[i] for i in idx]
        top_scores = scores[idx]

        # assign colors by prefix
        def _color(name: str) -> str:
            if name.startswith("audio") or name.startswith("f") and int(name[1:] if name[1:].isdigit() else 0) < 64:
                return _GROUP_COLORS["audio"]
            if name.startswith("temporal") or name.startswith("ts"):
                return _GROUP_COLORS["temporal"]
            return _GROUP_COLORS["metadata"]

        colors = [_color(n) for n in top_names]

        fig, ax = plt.subplots(figsize=(10, max(4, top_n * 0.35)), facecolor=_BG)
        ax.set_facecolor(_AX)

        y_pos = np.arange(len(top_names))
        ax.barh(y_pos, top_scores[::-1], color=list(reversed(colors)), alpha=0.85)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(list(reversed(top_names)), color=_FG, fontsize=9)
        ax.set_xlabel("Importance", color=_FG)
        ax.set_title(
            f"Feature Importance — {result.model_name} ({result.method})",
            color=_FG,
            fontsize=12,
        )
        ax.tick_params(colors=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        # legend for groups
        from matplotlib.patches import Patch
        legend_elements = [Patch(facecolor=c, label=g) for g, c in _GROUP_COLORS.items()]
        ax.legend(handles=legend_elements, facecolor=_AX, labelcolor=_FG, loc="lower right")

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()
