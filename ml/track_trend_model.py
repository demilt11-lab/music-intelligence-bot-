# ml/track_trend_model.py
import argparse
import os
from typing import List

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler

from ml.utils.splits import leakage_safe_split

MODEL_PATH = "output/track_trend_model.joblib"
SCALER_PATH = "output/track_trend_scaler.joblib"
MODEL_NAME = "gradient_boosting"
MODEL_VERSION = "v1"

LABEL_MAP = {
    "NONE": 0,
    "TRENDING": 1,
    "POPULAR": 2,
    "VIRAL": 3,
}
INV_LABEL_MAP = {v: k for k, v in LABEL_MAP.items()}

FEATURE_COLS: List[str] = [
    "tempo",
    "key",
    "mode",
    "energy",
    "danceability",
    "valence",
    "loudness",
    "instrumentalness",
    "playlist_streams7d",
    "viral_score",
]


def train_model(train_csv: str) -> None:
  df = pd.read_csv(train_csv)
  df = df.dropna(subset=["label"])

  # Map labels to ints
  df["label_id"] = df["label"].map(LABEL_MAP)

  X = df[FEATURE_COLS].fillna(0.0)
  y = df["label_id"]

  # Track-disjoint split: the same track must not appear in train and test,
  # or the model memorizes tracks instead of learning trend structure.
  train_idx, test_idx, strategy = leakage_safe_split(
      df, date_col=None, group_col="track_id", test_size=0.2
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
  print(
      f"Trained model {MODEL_NAME} {MODEL_VERSION} (split={strategy}), "
      f"test accuracy={acc:.3f}"
  )


def predict(input_csv: str, output_csv: str) -> None:
  df = pd.read_csv(input_csv)

  clf = joblib.load(MODEL_PATH)
  scaler = joblib.load(SCALER_PATH)

  X = df[FEATURE_COLS].fillna(0.0)
  X_scaled = scaler.transform(X)

  probs = clf.predict_proba(X_scaled)
  preds = clf.predict(X_scaled)

  df["pred_label_id"] = preds
  df["pred_label"] = df["pred_label_id"].map(INV_LABEL_MAP)

  # GradientBoostingClassifier outputs probs per class index; align with LABEL_MAP order
  # Ensure the classes_ order matches LABEL_MAP values
  class_to_idx = {cls: i for i, cls in enumerate(clf.classes_)}
  def get_prob(row_idx, label_id):
    idx = class_to_idx.get(label_id, None)
    if idx is None:
      return 0.0
    return probs[row_idx][idx]

  prob_viral = []
  prob_trending = []
  prob_popular = []
  prob_none = []

  for i, row in df.iterrows():
    prob_none.append(get_prob(i, LABEL_MAP["NONE"]))
    prob_trending.append(get_prob(i, LABEL_MAP["TRENDING"]))
    prob_popular.append(get_prob(i, LABEL_MAP["POPULAR"]))
    prob_viral.append(get_prob(i, LABEL_MAP["VIRAL"]))

  df["prob_none"] = prob_none
  df["prob_trending"] = prob_trending
  df["prob_popular"] = prob_popular
  df["prob_viral"] = prob_viral

  df["model_name"] = MODEL_NAME
  df["model_version"] = MODEL_VERSION

  os.makedirs(os.path.dirname(output_csv) or ".", exist_ok=True)
  df.to_csv(output_csv, index=False)
  print(f"Wrote predictions to {output_csv}")


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "--mode",
      choices=["train", "predict"],
      required=True,
      help="train or predict",
  )
  parser.add_argument(
      "--input",
      required=True,
      help="Input CSV path",
  )
  parser.add_argument(
      "--output",
      required=False,
      help="Output CSV path (for predict mode)",
  )

  args = parser.parse_args()

  if args.mode == "train":
    train_model(args.input)
  else:
    out = args.output or "output/track_trend_predictions.csv"
    predict(args.input, out)


if __name__ == "__main__":
  main()
