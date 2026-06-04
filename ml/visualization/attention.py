"""
Attention weight visualization for ViralTransformer.

Provides:
  - Cross-modal attention heatmaps (which modality attends to which)
  - Gate weight bar charts (per-sample modality importance)
  - Audio clip saliency maps (clip recommendation frame scores)
  - Training curve plots
  - Model comparison radar charts

All functions return matplotlib Figure objects so callers control display/saving.
"""

from typing import Dict, List, Optional

import matplotlib
matplotlib.use("Agg")  # non-interactive backend; change to TkAgg for notebooks
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import torch


MODALITY_COLORS = {
    "audio": "#4C72B0",
    "timeseries": "#DD8452",
    "text": "#55A868",
    "meta": "#C44E52",
}
MODALITY_LABELS = ["Audio", "Time-series", "Text", "Metadata"]


# ---------------------------------------------------------------------------
# Cross-modal attention heatmap
# ---------------------------------------------------------------------------

def plot_cross_attention_heatmap(
    cross_attn_weights: Dict[str, torch.Tensor],
    sample_idx: int = 0,
    title: str = "Cross-Modal Attention Weights",
) -> plt.Figure:
    """
    Visualizes all pairwise cross-attention weights as a 4×4 heatmap.

    Rows = query modality (what is attending)
    Cols = key modality  (what is being attended to)
    Diagonal = N/A (same modality)

    Args:
        cross_attn_weights: dict from ViralTransformerOutput.cross_attn_weights
                            keys = "{q}_from_{kv}", values = (B, 1) tensors
        sample_idx:         which sample in the batch to visualize

    Returns:
        matplotlib Figure
    """
    modalities = ["audio", "timeseries", "text", "meta"]
    matrix = np.full((4, 4), float("nan"))

    for i, q in enumerate(modalities):
        for j, kv in enumerate(modalities):
            if q == kv:
                continue
            key = f"{q}_from_{kv}"
            if key in cross_attn_weights:
                val = cross_attn_weights[key]
                if isinstance(val, torch.Tensor):
                    val = val.detach().cpu().numpy()
                matrix[i, j] = float(val[sample_idx].mean())

    fig, ax = plt.subplots(figsize=(7, 6))
    labels = ["Audio", "Time-series", "Text", "Metadata"]

    # Mask diagonal (NaN → grey)
    masked = np.ma.masked_invalid(matrix)
    im = ax.imshow(masked, cmap="Blues", vmin=0, vmax=1, aspect="auto")
    plt.colorbar(im, ax=ax, label="Attention weight")

    ax.set_xticks(range(4)); ax.set_xticklabels(labels, fontsize=10)
    ax.set_yticks(range(4)); ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlabel("Key Modality (being attended to)", fontsize=11)
    ax.set_ylabel("Query Modality (attending)", fontsize=11)
    ax.set_title(title, fontsize=13, fontweight="bold")

    # Annotate cells
    for i in range(4):
        for j in range(4):
            if not np.isnan(matrix[i, j]):
                ax.text(j, i, f"{matrix[i, j]:.2f}", ha="center", va="center",
                        fontsize=9, color="white" if matrix[i, j] > 0.6 else "black")
            else:
                ax.add_patch(plt.Rectangle((j - 0.5, i - 0.5), 1, 1,
                                            color="lightgrey", zorder=2))
                ax.text(j, i, "—", ha="center", va="center", fontsize=9, color="grey")

    plt.tight_layout()
    return fig


# ---------------------------------------------------------------------------
# Gate weight bar chart
# ---------------------------------------------------------------------------

def plot_gate_weights(
    gate_weights: torch.Tensor,
    sample_indices: Optional[List[int]] = None,
    title: str = "Modality Gate Weights",
) -> plt.Figure:
    """
    Bar chart of gated fusion weights per modality.

    If multiple sample_indices given, shows grouped bars.
    If None, shows mean ± std across the batch.

    Args:
        gate_weights:   (B, 4) tensor from ViralTransformerOutput.gate_weights
        sample_indices: specific sample indices to plot (None = plot batch mean)

    Returns:
        matplotlib Figure
    """
    gw = gate_weights.detach().cpu().numpy()  # (B, 4)

    if sample_indices is None:
        # Plot batch mean ± std
        means = gw.mean(axis=0)
        stds = gw.std(axis=0)

        fig, ax = plt.subplots(figsize=(7, 4))
        x = np.arange(4)
        bars = ax.bar(x, means, yerr=stds, capsize=5,
                      color=list(MODALITY_COLORS.values()), edgecolor="black", linewidth=0.8)
        ax.set_xticks(x); ax.set_xticklabels(MODALITY_LABELS, fontsize=11)
        ax.set_ylabel("Gate Weight", fontsize=11)
        ax.set_ylim(0, 1)
        ax.set_title(f"{title}\n(Batch mean ± std, n={len(gw)})", fontsize=12)
        ax.axhline(0.25, color="grey", linestyle="--", linewidth=0.8, label="Uniform (0.25)")
        ax.legend(fontsize=9)
    else:
        n_samples = len(sample_indices)
        fig, ax = plt.subplots(figsize=(max(7, 2 * n_samples), 4))
        x = np.arange(4)
        width = 0.8 / n_samples
        for idx_pos, s_idx in enumerate(sample_indices):
            offset = (idx_pos - n_samples / 2 + 0.5) * width
            ax.bar(x + offset, gw[s_idx], width=width,
                   label=f"Sample {s_idx}",
                   edgecolor="black", linewidth=0.5, alpha=0.85)
        ax.set_xticks(x); ax.set_xticklabels(MODALITY_LABELS, fontsize=11)
        ax.set_ylabel("Gate Weight", fontsize=11)
        ax.set_ylim(0, 1)
        ax.set_title(title, fontsize=12)
        ax.legend(fontsize=9)

    plt.tight_layout()
    return fig


# ---------------------------------------------------------------------------
# Clip saliency map (audio frame scores)
# ---------------------------------------------------------------------------

def plot_clip_saliency(
    clip_logits: torch.Tensor,
    sample_idx: int = 0,
    audio_mask: Optional[torch.Tensor] = None,
    ground_truth_segments: Optional[List[int]] = None,
    frame_duration_s: float = 0.032,
    title: str = "Clip Recommendation Saliency",
) -> plt.Figure:
    """
    Line plot of per-frame clip scores with ground-truth segment markers.

    Args:
        clip_logits:             (B, T) from ViralTransformerOutput.clip_logits
        sample_idx:              batch index to visualize
        audio_mask:              (B, T) True=pad — masks out padding frames
        ground_truth_segments:   list of labeled clip start frames
        frame_duration_s:        seconds per audio frame (for x-axis labeling)

    Returns:
        matplotlib Figure
    """
    logits = clip_logits[sample_idx].detach().cpu().numpy()  # (T,)

    if audio_mask is not None:
        mask = audio_mask[sample_idx].cpu().numpy()  # True=pad
        logits = np.where(mask, float("-inf"), logits)

    # Softmax to get probability distribution
    logits_finite = np.where(np.isfinite(logits), logits, -1e9)
    probs = np.exp(logits_finite - logits_finite.max())
    probs /= probs.sum()

    T = len(probs)
    times = np.arange(T) * frame_duration_s

    fig, ax = plt.subplots(figsize=(12, 4))
    ax.fill_between(times, probs, alpha=0.4, color="#4C72B0")
    ax.plot(times, probs, color="#4C72B0", linewidth=1.5, label="Clip score")

    # Mark top-3 predicted segments
    top3 = np.argsort(-probs)[:3]
    for rank, idx in enumerate(top3):
        ax.axvline(times[idx], color="#C44E52", linestyle="--",
                   linewidth=1.5, alpha=0.8,
                   label=f"Top-{rank+1} recommendation" if rank == 0 else "")
        ax.scatter(times[idx], probs[idx], color="#C44E52", s=60, zorder=5)

    # Mark ground truth if provided
    if ground_truth_segments:
        for seg in ground_truth_segments:
            if 0 <= seg < T:
                ax.axvline(times[seg], color="green", linestyle=":",
                           linewidth=2, alpha=0.9)
        ax.plot([], [], color="green", linestyle=":", linewidth=2, label="Ground truth segment")

    ax.set_xlabel("Time (seconds)", fontsize=11)
    ax.set_ylabel("Clip score (probability)", fontsize=11)
    ax.set_title(title, fontsize=13, fontweight="bold")
    ax.legend(fontsize=9, loc="upper right")
    ax.set_xlim(0, times[-1])
    plt.tight_layout()
    return fig


# ---------------------------------------------------------------------------
# Training curve plot
# ---------------------------------------------------------------------------

def plot_training_curves(
    history: Dict[str, List[float]],
    title: str = "Training History",
) -> plt.Figure:
    """
    Multi-panel training curve plot.

    Args:
        history: dict from Trainer.history with keys:
                 train_loss, val_loss, val_viral_auc, val_peak_mae, val_days_mae

    Returns:
        matplotlib Figure with 3 subplots
    """
    epochs = range(1, len(history.get("train_loss", [])) + 1)

    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    fig.suptitle(title, fontsize=14, fontweight="bold")

    # Loss
    ax = axes[0]
    ax.plot(epochs, history.get("train_loss", []), label="Train", color="#4C72B0")
    ax.plot(epochs, history.get("val_loss", []), label="Val", color="#DD8452")
    ax.set_title("Multi-task Loss"); ax.set_xlabel("Epoch"); ax.set_ylabel("Loss")
    ax.legend(); ax.grid(True, alpha=0.3)

    # Viral AUC
    ax = axes[1]
    ax.plot(epochs, history.get("val_viral_auc", []), color="#55A868")
    ax.axhline(0.5, color="grey", linestyle="--", linewidth=0.8, label="Random")
    ax.set_title("Viral AUROC (Val)"); ax.set_xlabel("Epoch"); ax.set_ylabel("AUROC")
    ax.set_ylim(0.4, 1.0); ax.legend(); ax.grid(True, alpha=0.3)

    # Regression MAE
    ax = axes[2]
    ax.plot(epochs, history.get("val_peak_mae", []), label="Peak MAE", color="#C44E52")
    ax.plot(epochs, history.get("val_days_mae", []), label="Days MAE", color="#8172B2")
    ax.set_title("Regression MAE (Val)"); ax.set_xlabel("Epoch"); ax.set_ylabel("MAE")
    ax.legend(); ax.grid(True, alpha=0.3)

    plt.tight_layout()
    return fig


# ---------------------------------------------------------------------------
# Model comparison radar chart
# ---------------------------------------------------------------------------

def plot_model_comparison_radar(
    model_metrics: Dict[str, Dict[str, float]],
    metric_names: Optional[List[str]] = None,
    title: str = "Model Comparison",
) -> plt.Figure:
    """
    Radar (spider) chart comparing multiple model variants across key metrics.

    Args:
        model_metrics: {model_name: {metric_name: value}}
                       All metric values should be in [0, 1] (normalize beforehand).
        metric_names:  which metrics to include (default: all from first model)

    Returns:
        matplotlib Figure
    """
    if metric_names is None:
        metric_names = list(next(iter(model_metrics.values())).keys())

    N = len(metric_names)
    angles = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
    angles += angles[:1]  # close the polygon

    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw={"polar": True})

    colors = plt.cm.tab10(np.linspace(0, 1, len(model_metrics)))  # type: ignore[arg-type]

    for (model_name, metrics), color in zip(model_metrics.items(), colors):
        values = [metrics.get(m, 0.0) for m in metric_names]
        values += values[:1]
        ax.plot(angles, values, "o-", linewidth=2, label=model_name, color=color)
        ax.fill(angles, values, alpha=0.1, color=color)

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(metric_names, fontsize=10)
    ax.set_ylim(0, 1)
    ax.set_title(title, fontsize=14, fontweight="bold", pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.35, 1.1), fontsize=10)
    ax.grid(True, alpha=0.4)

    plt.tight_layout()
    return fig
