"""
Evaluation pipeline: loads best model checkpoint, evaluates on test set,
generates plots and HTML report.
"""
import base64
import json
import logging
import pickle
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

import hydra
import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from omegaconf import DictConfig

matplotlib.use("Agg")

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dark plot theme
# ---------------------------------------------------------------------------
plt.rcParams.update(
    {
        "figure.facecolor": "#09090b",
        "axes.facecolor": "#18181b",
        "axes.edgecolor": "#3f3f46",
        "text.color": "#a1a1aa",
        "axes.labelcolor": "#a1a1aa",
        "xtick.color": "#71717a",
        "ytick.color": "#71717a",
        "grid.color": "#27272a",
    }
)

_ACCENT = "#7c3aed"
_TEXT = "#a1a1aa"


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class EvaluationResult:
    model_name: str
    metrics: dict = field(default_factory=dict)
    predictions: Optional[np.ndarray] = None
    probabilities: Optional[np.ndarray] = None
    y_true: Optional[np.ndarray] = None
    feature_names: list[str] = field(default_factory=list)
    model: Any = None


# ---------------------------------------------------------------------------
# Model loader
# ---------------------------------------------------------------------------


class ModelLoader:
    """Loads models from disk or MLflow registry."""

    @staticmethod
    def load_checkpoint(path: str) -> Any:
        """Unpickle model from checkpoint file."""
        with open(path, "rb") as f:
            payload = pickle.load(f)
        # Checkpoint format: {"model": ..., "metadata": ...}
        if isinstance(payload, dict) and "model" in payload:
            return payload["model"]
        return payload

    @staticmethod
    def load_checkpoint_with_metadata(path: str) -> tuple[Any, dict]:
        """Return (model, metadata) from checkpoint."""
        with open(path, "rb") as f:
            payload = pickle.load(f)
        if isinstance(payload, dict) and "model" in payload:
            return payload["model"], payload.get("metadata", {})
        return payload, {}

    @staticmethod
    def load_from_registry(model_name: str, stage: str = "Production") -> Any:
        """Load model from MLflow model registry."""
        try:
            import mlflow.sklearn

            model_uri = f"models:/{model_name}/{stage}"
            return mlflow.sklearn.load_model(model_uri)
        except Exception as exc:
            log.error("Failed to load model from registry: %s", exc)
            raise


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------


class Evaluator:
    """Computes evaluation metrics for a trained model."""

    def evaluate(
        self,
        model: Any,
        X_test: np.ndarray,
        y_test: np.ndarray,
        cfg: DictConfig,
        model_name: str = "model",
        feature_names: Optional[list[str]] = None,
    ) -> EvaluationResult:
        threshold = cfg.evaluation.thresholds.viral_classification

        y_prob = self._get_probabilities(model, X_test)
        y_pred = (y_prob >= threshold).astype(int)

        metrics = self.compute_classification_metrics(y_test, y_pred, y_prob)
        cm = self.compute_confusion_matrix(y_test, y_pred)
        metrics["confusion_matrix"] = cm.tolist()

        return EvaluationResult(
            model_name=model_name,
            metrics=metrics,
            predictions=y_pred,
            probabilities=y_prob,
            y_true=y_test,
            feature_names=feature_names or [],
            model=model,
        )

    def compute_classification_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_prob: np.ndarray,
    ) -> dict:
        from sklearn.metrics import (
            accuracy_score,
            average_precision_score,
            f1_score,
            matthews_corrcoef,
            precision_score,
            recall_score,
            roc_auc_score,
        )

        return {
            "auroc": float(roc_auc_score(y_true, y_prob)),
            "auprc": float(average_precision_score(y_true, y_prob)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "mcc": float(matthews_corrcoef(y_true, y_pred)),
        }

    @staticmethod
    def compute_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> np.ndarray:
        from sklearn.metrics import confusion_matrix

        return confusion_matrix(y_true, y_pred)

    @staticmethod
    def _get_probabilities(model: Any, X: np.ndarray) -> np.ndarray:
        if hasattr(model, "predict_proba"):
            return model.predict_proba(X)[:, 1]
        if hasattr(model, "predict"):
            return model.predict(X).ravel()
        import torch

        if isinstance(model, torch.nn.Module):
            model.eval()
            with torch.no_grad():
                t = torch.tensor(X, dtype=torch.float32)
                return model(t).cpu().numpy().ravel()
        raise ValueError(f"Cannot extract probabilities from {type(model)}")


# ---------------------------------------------------------------------------
# Plot generator
# ---------------------------------------------------------------------------


class PlotGenerator:
    """Generates evaluation plots with dark theme."""

    def plot_confusion_matrix(
        self,
        cm: np.ndarray,
        labels: list[str],
        output_path: str,
    ) -> None:
        import seaborn as sns

        fig, ax = plt.subplots(figsize=(6, 5))
        sns.heatmap(
            cm,
            annot=True,
            fmt="d",
            cmap="Purples",
            xticklabels=labels,
            yticklabels=labels,
            ax=ax,
            linewidths=0.5,
        )
        ax.set_xlabel("Predicted", color=_TEXT)
        ax.set_ylabel("Actual", color=_TEXT)
        ax.set_title("Confusion Matrix", color=_TEXT)
        plt.tight_layout()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(output_path, dpi=120, bbox_inches="tight")
        plt.close(fig)

    def plot_roc_curve(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        output_path: str,
    ) -> None:
        from sklearn.metrics import auc, roc_curve

        fpr, tpr, _ = roc_curve(y_true, y_prob)
        roc_auc = auc(fpr, tpr)

        fig, ax = plt.subplots(figsize=(7, 5))
        ax.plot(fpr, tpr, color=_ACCENT, lw=2, label=f"AUC = {roc_auc:.3f}")
        ax.plot([0, 1], [0, 1], color="#3f3f46", lw=1, linestyle="--")
        ax.set_xlim([0, 1])
        ax.set_ylim([0, 1.02])
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title("ROC Curve")
        ax.legend(loc="lower right", facecolor="#18181b", edgecolor="#3f3f46")
        plt.tight_layout()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(output_path, dpi=120, bbox_inches="tight")
        plt.close(fig)

    def plot_precision_recall_curve(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        output_path: str,
    ) -> None:
        from sklearn.metrics import auc, precision_recall_curve

        precision, recall, _ = precision_recall_curve(y_true, y_prob)
        pr_auc = auc(recall, precision)

        fig, ax = plt.subplots(figsize=(7, 5))
        ax.plot(recall, precision, color=_ACCENT, lw=2, label=f"AUPRC = {pr_auc:.3f}")
        ax.set_xlabel("Recall")
        ax.set_ylabel("Precision")
        ax.set_title("Precision-Recall Curve")
        ax.legend(facecolor="#18181b", edgecolor="#3f3f46")
        plt.tight_layout()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(output_path, dpi=120, bbox_inches="tight")
        plt.close(fig)

    def plot_feature_importance(
        self,
        model: Any,
        feature_names: list[str],
        output_path: str,
        top_n: int = 20,
    ) -> None:
        importances: Optional[np.ndarray] = None

        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
        elif hasattr(model, "coef_"):
            importances = np.abs(model.coef_).ravel()

        if importances is None:
            log.warning("Model does not expose feature_importances_; skipping plot.")
            return

        idx = np.argsort(importances)[-top_n:]
        names = [feature_names[i] if i < len(feature_names) else f"f{i}" for i in idx]
        vals = importances[idx]

        fig, ax = plt.subplots(figsize=(8, max(4, top_n * 0.35)))
        ax.barh(names, vals, color=_ACCENT)
        ax.set_xlabel("Importance")
        ax.set_title(f"Top {top_n} Feature Importances")
        plt.tight_layout()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(output_path, dpi=120, bbox_inches="tight")
        plt.close(fig)

    def plot_calibration_curve(
        self,
        y_true: np.ndarray,
        y_prob: np.ndarray,
        output_path: str,
    ) -> None:
        from sklearn.calibration import calibration_curve

        fraction_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=10)

        fig, ax = plt.subplots(figsize=(7, 5))
        ax.plot(mean_pred, fraction_pos, "s-", color=_ACCENT, label="Model")
        ax.plot([0, 1], [0, 1], "--", color="#3f3f46", label="Perfectly calibrated")
        ax.set_xlabel("Mean Predicted Probability")
        ax.set_ylabel("Fraction of Positives")
        ax.set_title("Calibration Curve")
        ax.legend(facecolor="#18181b", edgecolor="#3f3f46")
        plt.tight_layout()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(output_path, dpi=120, bbox_inches="tight")
        plt.close(fig)


# ---------------------------------------------------------------------------
# Model comparator
# ---------------------------------------------------------------------------


class ModelComparator:
    """Compares multiple EvaluationResult objects."""

    @staticmethod
    def compare(results: dict[str, "EvaluationResult"]) -> pd.DataFrame:
        rows = []
        for name, r in results.items():
            row = {"model": name}
            row.update({k: v for k, v in r.metrics.items() if isinstance(v, float)})
            rows.append(row)
        return pd.DataFrame(rows).set_index("model")

    @staticmethod
    def select_best(
        results: dict[str, "EvaluationResult"], metric: str = "auroc"
    ) -> str:
        return max(results, key=lambda k: results[k].metrics.get(metric, 0.0))


# ---------------------------------------------------------------------------
# Report generator
# ---------------------------------------------------------------------------


class ReportGenerator:
    """Generates a self-contained HTML evaluation report."""

    def generate_html(
        self,
        eval_result: EvaluationResult,
        model_name: str,
        output_path: str,
    ) -> None:
        from datetime import datetime

        metrics_html = self._metrics_table(eval_result.metrics)
        plots_html = self._embedded_plots(eval_result)

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Evaluation Report — {model_name}</title>
<style>
  body {{ background:#09090b; color:#a1a1aa; font-family:system-ui,sans-serif; margin:2rem; }}
  h1,h2 {{ color:#e4e4e7; }}
  table {{ border-collapse:collapse; width:100%; max-width:600px; }}
  th,td {{ border:1px solid #3f3f46; padding:.5rem 1rem; text-align:left; }}
  th {{ background:#18181b; color:#e4e4e7; }}
  td {{ background:#18181b; }}
  .plot {{ margin:1.5rem 0; }}
  img {{ max-width:100%; border:1px solid #3f3f46; border-radius:6px; }}
  .badge {{ display:inline-block; background:#7c3aed; color:#fff;
            padding:.2rem .6rem; border-radius:4px; font-size:.85rem; }}
</style>
</head>
<body>
<h1>Model Evaluation Report</h1>
<p>Model: <span class="badge">{model_name}</span>
   &nbsp; Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>

<h2>Metrics</h2>
{metrics_html}

<h2>Plots</h2>
{plots_html}
</body>
</html>"""

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
        log.info("HTML report saved to %s", output_path)

    def _metrics_table(self, metrics: dict) -> str:
        rows = ""
        for k, v in metrics.items():
            if isinstance(v, float):
                rows += f"<tr><td>{k}</td><td>{v:.4f}</td></tr>"
        return f"<table><tr><th>Metric</th><th>Value</th></tr>{rows}</table>"

    def _embedded_plots(self, result: EvaluationResult) -> str:
        if result.y_true is None or result.probabilities is None:
            return ""

        plotter = PlotGenerator()
        sections = ""

        def _fig_to_b64(fn, *args, **kwargs) -> str:
            buf = BytesIO()
            fig, ax = plt.subplots(figsize=(7, 5))
            plt.close(fig)
            # Each plot method saves to a temp path — embed via in-memory buffer
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
            fn(*args, output_path=tmp_path, **kwargs)
            with open(tmp_path, "rb") as f:
                data = base64.b64encode(f.read()).decode()
            Path(tmp_path).unlink(missing_ok=True)
            return data

        y_true = result.y_true
        y_prob = result.probabilities
        y_pred = result.predictions

        for title, fn, kwargs in [
            ("ROC Curve", plotter.plot_roc_curve, {"y_true": y_true, "y_prob": y_prob}),
            ("Precision-Recall Curve", plotter.plot_precision_recall_curve, {"y_true": y_true, "y_prob": y_prob}),
            ("Calibration Curve", plotter.plot_calibration_curve, {"y_true": y_true, "y_prob": y_prob}),
        ]:
            data = _fig_to_b64(fn, **kwargs)
            sections += (
                f'<div class="plot"><h3>{title}</h3>'
                f'<img src="data:image/png;base64,{data}"></div>'
            )

        if result.model is not None and result.feature_names:
            data = _fig_to_b64(
                plotter.plot_feature_importance,
                model=result.model,
                feature_names=result.feature_names,
                top_n=20,
            )
            sections += (
                f'<div class="plot"><h3>Feature Importance</h3>'
                f'<img src="data:image/png;base64,{data}"></div>'
            )

        return sections


# ---------------------------------------------------------------------------
# Evaluation pipeline
# ---------------------------------------------------------------------------


class EvaluationPipeline:
    """Orchestrates evaluation of all trained checkpoints."""

    def run(self, cfg: DictConfig) -> None:
        log.info("=== Evaluation Pipeline ===")

        processed_dir = Path(cfg.paths.processed_dir)
        checkpoints_dir = Path(cfg.paths.checkpoints_dir)
        reports_dir = Path(cfg.paths.reports_dir)
        reports_dir.mkdir(parents=True, exist_ok=True)

        # 1. Load test set ---------------------------------------------------
        test_df = pd.read_parquet(processed_dir / "test.parquet", engine="pyarrow")
        exclude = {"id", "entity_id", "entity_type", "computed_at", "is_viral"}
        feature_cols = [c for c in test_df.columns if c not in exclude and test_df[c].dtype != object]
        X_test = test_df[feature_cols].values.astype(np.float32)
        y_test = test_df["is_viral"].values
        log.info("Test set: %d samples, %d features", len(X_test), len(feature_cols))

        # 2. Load all checkpoints --------------------------------------------
        loader = ModelLoader()
        evaluator = Evaluator()
        plotter = PlotGenerator()
        results: dict[str, EvaluationResult] = {}

        ckpt_files = list(checkpoints_dir.glob("*_best.pkl"))
        if not ckpt_files:
            log.warning("No checkpoint files found in %s", checkpoints_dir)
            return

        for ckpt_path in ckpt_files:
            model_name = ckpt_path.stem.replace("_best", "")
            log.info("Evaluating %s…", model_name)
            try:
                model, metadata = loader.load_checkpoint_with_metadata(str(ckpt_path))
                feat_names = metadata.get("feature_cols", feature_cols)
                result = evaluator.evaluate(model, X_test, y_test, cfg, model_name=model_name, feature_names=feat_names)
                results[model_name] = result
            except Exception as exc:
                log.error("Failed to evaluate %s: %s", model_name, exc)

        # 3. Generate plots --------------------------------------------------
        for name, result in results.items():
            if result.y_true is None:
                continue
            if cfg.evaluation.plots.roc_curve:
                plotter.plot_roc_curve(result.y_true, result.probabilities, str(reports_dir / f"{name}_roc.png"))
            if cfg.evaluation.plots.precision_recall_curve:
                plotter.plot_precision_recall_curve(result.y_true, result.probabilities, str(reports_dir / f"{name}_pr.png"))
            if cfg.evaluation.plots.calibration_curve:
                plotter.plot_calibration_curve(result.y_true, result.probabilities, str(reports_dir / f"{name}_cal.png"))
            if cfg.evaluation.plots.confusion_matrix and result.predictions is not None:
                cm = evaluator.compute_confusion_matrix(result.y_true, result.predictions)
                plotter.plot_confusion_matrix(cm, ["Not Viral", "Viral"], str(reports_dir / f"{name}_cm.png"))
            if cfg.evaluation.plots.feature_importance and result.model is not None:
                plotter.plot_feature_importance(result.model, result.feature_names, str(reports_dir / f"{name}_fi.png"))

        # 4. Compare models --------------------------------------------------
        comparator = ModelComparator()
        comparison_df = comparator.compare(results)
        best_name = comparator.select_best(results, metric="auroc")
        log.info("Best model: %s", best_name)

        # 5. Generate HTML reports -------------------------------------------
        reporter = ReportGenerator()
        for name, result in results.items():
            reporter.generate_html(result, name, str(reports_dir / f"{name}_report.html"))

        # 6. Log to MLflow ---------------------------------------------------
        try:
            import mlflow

            mlflow.set_tracking_uri(cfg.registry.tracking_uri)
            mlflow.set_experiment(cfg.registry.experiment_name)
            with mlflow.start_run(run_name="evaluation"):
                for name, result in results.items():
                    for k, v in result.metrics.items():
                        if isinstance(v, float):
                            mlflow.log_metric(f"{name}_{k}", v)
                for rpt in reports_dir.glob("*.html"):
                    mlflow.log_artifact(str(rpt))
        except Exception as exc:
            log.warning("MLflow logging skipped: %s", exc)

        # 7. Print summary ---------------------------------------------------
        print("\n=== Evaluation Summary ===")
        print(comparison_df.to_string())
        print(f"\nBest model: {best_name}")
        log.info("=== Evaluation Pipeline Complete ===")


@hydra.main(config_path="../conf", config_name="config", version_base=None)
def main(cfg: DictConfig) -> None:
    EvaluationPipeline().run(cfg)


if __name__ == "__main__":
    main()
