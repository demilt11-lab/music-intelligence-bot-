import os
from typing import Tuple

import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import (
    roc_curve,
    auc,
    precision_recall_curve,
    classification_report,
)


def load_data(
    features_csv: str,
    predictions_csv: str,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
  feats = pd.read_csv(features_csv)
  preds = pd.read_csv(predictions_csv)
  return feats, preds


def prepare_labels(
    df_feats: pd.DataFrame,
) -> pd.Series:
  """
  Build a binary label: 1 if status == ABOUT_TO_BREAK,
  else 0. This uses your existing rule-based status
  as a proxy 'ground truth' to evaluate the new model.
  """
  y = (df_feats["status"] == "ABOUT_TO_BREAK").astype(
      int
  )
  return y


def prepare_scores(
    df_preds: pd.DataFrame,
) -> pd.Series:
  """
  Use predicted break probability as the score.
  """
  if "pred_break_prob" in df_preds.columns:
    return df_preds["pred_break_prob"]
  # fallback if you stored probability under a different name
  for col in df_preds.columns:
    if "break" in col and "prob" in col:
      return df_preds[col]
  raise ValueError(
      "No pred_break_prob column found in predictions CSV"
  )


def plot_roc(
    y_true: pd.Series,
    scores: pd.Series,
    out_path: str,
):
  fpr, tpr, _ = roc_curve(y_true, scores)
  roc_auc = auc(fpr, tpr)

  plt.figure()
  plt.plot(
      fpr,
      tpr,
      color="darkorange",
      lw=2,
      label=f"ROC curve (area = {roc_auc:.3f})",
  )
  plt.plot(
      [0, 1],
      [0, 1],
      color="navy",
      lw=2,
      linestyle="--",
  )
  plt.xlim([0.0, 1.0])
  plt.ylim([0.0, 1.05])
  plt.xlabel("False Positive Rate")
  plt.ylabel("True Positive Rate")
  plt.title("ROC for ABOUT_TO_BREAK")
  plt.legend(loc="lower right")
  os.makedirs("output", exist_ok=True)
  plt.savefig(out_path, dpi=150, bbox_inches="tight")
  plt.close()
  print(f"Saved ROC curve to {out_path}")


def plot_pr(
    y_true: pd.Series,
    scores: pd.Series,
    out_path: str,
):
  precision, recall, _ = precision_recall_curve(
      y_true, scores
  )
  plt.figure()
  plt.plot(
      recall,
      precision,
      color="purple",
      lw=2,
  )
  plt.xlim([0.0, 1.0])
  plt.ylim([0.0, 1.05])
  plt.xlabel("Recall")
  plt.ylabel("Precision")
  plt.title("Precision-Recall for ABOUT_TO_BREAK")
  os.makedirs("output", exist_ok=True)
  plt.savefig(out_path, dpi=150, bbox_inches="tight")
  plt.close()
  print(f"Saved PR curve to {out_path}")


def threshold_report(
    y_true: pd.Series,
    scores: pd.Series,
    thresholds=None,
):
  if thresholds is None:
    thresholds = [0.3, 0.4, 0.5, 0.6, 0.7]

  for thr in thresholds:
    y_pred = (scores >= thr).astype(int)
    print(f"\n=== Threshold {thr:.2f} ===")
    print(
        classification_report(
            y_true,
            y_pred,
            target_names=["other", "ABOUT_TO_BREAK"],
        )
    )


def main():
  feats_csv = (
      "output/artist_trajectory_features.csv"
  )
  preds_csv = (
      "output/artist_trajectory_predictions.csv"
  )

  df_feats, df_preds = load_data(
      feats_csv, preds_csv
  )

  # align by artist_id + snapshot_date
  key_cols = ["artist_id", "snapshot_date"]
  df = pd.merge(
      df_feats,
      df_preds,
      on=key_cols,
      suffixes=("_feat", "_pred"),
  )

  y_true = prepare_labels(df)
  scores = prepare_scores(df)

  # ROC and PR curves
  plot_roc(
      y_true,
      scores,
      "output/artist_trajectory_roc.png",
  )
  plot_pr(
      y_true,
      scores,
      "output/artist_trajectory_pr.png",
  )

  # Threshold diagnostics
  threshold_report(y_true, scores)


if __name__ == "__main__":
  main()
