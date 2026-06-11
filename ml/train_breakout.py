"""
ml/train_breakout.py
Predictive A&R — Breakout Classifier Training
Trains an XGBClassifier with calibrated probabilities to predict 30-day breakout.

ASSUMPTION: A "breakout" is defined as an artist with <50k monthly listeners at
  snapshot_date who reaches >500k monthly listeners within 180 days.
ASSUMPTION: artist_daily_stats."totalListeners" stores monthly Spotify listeners.
ASSUMPTION: training_examples table has been populated (e.g. via generate_training_labels).
"""

import os
import sys
import logging
import pickle
from datetime import date, timedelta
from pathlib import Path

import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import roc_auc_score, average_precision_score
from xgboost import XGBClassifier
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("train_breakout")

MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "breakout_xgb.pkl"

FEATURE_COLS = [
    "listenersGrowth7d",
    "listenersGrowth30d",
    "listenersGrowth90d",
    "listenersVelocity7d",
    "listenersAcceleration7d",
    "tiktokVideosPerDay7d",
    "tiktokViewsGrowth7d",
    "crossPlatformSpikes7d",
    "streamsPerPlaylistAdd7d",
    "savesPerStream30d",
    "igEngagementPerFollower30d",
    "growthConsistency30d",
    "baselineMonthlyListeners",
]


# ---------------------------------------------------------------------------
# Label generation
# ---------------------------------------------------------------------------

def generate_training_labels(conn, cutoff_date: date) -> None:
    """
    Generate training labels for the training_examples table.

    A breakout (label=1) is defined as:
      - Artist had < 50,000 monthly listeners at snapshot_date
      - Artist grew to > 500,000 monthly listeners within 180 days

    Uses artist_daily_stats."totalListeners" as proxy for monthly listeners.
    Idempotent: uses INSERT ... ON CONFLICT DO NOTHING.

    Args:
        conn: psycopg2 connection
        cutoff_date: Only consider snapshot dates before this date
                     (ensures 180-day outcome window has data)
    """
    logger.info(f"Generating training labels up to {cutoff_date}")

    # Find artists with <50k listeners at some snapshot date
    # and check if they crossed 500k within 180 days
    sql_snapshots = """
        SELECT DISTINCT
            ads."artistId",
            ads."date"::date AS snapshot_date,
            ads."totalListeners" AS baseline_listeners
        FROM artist_daily_stats ads
        WHERE ads."totalListeners" IS NOT NULL
          AND ads."totalListeners" > 0
          AND ads."totalListeners" < 50000
          AND ads."date"::date <= %(cutoff)s
        ORDER BY ads."artistId", ads."date"
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql_snapshots, {"cutoff": cutoff_date})
        snapshot_rows = cur.fetchall()

    if not snapshot_rows:
        logger.warning("No candidate snapshots found.")
        return

    snapshots_df = pd.DataFrame(snapshot_rows)
    logger.info(f"Found {len(snapshots_df)} candidate artist-snapshots")

    # For each snapshot, check if the artist crossed 500k within 180 days
    labels_to_insert = []

    for _, snap in snapshots_df.iterrows():
        artist_id = int(snap["artistId"])
        snap_date = snap["snapshot_date"]
        horizon = snap_date + timedelta(days=180)

        sql_outcome = """
            SELECT MAX("totalListeners") AS max_listeners
            FROM artist_daily_stats
            WHERE "artistId" = %(aid)s
              AND "date"::date > %(snap)s
              AND "date"::date <= %(horizon)s
        """
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql_outcome, {"aid": artist_id, "snap": snap_date, "horizon": horizon})
            result = cur.fetchone()

        max_listeners = result["max_listeners"] if result and result["max_listeners"] else 0
        breakout_label = 1 if float(max_listeners) >= 500_000 else 0

        # Pull features from artist_features_daily
        sql_feats = """
            SELECT
                "listenersGrowth7d", "listenersGrowth30d", "listenersGrowth90d",
                "listenersVelocity7d", "listenersAcceleration7d",
                "tiktokVideosPerDay7d", "tiktokViewsGrowth7d",
                "crossPlatformSpikes7d",
                "streamsPerPlaylistAdd7d", "savesPerStream30d",
                "igEngagementPerFollower30d",
                "growthConsistency30d"
            FROM artist_features_daily
            WHERE "artistId" = %(aid)s AND date = %(snap)s
        """
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql_feats, {"aid": artist_id, "snap": snap_date})
            feat_row = cur.fetchone()

        if not feat_row:
            continue  # No features for this snapshot, skip

        labels_to_insert.append({
            "artistId": artist_id,
            "snapshotDate": snap_date,
            "breakoutLabel": breakout_label,
            "listenersGrowth7d": feat_row.get("listenersGrowth7d"),
            "listenersGrowth30d": feat_row.get("listenersGrowth30d"),
            "listenersGrowth90d": feat_row.get("listenersGrowth90d"),
            "listenersVelocity7d": feat_row.get("listenersVelocity7d"),
            "listenersAcceleration7d": feat_row.get("listenersAcceleration7d"),
            "tiktokVideosPerDay7d": feat_row.get("tiktokVideosPerDay7d"),
            "tiktokViewsGrowth7d": feat_row.get("tiktokViewsGrowth7d"),
            "crossPlatformSpikes7d": feat_row.get("crossPlatformSpikes7d"),
            "streamsPerPlaylistAdd7d": feat_row.get("streamsPerPlaylistAdd7d"),
            "savesPerStream30d": feat_row.get("savesPerStream30d"),
            "igEngagementPerFollower30d": feat_row.get("igEngagementPerFollower30d"),
            "growthConsistency30d": feat_row.get("growthConsistency30d"),
            "baselineMonthlyListeners": float(snap["baseline_listeners"]),
        })

    if not labels_to_insert:
        logger.warning("No training examples to insert.")
        return

    upsert_sql = """
        INSERT INTO training_examples (
            "artistId", "snapshotDate", "breakoutLabel",
            "listenersGrowth7d", "listenersGrowth30d", "listenersGrowth90d",
            "listenersVelocity7d", "listenersAcceleration7d",
            "tiktokVideosPerDay7d", "tiktokViewsGrowth7d",
            "crossPlatformSpikes7d",
            "streamsPerPlaylistAdd7d", "savesPerStream30d",
            "igEngagementPerFollower30d",
            "growthConsistency30d",
            "baselineMonthlyListeners",
            "createdAt"
        )
        VALUES (
            %(artistId)s, %(snapshotDate)s, %(breakoutLabel)s,
            %(listenersGrowth7d)s, %(listenersGrowth30d)s, %(listenersGrowth90d)s,
            %(listenersVelocity7d)s, %(listenersAcceleration7d)s,
            %(tiktokVideosPerDay7d)s, %(tiktokViewsGrowth7d)s,
            %(crossPlatformSpikes7d)s,
            %(streamsPerPlaylistAdd7d)s, %(savesPerStream30d)s,
            %(igEngagementPerFollower30d)s,
            %(growthConsistency30d)s,
            %(baselineMonthlyListeners)s,
            NOW()
        )
        ON CONFLICT ("artistId", "snapshotDate") DO NOTHING
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, upsert_sql, labels_to_insert, page_size=100)
    conn.commit()
    breakouts = sum(1 for r in labels_to_insert if r["breakoutLabel"] == 1)
    logger.info(
        f"Inserted {len(labels_to_insert)} training examples "
        f"({breakouts} breakouts, {len(labels_to_insert) - breakouts} non-breakouts)"
    )


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def load_training_data(conn) -> pd.DataFrame:
    """Load all training examples from the database."""
    sql = """
        SELECT
            "artistId",
            "snapshotDate",
            "breakoutLabel",
            "listenersGrowth7d", "listenersGrowth30d", "listenersGrowth90d",
            "listenersVelocity7d", "listenersAcceleration7d",
            "tiktokVideosPerDay7d", "tiktokViewsGrowth7d",
            "crossPlatformSpikes7d",
            "streamsPerPlaylistAdd7d", "savesPerStream30d",
            "igEngagementPerFollower30d",
            "growthConsistency30d",
            "baselineMonthlyListeners"
        FROM training_examples
        ORDER BY "artistId", "snapshotDate"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return pd.DataFrame(rows)


def subsample_snapshots(df: pd.DataFrame, min_gap_days: int = 7) -> pd.DataFrame:
    """
    Keep at most one snapshot per artist per `min_gap_days`. Daily snapshots
    of the same artist are nearly identical rows with overlapping 180-day
    outcomes; training on all of them inflates metrics via temporal
    autocorrelation without adding information.
    """
    df = df.sort_values(["artistId", "snapshotDate"])
    kept_idx = []
    last_kept: dict[int, date] = {}
    for idx, row in df.iterrows():
        aid = int(row["artistId"])
        snap = row["snapshotDate"]
        prev = last_kept.get(aid)
        if prev is None or (snap - prev).days >= min_gap_days:
            kept_idx.append(idx)
            last_kept[aid] = snap
    out = df.loc[kept_idx]
    logger.info(
        f"Subsampled snapshots: {len(df)} -> {len(out)} "
        f"(>= {min_gap_days}d gap per artist)"
    )
    return out


def train_model(conn) -> None:
    """
    Train XGBClassifier with calibrated probabilities.
    Saves model to ml/models/breakout_xgb.pkl.

    Split design (leakage controls):
      1. Snapshots subsampled to >= 7-day gaps per artist (autocorrelation).
      2. OUTER split is temporal: the most recent ~20% of snapshot dates form
         the validation set, so reported metrics reflect forward-looking use.
      3. Validation rows whose artist also appears in training are dropped,
         so no artist straddles the boundary.
      4. Calibration uses a group-aware slice held out from training — the
         base model never sees the calibration rows.
    """
    logger.info("Loading training data...")
    df = load_training_data(conn)

    if df.empty:
        logger.error("No training examples found. Run generate_training_labels first.")
        sys.exit(1)

    df["snapshotDate"] = pd.to_datetime(df["snapshotDate"]).dt.date
    df = subsample_snapshots(df)

    logger.info(f"Training on {len(df)} examples, {df['breakoutLabel'].sum()} positive labels")

    # Prepare features
    X = df[FEATURE_COLS].copy()
    for col in FEATURE_COLS:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    # Median imputation, with the medians persisted so inference imputes the
    # same way instead of silently substituting zeros.
    medians = X.median(numeric_only=True).fillna(0.0)
    X = X.fillna(medians)

    y = df["breakoutLabel"].astype(int).values
    groups = df["artistId"].astype(int).values

    # ── Temporal outer split ────────────────────────────────────────────────
    cutoff = df["snapshotDate"].quantile(0.8)
    is_val = df["snapshotDate"] > cutoff
    if is_val.sum() == 0 or (~is_val).sum() == 0:
        logger.warning("Too little date spread for a temporal split; falling back to group split.")
        gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
        train_idx, val_idx = next(gss.split(X, y, groups))
        is_val = pd.Series(False, index=df.index)
        is_val.iloc[val_idx] = True

    train_artists = set(df.loc[~is_val, "artistId"].astype(int))
    overlap = is_val & df["artistId"].astype(int).isin(train_artists)
    if overlap.any():
        logger.info(f"Dropping {overlap.sum()} validation rows whose artist appears in training")
        is_val = is_val & ~overlap

    X_trainval, X_val = X[~is_val.values], X[is_val.values]
    y_trainval, y_val = y[~is_val.values], y[is_val.values]
    g_trainval = groups[~is_val.values]

    logger.info(
        f"Train+calib: {len(X_trainval)} | Val (temporal holdout): {len(X_val)} "
        f"| split date > {cutoff}"
    )

    # ── Group-aware calibration slice ───────────────────────────────────────
    gss_cal = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    fit_idx, cal_idx = next(gss_cal.split(X_trainval, y_trainval, g_trainval))
    X_fit, X_cal = X_trainval.iloc[fit_idx], X_trainval.iloc[cal_idx]
    y_fit, y_cal = y_trainval[fit_idx], y_trainval[cal_idx]

    # Class imbalance on the actual fitting slice
    n_neg = (y_fit == 0).sum()
    n_pos = (y_fit == 1).sum()
    scale_pos_weight = float(n_neg) / max(n_pos, 1)
    logger.info(f"scale_pos_weight: {scale_pos_weight:.2f}")

    base_clf = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    base_clf.fit(X_fit, y_fit)

    # Platt-scale on data the base model never saw
    calibrated_clf = CalibratedClassifierCV(base_clf, cv="prefit", method="sigmoid")
    calibrated_clf.fit(X_cal, y_cal)

    # ── Evaluation on the temporal holdout ──────────────────────────────────
    if len(X_val) and y_val.sum() > 0 and y_val.sum() < len(y_val):
        val_probs = calibrated_clf.predict_proba(X_val)[:, 1]
        roc_auc = roc_auc_score(y_val, val_probs)
        pr_auc = average_precision_score(y_val, val_probs)
        logger.info(f"Validation ROC-AUC (temporal holdout): {roc_auc:.4f}")
        logger.info(f"Validation PR-AUC  (temporal holdout): {pr_auc:.4f}")
    else:
        roc_auc = None
        pr_auc = None
        logger.warning(
            "Validation set has a single class or is empty — metrics not computed. "
            "Treat this model as unevaluated."
        )

    # Save model
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_payload = {
        "model": calibrated_clf,
        "feature_cols": FEATURE_COLS,
        "feature_medians": medians.to_dict(),
        "model_version": "v1.1.0",
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "split": "temporal-80/20, artist-disjoint, group-aware prefit calibration",
        "trained_on": date.today().isoformat(),
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model_payload, f)

    logger.info(f"Model saved to {MODEL_PATH}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train breakout XGBoost model.")
    parser.add_argument(
        "--generate-labels",
        action="store_true",
        help="Generate training labels before training",
    )
    parser.add_argument(
        "--cutoff-date",
        type=lambda s: date.fromisoformat(s),
        default=date.today() - timedelta(days=180),
        help="Cutoff date for label generation (default: 180 days ago)",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var not set.")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        if args.generate_labels:
            generate_training_labels(conn, args.cutoff_date)
        train_model(conn)
    finally:
        conn.close()
