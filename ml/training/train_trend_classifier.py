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
