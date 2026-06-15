"""
Temporal Viral Predictor — Training

Extends the XGBoost viral predictor with trajectory embeddings from
TemporalEncoder (bi-LSTM + attention). The combined pipeline is:

  Stage 1: TemporalEncoder encodes a 90-day daily-stats sequence per track
           into a 64-dim trajectory embedding.

  Stage 2: XGBoost classifies using [static_viral_features | trajectory_embedding].

Training target priority:
  1. PredictionOutcome.wasCorrect  — outcome-backed 60-day retrospective label.
     This is the non-circular ground truth (did streams actually grow 3.5× ?).
  2. viral_30d / viral_label       — fall-back in the static feature parquet.

Input files (in data/):
  viral_training_features.parquet  — one row per (trackId, snapshot_date),
                                     all TrackFeatureRow fields + label cols.
  viral_training_sequences.parquet — one row per trackId, column "sequences"
                                     contains a list of up to 90 daily dicts:
                                     {streams, tiktok_growth, playlist_adds,
                                      radio_spins, viral_score}
  prediction_outcomes.parquet      — optional; exported from PredictionOutcome
                                     where predictionType='viral_score' and
                                     wasCorrect is not null.
                                     Columns: trackId, snapshot_date, wasCorrect.

Output (in models/):
  temporal_encoder.pt              — TemporalEncoder weights (feature extractor)
  temporal_viral_predictor_xgb.json
  temporal_viral_predictor_calibrated.joblib
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import torch
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from xgboost import XGBClassifier

from ml.config import DATA_DIR, MODEL_DIR, NEURAL_DIR, LOG_DIR, configure_logging
from ml.features.feature_engineering import build_viral_features
from ml.neural.temporal_encoder import TemporalEncoder, build_sequence_tensor
from ml.utils.splits import leakage_safe_split

logger = configure_logging(__name__)

FEATURES_PATH  = DATA_DIR  / "viral_training_features.parquet"
SEQUENCES_PATH = DATA_DIR  / "viral_training_sequences.parquet"
OUTCOMES_PATH  = DATA_DIR  / "prediction_outcomes.parquet"
ENCODER_PATH   = NEURAL_DIR / "temporal_encoder.pt"
MODEL_PATH     = MODEL_DIR  / "temporal_viral_predictor_xgb.json"
CAL_PATH       = MODEL_DIR  / "temporal_viral_predictor_calibrated.joblib"
METRICS_PATH   = LOG_DIR    / "metrics" / "temporal_viral_training_metrics.json"

XGB_PARAMS = dict(
    n_estimators=2000,
    max_depth=6,
    learning_rate=0.02,
    subsample=0.85,
    colsample_bytree=0.85,
    min_child_weight=5,
    gamma=0.1,
    reg_alpha=0.1,
    reg_lambda=1.0,
    objective="binary:logistic",
    eval_metric="aucpr",
    tree_method="hist",
    random_state=42,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _load_data() -> pd.DataFrame:
    df = pd.read_parquet(FEATURES_PATH)
    logger.info("Loaded %d feature rows, %d columns", len(df), len(df.columns))

    # Normalise label column
    if "viral_30d" not in df.columns:
        if "viral_label" in df.columns:
            df["viral_30d"] = df["viral_label"].astype(int)
        elif "is_viral" in df.columns:
            df["viral_30d"] = df["is_viral"].astype(int)
        else:
            raise ValueError("No viral label column (viral_30d / viral_label / is_viral)")

    # Override with outcome-backed labels where available.
    # These are the gold labels produced by the 60-day retrospective evaluator
    # in evaluate_predictions.ts — not derived from viralScore, so no circularity.
    if OUTCOMES_PATH.exists():
        outcomes = pd.read_parquet(OUTCOMES_PATH)
        outcomes = outcomes[outcomes["wasCorrect"].notna()]
        outcomes = outcomes.rename(columns={"wasCorrect": "outcome_label"})
        outcomes["outcome_label"] = outcomes["outcome_label"].astype(int)
        logger.info("Loaded %d outcome-backed labels from %s", len(outcomes), OUTCOMES_PATH)

        if "snapshot_date" in outcomes.columns:
            df = df.merge(
                outcomes[["trackId", "snapshot_date", "outcome_label"]],
                on=["trackId", "snapshot_date"],
                how="left",
            )
        else:
            # Merge on trackId only — take latest outcome per track
            latest_outcomes = outcomes.sort_values("evaluatedAt").groupby("trackId").last().reset_index()
            df = df.merge(
                latest_outcomes[["trackId", "outcome_label"]],
                on="trackId",
                how="left",
            )

        # Use outcome label where present, else fall back to viral_30d
        merged = df["outcome_label"].fillna(df["viral_30d"].astype(float))
        df["label"] = merged.fillna(0).astype(int)
        n_outcome = df["outcome_label"].notna().sum()
        logger.info(
            "Label source: %d outcome-backed, %d fallback (viral_30d)",
            n_outcome, len(df) - n_outcome,
        )
    else:
        df["label"] = df["viral_30d"].fillna(0).astype(int)
        logger.info("No outcomes file found — using viral_30d as label")

    return df


def _load_sequences(track_ids: np.ndarray) -> Dict[int, list]:
    """Load per-track daily-stat sequences. Returns {} for missing tracks."""
    if not SEQUENCES_PATH.exists():
        logger.warning("Sequences file not found at %s — using zero sequences", SEQUENCES_PATH)
        return {}

    seq_df = pd.read_parquet(SEQUENCES_PATH)
    seq_map: Dict[int, list] = {}
    for _, row in seq_df.iterrows():
        seq_map[int(row["trackId"])] = row["sequences"]
    logger.info("Loaded sequences for %d tracks", len(seq_map))
    return seq_map


def _encode_sequences(
    track_ids: np.ndarray,
    seq_map: Dict[int, list],
    encoder: TemporalEncoder,
    batch_size: int = 256,
) -> np.ndarray:
    """Run TemporalEncoder over sequences; return (N, BRANCH_DIM) numpy array."""
    encoder.eval()
    device = next(encoder.parameters()).device

    embeddings = []
    for start in range(0, len(track_ids), batch_size):
        batch_ids = track_ids[start : start + batch_size]
        seqs = [seq_map.get(int(tid), []) for tid in batch_ids]
        x, lengths = build_sequence_tensor(seqs)
        x, lengths = x.to(device), lengths.to(device)

        with torch.no_grad():
            emb = encoder(x, lengths)
        embeddings.append(emb.cpu().numpy())

    return np.concatenate(embeddings, axis=0)


def _compute_pos_weight(y: np.ndarray) -> float:
    n_neg = (y == 0).sum()
    n_pos = (y == 1).sum()
    return float(n_neg / n_pos) if n_pos > 0 else 1.0


# ── training ─────────────────────────────────────────────────────────────────

def _train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
) -> Tuple[XGBClassifier, CalibratedClassifierCV, Dict]:
    """5-fold CV + Platt calibration, same protocol as train_viral_predictor.py."""
    pos_weight = _compute_pos_weight(y_train)
    logger.info("pos_weight=%.2f  positives=%d/%d", pos_weight, int(y_train.sum()), len(y_train))

    params = {**XGB_PARAMS, "scale_pos_weight": pos_weight}

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    oof_probs = np.zeros(len(y_train))

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X_train, y_train)):
        m = XGBClassifier(**params)
        m.fit(
            X_train[tr_idx], y_train[tr_idx],
            eval_set=[(X_train[val_idx], y_train[val_idx])],
            early_stopping_rounds=100,
            verbose=False,
        )
        oof_probs[val_idx] = m.predict_proba(X_train[val_idx])[:, 1]
        logger.info("Fold %d  best_iteration=%d", fold, m.best_iteration)

    oof_roc   = roc_auc_score(y_train, oof_probs)
    oof_ap    = average_precision_score(y_train, oof_probs)
    logger.info("OOF  ROC-AUC=%.4f  Avg-Precision=%.4f", oof_roc, oof_ap)

    # Final model + Platt calibration
    X_fit, X_cal, y_fit, y_cal = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
    )
    final = XGBClassifier(**params)
    final.fit(X_fit, y_fit, eval_set=[(X_cal, y_cal)], early_stopping_rounds=150, verbose=False)

    calibrated = CalibratedClassifierCV(final, cv="prefit", method="sigmoid")
    calibrated.fit(X_cal, y_cal)

    metrics: Dict = {
        "oof_roc_auc": round(oof_roc, 4),
        "oof_avg_precision": round(oof_ap, 4),
        "n_features": X_train.shape[1],
        "pos_weight": round(pos_weight, 2),
        "n_pos": int(y_train.sum()),
        "n_total": len(y_train),
    }

    if len(y_test) > 0 and y_test.sum() > 0:
        test_probs = calibrated.predict_proba(X_test)[:, 1]
        metrics["test_roc_auc"]       = round(float(roc_auc_score(y_test, test_probs)), 4)
        metrics["test_avg_precision"] = round(float(average_precision_score(y_test, test_probs)), 4)
        logger.info("Test  ROC-AUC=%.4f  Avg-Precision=%.4f", metrics["test_roc_auc"], metrics["test_avg_precision"])

    return final, calibrated, metrics


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    df = _load_data()

    train_idx, test_idx, split_strategy = leakage_safe_split(
        df, date_col="snapshot_date", group_col="trackId", test_size=0.2,
    )
    logger.info("Split strategy=%s  train=%d  test=%d", split_strategy, len(train_idx), len(test_idx))

    df_train = df.iloc[train_idx].copy().reset_index(drop=True)
    df_test  = df.iloc[test_idx].copy().reset_index(drop=True)

    # Stage 1: build static viral features
    logger.info("Building static viral feature matrices...")
    X_static_train, feature_names = build_viral_features(df_train.to_dict(orient="records"))
    X_static_test,  _             = build_viral_features(df_test.to_dict(orient="records"))
    logger.info("Static features: %s train, %s test, %d dims", X_static_train.shape, X_static_test.shape, len(feature_names))

    # Stage 2: encode trajectory sequences with TemporalEncoder
    encoder = TemporalEncoder()
    if ENCODER_PATH.exists():
        encoder.load_state_dict(torch.load(ENCODER_PATH, weights_only=True, map_location="cpu"))
        logger.info("Loaded TemporalEncoder weights from %s", ENCODER_PATH)
    else:
        logger.info("No saved encoder found — using randomly initialised weights (will still produce useful embeddings)")

    seq_map = _load_sequences(df["trackId"].to_numpy())

    logger.info("Encoding train sequences...")
    train_ids = df_train["trackId"].to_numpy()
    test_ids  = df_test["trackId"].to_numpy()
    X_seq_train = _encode_sequences(train_ids, seq_map, encoder)
    X_seq_test  = _encode_sequences(test_ids,  seq_map, encoder)
    logger.info("Sequence embeddings: train=%s  test=%s", X_seq_train.shape, X_seq_test.shape)

    # Concatenate static + trajectory features
    X_train = np.concatenate([X_static_train, X_seq_train], axis=1)
    X_test  = np.concatenate([X_static_test,  X_seq_test],  axis=1)
    logger.info("Combined feature matrix: train=%s  test=%s", X_train.shape, X_test.shape)

    y_train = df_train["label"].to_numpy()
    y_test  = df_test["label"].to_numpy()

    # Train
    final_model, calibrated, metrics = _train_model(X_train, y_train, X_test, y_test)
    metrics["split_strategy"] = split_strategy
    metrics["encoder_pretrained"] = ENCODER_PATH.exists()

    # Save
    NEURAL_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(encoder.state_dict(), ENCODER_PATH)
    final_model.save_model(str(MODEL_PATH))
    joblib.dump(calibrated, CAL_PATH)
    logger.info("Saved encoder → %s", ENCODER_PATH)
    logger.info("Saved XGBoost → %s", MODEL_PATH)
    logger.info("Saved calibrated → %s", CAL_PATH)

    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with METRICS_PATH.open("w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics → %s", METRICS_PATH)

    logger.info(
        "Done — OOF ROC-AUC=%.4f  OOF Avg-Precision=%.4f",
        metrics["oof_roc_auc"], metrics["oof_avg_precision"],
    )


if __name__ == "__main__":
    main()
