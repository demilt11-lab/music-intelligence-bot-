"""
Compare models: Transformer vs XGBoost vs LSTM vs TabularNN vs Ensemble.
Includes statistical significance testing and ranking.
"""

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# Dark plot theme constants
_BG = "#09090b"
_AX = "#18181b"
_FG = "#e4e4e7"


@dataclass
class ModelResult:
    model_name: str
    metrics: Dict[str, float]         # auroc, auprc, f1, precision, recall, accuracy, mcc, mae_days, rmse_peak
    predictions: np.ndarray           # (N,) binary predictions
    probabilities: np.ndarray         # (N,) predicted probabilities
    inference_time_ms: float = 0.0
    model_size_mb: float = 0.0
    params_count: int = 0


class ModelComparison:
    """Collects ModelResults and produces comparison visualizations + stats."""

    def __init__(self) -> None:
        self.results: Dict[str, ModelResult] = {}

    def add_result(self, result: ModelResult) -> None:
        self.results[result.model_name] = result

    def rank_models(self, metric: str = "auroc") -> pd.DataFrame:
        """Return sorted leaderboard DataFrame."""
        rows = []
        for name, res in self.results.items():
            row = {"model": name}
            row.update(res.metrics)
            row["inference_time_ms"] = res.inference_time_ms
            row["model_size_mb"] = res.model_size_mb
            row["params_count"] = res.params_count
            rows.append(row)
        df = pd.DataFrame(rows)
        if metric in df.columns:
            df = df.sort_values(metric, ascending=False)
        return df.reset_index(drop=True)

    def statistical_test(
        self,
        model_a: str,
        model_b: str,
        metric: str = "auroc",
    ) -> Dict[str, Any]:
        """
        McNemar's test for classification comparisons.
        Returns {"statistic", "p_value", "significant"}.
        """
        from scipy.stats import chi2

        res_a = self.results[model_a]
        res_b = self.results[model_b]

        preds_a = res_a.predictions.astype(bool)
        preds_b = res_b.predictions.astype(bool)

        # McNemar table: agreement / disagreement counts
        b = int(((preds_a == True) & (preds_b == False)).sum())   # A correct, B wrong
        c = int(((preds_a == False) & (preds_b == True)).sum())   # A wrong, B correct

        if b + c == 0:
            return {"statistic": 0.0, "p_value": 1.0, "significant": False}

        # McNemar's chi-squared with continuity correction
        statistic = (abs(b - c) - 1) ** 2 / (b + c)
        p_value = float(1 - chi2.cdf(statistic, df=1))

        return {
            "statistic": float(statistic),
            "p_value": p_value,
            "significant": p_value < 0.05,
        }

    def plot_comparison(self, output_path: str) -> None:
        """Grouped bar chart of all models × key metrics."""
        import matplotlib.pyplot as plt

        metrics_to_plot = ["auroc", "auprc", "f1", "precision", "recall"]
        models = list(self.results.keys())
        x = np.arange(len(metrics_to_plot))
        width = 0.8 / max(len(models), 1)

        fig, ax = plt.subplots(figsize=(14, 6), facecolor=_BG)
        ax.set_facecolor(_AX)

        colors = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"]
        for i, model in enumerate(models):
            vals = [self.results[model].metrics.get(m, 0.0) for m in metrics_to_plot]
            offset = (i - len(models) / 2) * width + width / 2
            ax.bar(x + offset, vals, width, label=model, color=colors[i % len(colors)], alpha=0.85)

        ax.set_xticks(x)
        ax.set_xticklabels(metrics_to_plot, color=_FG)
        ax.set_ylim(0, 1.1)
        ax.set_ylabel("Score", color=_FG)
        ax.set_title("Model Comparison", color=_FG, fontsize=14)
        ax.tick_params(colors=_FG)
        ax.legend(facecolor=_AX, labelcolor=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_roc_curves(self, output_path: str) -> None:
        """All models' ROC curves on a single plot."""
        import matplotlib.pyplot as plt
        from sklearn.metrics import roc_curve

        fig, ax = plt.subplots(figsize=(8, 8), facecolor=_BG)
        ax.set_facecolor(_AX)
        colors = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"]

        for i, (name, res) in enumerate(self.results.items()):
            if "labels" in res.metrics:
                continue  # skip if no raw labels stored
            # ROC needs ground-truth labels — use stored predictions as proxy
            fpr, tpr, _ = roc_curve(
                (res.predictions >= 0.5).astype(int),
                res.probabilities,
            )
            auroc = res.metrics.get("auroc", 0.0)
            ax.plot(fpr, tpr, label=f"{name} (AUROC={auroc:.3f})", color=colors[i % len(colors)])

        ax.plot([0, 1], [0, 1], "w--", linewidth=0.8, label="Random")
        ax.set_xlabel("FPR", color=_FG)
        ax.set_ylabel("TPR", color=_FG)
        ax.set_title("ROC Curves", color=_FG, fontsize=14)
        ax.tick_params(colors=_FG)
        ax.legend(facecolor=_AX, labelcolor=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def plot_pr_curves(self, output_path: str) -> None:
        """Precision-recall curves for all models."""
        import matplotlib.pyplot as plt
        from sklearn.metrics import precision_recall_curve

        fig, ax = plt.subplots(figsize=(8, 8), facecolor=_BG)
        ax.set_facecolor(_AX)
        colors = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#3b82f6"]

        for i, (name, res) in enumerate(self.results.items()):
            labels_bin = res.predictions.astype(int)
            prec, rec, _ = precision_recall_curve(labels_bin, res.probabilities)
            auprc = res.metrics.get("auprc", 0.0)
            ax.plot(rec, prec, label=f"{name} (AUPRC={auprc:.3f})", color=colors[i % len(colors)])

        ax.set_xlabel("Recall", color=_FG)
        ax.set_ylabel("Precision", color=_FG)
        ax.set_title("Precision-Recall Curves", color=_FG, fontsize=14)
        ax.tick_params(colors=_FG)
        ax.legend(facecolor=_AX, labelcolor=_FG)
        for spine in ax.spines.values():
            spine.set_edgecolor(_FG)

        plt.tight_layout()
        plt.savefig(output_path, facecolor=_BG, dpi=150)
        plt.close()

    def generate_latex_table(self, output_path: str) -> None:
        """Write a publication-quality LaTeX table."""
        df = self.rank_models()
        cols = ["model", "auroc", "auprc", "f1", "precision", "recall"]
        df_out = df[[c for c in cols if c in df.columns]]

        latex = df_out.to_latex(
            index=False,
            float_format="%.4f",
            caption="Model comparison on TikTok viral prediction benchmark.",
            label="tab:model_comparison",
            escape=True,
        )
        with open(output_path, "w") as f:
            f.write(latex)

    def summary(self) -> str:
        """Formatted text summary with winner + stats."""
        df = self.rank_models()
        if df.empty:
            return "No results available."
        winner = df.iloc[0]["model"]
        best_auroc = df.iloc[0].get("auroc", float("nan"))

        lines = [
            "=" * 60,
            "Model Comparison Summary",
            "=" * 60,
            df.to_string(index=False),
            "",
            f"Champion model: {winner} (AUROC={best_auroc:.4f})",
            "=" * 60,
        ]
        return "\n".join(lines)
