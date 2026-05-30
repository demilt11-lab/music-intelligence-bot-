# ml/utils/audio_features.py
"""
Audio feature extraction helpers.
Extracts BPM, musical key, energy, danceability, valence
from audio files or metadata payloads.
Uses librosa for local audio analysis.
Falls back to metadata-supplied values if no audio file is provided.
"""

import os
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

KEY_PROFILE_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                     2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
KEY_PROFILE_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                     2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def detect_key_from_chroma(chroma_vector: list) -> Dict[str, str]:
    """
    Detects musical key from a chroma vector using Krumhansl-Schmuckler algorithm.
    chroma_vector: 12-element list of pitch class energies.
    Returns {"key": "C", "mode": "major", "confidence": 0.85}
    """
    import numpy as np
    chroma = np.array(chroma_vector, dtype=float)
    chroma = chroma / (chroma.sum() + 1e-9)

    best_key = "C"
    best_mode = "major"
    best_score = -np.inf

    for shift in range(12):
        rotated = np.roll(chroma, -shift)
        major_score = float(np.corrcoef(rotated, KEY_PROFILE_MAJOR)[0, 1])
        minor_score = float(np.corrcoef(rotated, KEY_PROFILE_MINOR)[0, 1])

        if major_score > best_score:
            best_score = major_score
            best_key = NOTES[shift]
            best_mode = "major"

        if minor_score > best_score:
            best_score = minor_score
            best_key = NOTES[shift]
            best_mode = "minor"

    return {
        "key": best_key,
        "mode": best_mode,
        "confidence": round(float(best_score), 4),
    }


def extract_from_audio_file(file_path: str) -> Dict:
    """
    Extracts BPM, key, energy, danceability, valence from a local audio file.
    Requires: pip install librosa numpy
    """
    try:
        import librosa
        import numpy as np

        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=60.0)

        # BPM
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo)

        # Key via chroma
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
