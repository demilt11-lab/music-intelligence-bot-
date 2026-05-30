# ml/training/train_trend_classifier.py
"""
Trend pattern classifier.
Answers: "Given current TikTok UGC patterns, what audio/genre/language
profile is most likely to trend in each region?"

Trains per-region classifiers that predict:
  - Will trend in this region: binary
  - Trend score: 0-1 probability
  - Trend archetype: which cluster of audio features is dominating
"""

import os
import json
import logging
import numpy as np
import joblib
from typing import Dict, List
from collections import defaultdict

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.cluster import KMeans
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

from feature_engineering import (
    engineer_features,
    encode_key,
    encode_bpm,
    encode_language,
    encode_genre,
    TRIGGER_REGIONS,
    TOP_GENRES,
    TOP_LANGUAGES,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = "output/models"
N_TREND_CLUSTERS = 8  # number of audio archetypes


TREND_AUDIO_FEATURES = [
    "bpm_raw",
    "key_pitch_class",
    "key_mode",
    "energy",
    "danceability",
    "valence",
    "loudness",
    "duration_ms",
]


def extract_audio_vector(row: Dict) -> List[float]:
    """Extract just audio features for clustering."""
    bpm_feats = encode_bpm(row.get("bpm"))
    key_feats = encode_key(row.get("musical_key"), row.get("mode"))
    return 

# --- continuation of train_trend_classifier.py ---

        float(row.get("duration_ms") or 0.0) / 1000.0,  # normalize to seconds
    ]


def cluster_audio_archetypes(rows: List[Dict], n_clusters: int = N_TREND_CLUSTERS) -> KMeans:
    """
    Clusters tracks into audio archetypes using KMeans.
    Each archetype represents a sonic profile (e.g. fast/energetic/minor,
    slow/danceable/major, etc.) that the model learns to associate with trend patterns.
    """
    audio_vecs = [extract_audio_vector(r) for r in rows]
    X = np.array(audio_vecs)
    X = np.nan_to_num(X, nan=0.0)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    kmeans.fit(X)
    logger.info(f"Cluster sizes: {np.bincount(kmeans.labels_)}")
    return kmeans


def train_regional_trend_models(
    rows: List[Dict],
    kmeans: KMeans,
) -> Dict[str, GradientBoostingClassifier]:
    """
    Trains one binary classifier per trigger region.
    Each model predicts: will this track trend in THIS region?
    """
    region_models = {}

    for region in TRIGGER_REGIONS:
        region_rows = [
            r for r in rows
            if region in (r.get("active_regions") or [])
            or r.get("top_country_1") == region
            or r.get("tiktok_top_region") == region
        ]

        if len(region_rows) < 30:
            logger.warning(f"Skipping {region}: only {len(region_rows)} samples")
            continue

        # Build feature vectors for this region
        audio_vecs = np.array([extract_audio_vector(r) for r in region_rows])
        audio_vecs = np.nan_to_num(audio_vecs, nan=0.0)
        archetype_labels = kmeans.predict(audio_vecs)

        # Build full feature set: audio + genre + language + archetype
        X_region = []
        for i, r in enumerate(region_rows):
            lang_feats = list(encode_language(r.get("language")).values())
            genre_feats = list(encode_genre(r.get("genre_primary")).values())
            audio_vec = audio_vecs[i].tolist()
            archetype_onehot = [
                1.0 if archetype_labels[i] == c else 0.0
                for c in range(N_TREND_CLUSTERS)
            ]
            X_region.append(audio_vec + lang_feats + genre_feats + archetype_onehot)

        X_region = np.array(X_region)
        y_region = np.array([
            1 if (r.get("viral_label") == 1 or r.get("trajectory_label") == "rising") else 0
            for r in region_rows
        ])

        if y_region.sum() < 5:
            logger.warning(f"Skipping {region}: too few positive labels")
            continue

        X_tr, X_te, y_tr, y_te = train_test_split(
            X_region, y_region, test_size=0.2, random_state=42, stratify=y_region
        )

        model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,
            random_state=42,
        )
        model.fit(X_tr, y_tr)

        y_pred = model.predict(X_te)
        logger.info(f"\nRegion: {region}")
        logger.info(classification_report(y_te, y_pred))

        region_models[region] = model

    return region_models


def main():
    input_file = "output/data/features_labeled.json"
    with open(input_file) as f:
        rows = json.load(f)

    logger.info(f"Loaded {len(rows)} rows")

    kmeans = cluster_audio_archetypes(rows)
    region_models = train_regional_trend_models(rows, kmeans)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(kmeans, f"{MODEL_DIR}/audio_archetype_kmeans.pkl")
    joblib.dump(region_models, f"{MODEL_DIR}/regional_trend_models.pkl")

    archetype_summary = {}
    for i, center in enumerate(kmeans.cluster_centers_):
        archetype_summary[f"archetype_{i}"] = {
            "bpm": round(float(center[0]), 1),
            "key_pitch_class": round(float(center[1]), 2),
            "mode": "major" if center[2] > 0.5 else "minor",
            "energy": round(float(center[3]), 2),
            "danceability": round(float(center[4]), 2),
            "valence": round(float(center[5]), 2),
        }

    meta = {
        "n_archetypes": N_TREND_CLUSTERS,
        "regions_trained": list(region_models.keys()),
        "archetypes": archetype_summary,
    }
    with open(f"{MODEL_DIR}/trend_classifier_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    logger.info(f"Saved trend classifiers for regions: {list(region_models.keys())}")


if __name__ == "__main__":
    main()
