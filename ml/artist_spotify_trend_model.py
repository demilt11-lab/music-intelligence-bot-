# ml/artist_spotify_trend_model.py
import argparse
import os

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

from ml.utils.splits import leakage_safe_split

MODEL_PATH = "output/artist_spotify_trend_model.joblib"
SCALER_PATH = "output/artist_spotify_trend_scaler.joblib"
MODEL_NAME = "artist_spotify_trend"
MODEL_VERSION = "v1"

FEATURE_COLS = [
    "num_tracks",
    "window_days",
    "total_streams",
    "avg_streams",
    "median_streams",
    "max_streams",
    "min_streams",
    "std_streams",
    "num_above_100k",
    "num_above_1m",
    "latest_streams_28d",
    "latest_total_streams",
    "avg_days_between_releases",
]


def train_model(csv_path: str):
  df = pd.read_csv(csv_path)
  X = df[FEATURE_COLS].fillna(0.0)
  y = df["popular_within_6m"].astype(int)

  # Temporal, artist-disjoint split — random splits let future snapshots of
  # an artist leak into training and overstate forecasting performance.
  train_idx, test_idx, strategy = leakage_safe_split(
      df, date_col="snapshot_date", group_col="artist_id", test_size=0.2
  )
  X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
  y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

  scaler = StandardScaler()
  X_train_scaled = scaler.fit_transform(X_train)
  X_test_scaled = scaler.transform(X_test)

  clf = GradientBoostingClassifier(random_state=42)
  clf.fit(X_train_scaled, y_train)

  os.makedirs("output", exist_ok=True)
  joblib.dump(clf, MODEL_PATH)
  joblib.dump(scaler, SCALER_PATH)

  acc = clf.score(X_test_scaled, y_test)
  if y_test.nunique() > 1:
    auc = roc_auc_score(y_test, clf.predict_proba(X_test_scaled)[:, 1])
    print(
        f"Trained {MODEL_NAME} {MODEL_VERSION} (split={strategy}): "
        f"test accuracy={acc:.3f}, ROC-AUC={auc:.3f}"
    )
  else:
    print(
        f"Trained {MODEL_NAME} {MODEL_VERSION} (split={strategy}): "
        f"test accuracy={acc:.3f} (single-class test set — AUC unavailable)"
    )


def predict(csv_path: str, out_path: str):
  df = pd.read_csv(csv_path)
  X = df[FEATURE_COLS].fillna(0.0)

  clf = joblib.load(MODEL_PATH)
  scaler = joblib.load(SCALER_PATH)

  X_scaled = scaler.transform(X)
  probs = clf.predict_proba(X_scaled)
  # class 1 = popular_within_6m
  prob_popular = probs[:, 1]

  df["prob_popular_within_6m"] = prob_popular
  df["model_name"] = MODEL_NAME
  df["model_version"] = MODEL_VERSION

  os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
  df.to_csv(out_path, index=False)
  print(f"Wrote predictions to {out_path}")


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "--mode", choices=["train", "predict"], required=True
  )
  parser.add_argument("--input", required=True)
  parser.add_argument("--output")

  args = parser.parse_args()

  if args.mode == "train":
    train_model(args.input)
  else:
    out = (
        args.output
        or "output/artist_spotify_trend_predictions.csv"
    )
    predict(args.input, out)


if __name__ == "__main__":
  main()
