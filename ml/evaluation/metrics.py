"""
Evaluation metrics for all four ViralTransformer tasks.

Tasks:
  1. Viral classification  — AUROC, AUPRC, F1@threshold, precision, recall
  2. Days to viral         — MAE, RMSE, MedAE, within-7d accuracy
  3. Peak score            — MAE, RMSE, R², Spearman ρ
  4. Clip recommendation   — nDCG@k, Hit Rate@k, MRR
"""

from typing import Dict, List, Optional, Tuple

import numpy as np
import torch


# ---------------------------------------------------------------------------
# Task 1: Viral classification
# ---------------------------------------------------------------------------

def compute_viral_classification_metrics(
    probs: np.ndarray,
    labels: np.ndarray,
    threshold: float = 0.5,
) -> Dict[str, float]:
    """
    Args:
        probs:     (N,) predicted probabilities in [0, 1]
        labels:    (N,) binary ground-truth labels {0, 1}
        threshold: decision threshold for binary predictions

    Returns:
        dict with: auroc, auprc, f1, precision, recall, accuracy,
                   average_precision, brier_score
    """
    from sklearn.metrics import (
        average_precision_score,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )

    metrics: Dict[str, float] = {}
    preds = (probs >= threshold).astype(int)

    # Handle degenerate case (all one class)
    if len(np.unique(labels)) < 2:
        metrics["auroc"] = float("nan")
        metrics["auprc"] = float("nan")
    else:
        metrics["auroc"] = float(roc_auc_score(labels, probs))
        metrics["auprc"] = float(average_precision_score(labels, probs))

    metrics["f1"] = float(f1_score(labels, preds, zero_division=0))
    metrics["precision"] = float(precision_score(labels, preds, zero_division=0))
    metrics["recall"] = float(recall_score(labels, preds, zero_division=0))
    metrics["accuracy"] = float((preds == labels).mean())

    # Brier score: MSE between predicted probabilities and labels
    metrics["brier_score"] = float(((probs - labels) ** 2).mean())

    # Calibration: expected calibration error (ECE) — 10 bins
    metrics["ece"] = _compute_ece(probs, labels, n_bins=10)

    return metrics


def _compute_ece(probs: np.ndarray, labels: np.ndarray, n_bins: int = 10) -> float:
    """Expected Calibration Error."""
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(probs)
    for lo, hi in zip(bins[:-1], bins[1:]):
        mask = (probs >= lo) & (probs < hi)
        if mask.sum() == 0:
            continue
        acc = labels[mask].mean()
        conf = probs[mask].mean()
        ece += (mask.sum() / n) * abs(acc - conf)
    return float(ece)


# ---------------------------------------------------------------------------
# Task 2: Days to viral (regression, masked to viral=1 samples)
# ---------------------------------------------------------------------------

def compute_days_to_viral_metrics(
    preds: np.ndarray,
    labels: np.ndarray,
    viral_mask: Optional[np.ndarray] = None,
) -> Dict[str, float]:
    """
    Args:
        preds:       (N,) predicted days
        labels:      (N,) true days to viral event
        viral_mask:  (N,) bool — True for viral samples (computes metrics only on these)

    Returns:
        dict with: mae, rmse, median_ae, within_7d_acc, within_14d_acc, r2
    """
    if viral_mask is not None:
        preds = preds[viral_mask]
        labels = labels[viral_mask]

    if len(preds) == 0:
        return {"mae": float("nan"), "rmse": float("nan"), "median_ae": float("nan"),
                "within_7d_acc": float("nan"), "within_14d_acc": float("nan"), "r2": float("nan")}

    errors = np.abs(preds - labels)
    metrics: Dict[str, float] = {
        "mae": float(errors.mean()),
        "rmse": float(np.sqrt(((preds - labels) ** 2).mean())),
        "median_ae": float(np.median(errors)),
        "within_7d_acc": float((errors <= 7).mean()),
        "within_14d_acc": float((errors <= 14).mean()),
    }

    # R² score
    ss_res = ((labels - preds) ** 2).sum()
    ss_tot = ((labels - labels.mean()) ** 2).sum()
    metrics["r2"] = float(1 - ss_res / ss_tot) if ss_tot > 0 else float("nan")

    return metrics


# ---------------------------------------------------------------------------
# Task 3: Peak score regression
# ---------------------------------------------------------------------------

def compute_peak_score_metrics(
    preds: np.ndarray,
    labels: np.ndarray,
) -> Dict[str, float]:
    """
    Args:
        preds:  (N,) predicted peak scores in [0, 100]
        labels: (N,) ground-truth peak scores in [0, 100]

    Returns:
        dict with: mae, rmse, r2, spearman_rho, pearson_r, within_5pt, within_10pt
    """
    from scipy import stats

    errors = np.abs(preds - labels)
    ss_res = ((labels - preds) ** 2).sum()
    ss_tot = ((labels - labels.mean()) ** 2).sum()
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else float("nan")

    spearman_rho, _ = stats.spearmanr(preds, labels)
    pearson_r, _ = stats.pearsonr(preds, labels)

    return {
        "mae": float(errors.mean()),
        "rmse": float(np.sqrt(((preds - labels) ** 2).mean())),
        "r2": r2,
        "spearman_rho": float(spearman_rho),
        "pearson_r": float(pearson_r),
        "within_5pt": float((errors <= 5).mean()),
        "within_10pt": float((errors <= 10).mean()),
    }


# ---------------------------------------------------------------------------
# Task 4: Clip recommendation (ranking metrics)
# ---------------------------------------------------------------------------

def compute_clip_metrics(
    logits: np.ndarray,
    targets: np.ndarray,
    k_values: Optional[List[int]] = None,
) -> Dict[str, float]:
    """
    Ranking metrics for clip recommendation.

    Args:
        logits:   (N, T) per-frame logit scores
        targets:  (N, T) binary ground-truth (1 = good clip position)
        k_values: k values for nDCG@k and Hit Rate@k (default [1, 3, 5])

    Returns:
        dict with: ndcg@k, hit_rate@k, mrr for each k
    """
    if k_values is None:
        k_values = [1, 3, 5]

    metrics: Dict[str, float] = {}
    N = logits.shape[0]

    mrr_scores = []
    for n in range(N):
        scores = logits[n]
        gt = targets[n]
        if gt.sum() == 0:
            continue
        ranked = np.argsort(-scores)
        for rank, idx in enumerate(ranked, 1):
            if gt[idx] > 0:
                mrr_scores.append(1.0 / rank)
                break

    metrics["mrr"] = float(np.mean(mrr_scores)) if mrr_scores else float("nan")

    for k in k_values:
        ndcg_scores = []
        hit_rates = []
        for n in range(N):
            scores = logits[n]
            gt = targets[n]
            if gt.sum() == 0:
                continue
            top_k = np.argsort(-scores)[:k]
            # Hit rate
            hits = gt[top_k].sum()
            hit_rates.append(float(hits > 0))
            # nDCG
            dcg = sum(gt[idx] / np.log2(i + 2) for i, idx in enumerate(top_k))
            ideal = sorted(gt, reverse=True)[:k]
            idcg = sum(v / np.log2(i + 2) for i, v in enumerate(ideal))
            ndcg_scores.append(float(dcg / idcg) if idcg > 0 else 0.0)

        metrics[f"ndcg@{k}"] = float(np.mean(ndcg_scores)) if ndcg_scores else float("nan")
        metrics[f"hit_rate@{k}"] = float(np.mean(hit_rates)) if hit_rates else float("nan")

    return metrics


# ---------------------------------------------------------------------------
# Aggregate evaluator
# ---------------------------------------------------------------------------

def evaluate_model(
    model: "ViralTransformer",  # type: ignore[name-defined]
    data_loader: "DataLoader",  # type: ignore[name-defined]
    device: torch.device,
    clip_mode: str = "multiclass",
) -> Dict[str, Dict[str, float]]:
    """
    Run full evaluation over a DataLoader and compute all task metrics.

    Returns nested dict: {task_name: {metric_name: value}}
    """
    model.eval()
    all_viral_probs: List[np.ndarray] = []
    all_viral_labels: List[np.ndarray] = []
    all_days_preds: List[np.ndarray] = []
    all_days_labels: List[np.ndarray] = []
    all_peak_preds: List[np.ndarray] = []
    all_peak_labels: List[np.ndarray] = []
    all_clip_logits: List[np.ndarray] = []
    all_clip_targets: List[np.ndarray] = []

    with torch.no_grad():
        for batch in data_loader:
            batch = {k: v.to(device, non_blocking=True) for k, v in batch.items()}
            outputs = model(
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
                return_clip_logits=True,
            )
            all_viral_probs.append(outputs.viral_prob.cpu().numpy())
            all_viral_labels.append(batch["viral"].cpu().numpy())
            all_days_preds.append(outputs.days_to_viral.cpu().numpy())
            all_days_labels.append(batch["days_to_viral"].cpu().numpy())
            all_peak_preds.append(outputs.peak_score.cpu().numpy())
            all_peak_labels.append(batch["peak_score"].cpu().numpy())
            if outputs.clip_logits is not None and "clip_target" in batch:
                all_clip_logits.append(outputs.clip_logits.cpu().numpy())
                all_clip_targets.append(batch["clip_target"].cpu().numpy())

    viral_probs = np.concatenate(all_viral_probs).flatten()
    viral_labels = np.concatenate(all_viral_labels).flatten()
    days_preds = np.concatenate(all_days_preds).flatten()
    days_labels = np.concatenate(all_days_labels).flatten()
    peak_preds = np.concatenate(all_peak_preds).flatten()
    peak_labels = np.concatenate(all_peak_labels).flatten()

    results: Dict[str, Dict[str, float]] = {
        "viral_classification": compute_viral_classification_metrics(viral_probs, viral_labels),
        "days_to_viral": compute_days_to_viral_metrics(
            days_preds, days_labels, viral_mask=viral_labels > 0.5
        ),
        "peak_score": compute_peak_score_metrics(peak_preds, peak_labels),
    }

    if all_clip_logits:
        clip_logits = np.concatenate(all_clip_logits, axis=0)
        clip_targets = np.concatenate(all_clip_targets, axis=0)
        results["clip_recommendation"] = compute_clip_metrics(clip_logits, clip_targets)

    return results
