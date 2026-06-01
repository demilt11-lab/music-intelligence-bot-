# ml/artist_trajectory_model.py
import argparse
import os

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

MODEL_PATH = "output/artist_trajectory_model.joblib"
SCALER_PATH = "output/artist_trajectory_scaler.joblib"
MODEL_NAME = "artist_trajectory"
MODEL_VERSION = "v1"

# Map existing status labels to integers
STATUS_MAP = {
    "DECLINING": 0,
    "STABLE": 1,
    "GROWING": 2,
    "ABOUT_TO_BREAK": 3,
}
INV_STATUS_MAP = {v: k for k, v in STATUS_MAP.items()}

FEATURE_COLS = [
    "streams7dDelta",
    "streams28dDelta",
    "streams90dDelta",
    "playlistsDelta28d",
    "followersDelta28d",
    "tiktokVelocityScore",
    "airplayVelocityScore",
    "maxTrackProbViral",
    "spotifyBreakProb",
]


def train_model(csv_path: str):
  df = pd.read_csv(csv_path)
  # Only use rows with a known status
  df = df[df["status"].isin(STATUS_MAP.keys())].copy()
  df["status_id"] = df["status"].map(STATUS_MAP)

  X = df[FEATURE_COLS].fillna(0.0)
  y = df["status_id"]

  X_train, X_test, y_train, y_test = train_test_split(
      X, y, test_size=0.2, random_state=42, stratify=y
  )

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
      f"Trained {MODEL_NAME} {MODEL_VERSION}, test accuracy={acc:.3f}"
  )


def predict(csv_path: str, out_path: str):
  df = pd.read_csv(csv_path)
  X = df[FEATURE_COLS].fillna(0.0)

  clf = joblib.load(MODEL_PATH)
  scaler = joblib.load(SCALER_PATH)

  X_scaled = scaler.transform(X)
  probs = clf.predict_proba(X_scaled)
  preds = clf.predict(X_scaled)

  df["pred_status_id"] = preds
  df["pred_status"] = df["pred_status_id"].map(INV_STATUS_MAP)

  # Probability of ABOUT_TO_BREAK (class 3)
  class_to_idx = {cls: i for i, cls in enumerate(clf.classes_)}
  idx_break = class_to_idx.get(STATUS_MAP["ABOUT_TO_BREAK"], None)
  if idx_break is None:
    df["pred_break_prob"] = 0.0
  else:
    df["pred_break_prob"] = probs[:, idx_break]

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
        or "output/artist_trajectory_predictions.csv"
    )
    predict(args.input, out)


if __name__ == "__main__":
  main()
