"""Training curves, learning rate schedules, and experiment comparison plots."""

from dataclasses import dataclass, field
from typing import Any, List, Optional

import numpy as np

_BG = "#09090b"
_AX = "#18181b"
_FG = "#e4e4e7"
_COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899"]


@dataclass
class TrainingHistory:
    model_name: str
    train_losses: List[float] = field(default_factory=list)
    val_losses: List[float] = field(default_factory=list)
    train_aurocs: List[float] = field(default_factory=list)
    val_aurocs: List[float] = field(default_factory=list)
    learning_rates: List[float] = field(default_factory=list)
    epochs: List[int] = field(default_factory=list)


class TrainingVisualizer:
    """Dark-themed training visualization utilities."""

    @staticmethod
    def _apply_dark_style(fig: Any, axes: Any) -> None:
        """Apply consistent dark theme to figure and axes."""
        fig.patch.set_facecolor(_BG)
        for ax in (axes if hasattr(axes, "__iter__") else [axes]):
            ax.set_facecolor(_AX)
            ax.tick_params(colors=_FG)
            ax.xaxis.label.set_color(_FG)
            ax.yaxis.label.set_color(_FG)
            ax.title.set_color(_FG)
            for spine in ax.spines.values():
                spine.set_edgecolor(_FG)

    def plot_loss_curves(
        self,
        histories: List[TrainingHistory],
        output_path: str,
    ) -> None:
        """Subplots per model showing train vs val loss."""
        import matplotlib.pyplot as plt

        n = len(histories)
        fig, axes = plt.subplots(1, n, figsize=(6 * n, 5), facecolor=_BG)
        if n == 1:
            axes = [axes]

        for i, hist in enumerate(histories):
            ax = axes[i]
            ax.set_facecolor(_AX)
            epochs = hist.epochs or list(range(len(hist.train_losses)))
            ax.plot(epochs, hist.train_losses, color=_COLORS[0], label="train loss")
            ax.plot(epochs, hist.val_losses, color=_COLORS[1], label="val loss", linestyle="--")
            ax.set_title(hist.model_name, color=_FG)
            ax.set_xlabel("Epoch", color=_FG)
            ax.set_ylabel("Loss", color=_FG)
            ax.tick_params(colors=_FG)
            ax.legend(facecolor=_AX, labelcolor=_FG)
            for spine in ax.spines.values():
                spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_auroc_curves(
        self,
        histories: List[TrainingHistory],
        output_path: str,
    ) -> None:
        """Val AUROC over epochs, all models overlaid."""
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(10, 6), facecolor=_BG)
        ax.set_facecolor(_AX)

        for i, hist in enumerate(histories):
            epochs = hist.epochs or list(range(len(hist.val_aurocs)))
            ax.plot(
                epochs, hist.val_aurocs,
                color=_COLORS[i % len(_COLORS)],
                label=hist.model_name,
            )

        ax.set_xlabel("Epoch", color=_FG)
        ax.set_ylabel("Val AUROC", color=_FG)
        ax.set_title("Validation AUROC Over Training", color=_FG, fontsize=13)
        ax.tick_params(colors=_FG)
        ax.legend(facecolor=_AX, labelcolor=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_learning_rate(
        self,
        history: TrainingHistory,
        output_path: str,
    ) -> None:
        """LR schedule visualization."""
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(10, 4), facecolor=_BG)
        ax.set_facecolor(_AX)

        epochs = history.epochs or list(range(len(history.learning_rates)))
        ax.plot(epochs, history.learning_rates, color=_COLORS[2])
        ax.set_yscale("log")
        ax.set_xlabel("Epoch", color=_FG)
        ax.set_ylabel("Learning Rate (log)", color=_FG)
        ax.set_title(f"LR Schedule — {history.model_name}", color=_FG)
        ax.tick_params(colors=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_gradient_norms(
        self,
        norms: List[float],
        output_path: str,
    ) -> None:
        """Gradient norm over training steps."""
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(12, 4), facecolor=_BG)
        ax.set_facecolor(_AX)

        steps = list(range(len(norms)))
        ax.plot(steps, norms, color=_COLORS[3], linewidth=0.8, alpha=0.7)

        # smoothed trend
        if len(norms) > 20:
            window = max(1, len(norms) // 50)
            kernel = np.ones(window) / window
            smoothed = np.convolve(norms, kernel, mode="valid")
            ax.plot(
                range(window - 1, len(norms)),
                smoothed,
                color=_COLORS[0],
                linewidth=2,
                label="smoothed",
            )
            ax.legend(facecolor=_AX, labelcolor=_FG)

        ax.set_xlabel("Step", color=_FG)
        ax.set_ylabel("Gradient Norm", color=_FG)
        ax.set_title("Gradient Norms During Training", color=_FG)
        ax.tick_params(colors=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_cv_boxplot(
        self,
        cv_results: Any,   # CVResults
        metric: str,
        output_path: str,
    ) -> None:
        """Box plot of CV scores per model."""
        import matplotlib.pyplot as plt

        # collect per-model fold values
        from collections import defaultdict
        model_vals: dict = defaultdict(list)
        for fr in cv_results.fold_results:
            v = fr.val_metrics.get(metric)
            if v is not None and not np.isnan(v):
                model_vals[fr.model_name].append(v)

        if not model_vals:
            return

        models = list(model_vals.keys())
        data = [model_vals[m] for m in models]

        fig, ax = plt.subplots(figsize=(max(6, len(models) * 2), 6), facecolor=_BG)
        ax.set_facecolor(_AX)

        bp = ax.boxplot(
            data,
            patch_artist=True,
            labels=models,
            medianprops={"color": _FG, "linewidth": 2},
        )
        for i, patch in enumerate(bp["boxes"]):
            patch.set_facecolor(_COLORS[i % len(_COLORS)])
            patch.set_alpha(0.75)
        for whisker in bp["whiskers"]:
            whisker.set_color(_FG)
        for cap in bp["caps"]:
            cap.set_color(_FG)
        for flier in bp["fliers"]:
            flier.set(markerfacecolor=_FG, marker="o", alpha=0.5)

        ax.set_ylabel(metric.upper(), color=_FG)
        ax.set_title(f"CV {metric.upper()} by Model", color=_FG)
        ax.tick_params(colors=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_optuna_history(
        self,
        study: Any,
        output_path: str,
    ) -> None:
        """Optimization history + param importances."""
        import matplotlib.pyplot as plt

        trials = [t for t in study.trials if t.value is not None]
        values = [t.value for t in trials]
        best_so_far = np.maximum.accumulate(values) if values else []

        fig, axes = plt.subplots(1, 2, figsize=(14, 5), facecolor=_BG)
        ax1, ax2 = axes

        # optimization history
        ax1.set_facecolor(_AX)
        ax1.scatter(range(len(values)), values, color=_COLORS[0], s=10, alpha=0.5, label="trial")
        if len(best_so_far):
            ax1.plot(range(len(best_so_far)), best_so_far, color=_COLORS[1], linewidth=2, label="best")
        ax1.set_xlabel("Trial", color=_FG)
        ax1.set_ylabel("Objective", color=_FG)
        ax1.set_title("Optimization History", color=_FG)
        ax1.tick_params(colors=_FG)
        ax1.legend(facecolor=_AX, labelcolor=_FG)
        for spine in ax1.spines.values():
            spine.set_edgecolor(_FG)

        # param importance (simple variance-based)
        ax2.set_facecolor(_AX)
        if trials:
            all_params = trials[0].params.keys()
            importances = {}
            for p in all_params:
                vals_p = [t.params.get(p) for t in trials if t.params.get(p) is not None]
                try:
                    if all(isinstance(v, (int, float)) for v in vals_p):
                        importances[p] = float(np.std(vals_p))
                except Exception:
                    pass
            if importances:
                params_sorted = sorted(importances, key=importances.get, reverse=True)[:10]  # type: ignore
                ax2.barh(params_sorted, [importances[p] for p in params_sorted], color=_COLORS[2], alpha=0.8)
                ax2.set_xlabel("Std of Objective (proxy importance)", color=_FG)
                ax2.set_title("Param Importance (approx.)", color=_FG)
                ax2.tick_params(colors=_FG)
                for spine in ax2.spines.values():
                    spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()
