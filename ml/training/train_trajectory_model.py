# ml/training/train_trajectory_model.py
import json
import os
import numpy as np
from typing import List, Dict
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

INPUT_FILE = "output/data/trajectory_features_labeled.json"

FEATURE_KEYS = [
    "spotifyStreams",
    "spotifyPopularity",
    "tiktokVideoCount",
    "youtubeViews",
    "streamVelocity7d",
    "tiktokGrowth7d",
    "playlistCount",
    "playlistAdds7d",
    "radioSpins7d",
]

LABEL_MAP = {
    "low_signal": 0,
    "stable": 1,
    "rising": 2,
    "peaking": 3,
    "declining": 4,
    "resurging": 5,
}

def load_data() -> (np.ndarray, np.ndarray):
    with open(INPUT_FILE, "r") as f:
        rows = json.load(f)

    X: List[List[float]] = []
    y: List[int] = []

    for row in rows:
        feat: Dict = row["features"]
        label = row.get("label")
        if label is None or label not in LABEL_MAP:
            continue

        vec = []
        for key in FEATURE_KEYS:
            val = feat.get(key)
            if val is None:
                vec.append(0.0)
            else:
                vec.append(float(val))
        X.append(vec)
        y.append(LABEL_MAP[label])

    return np.array(X), np.array(y)

def main():
    X, y = load_data()
    if len(X) == 0:
        print("No labeled data; cannot train.")
        return

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = GradientBoostingClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=3,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print(classification_report(y_test, y_pred))

    os.makedirs("output/models", exist_ok=True)
    model_path = "output/models/trajectory_model.pkl"
    joblib.dump(clf, model_path)

    meta = {
        "feature_keys": FEATURE_KEYS,
        "label_map": LABEL_MAP,
        "model_path": model_path,
    }
    with open("ml/training/model_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Saved model to {model_path}")

if __name__ == "__main__":
    main()
