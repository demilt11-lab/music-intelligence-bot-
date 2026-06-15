"""
ml/score_writer_producer_daily.py
Writer/Producer Breakout — Daily Inference

Loads today's writer_producer_rising_scores rows, builds the feature vector
for each songwriter using build_writer_producer_features(), runs the calibrated
XGBoost model, and writes mlBreakoutProb30d back to the DB.

Follows the same pattern as score_breakout_daily.py (direct psycopg2 writes).

Usage:
  python ml/score_writer_producer_daily.py [YYYY-MM-DD]

If no date is given, today's date (UTC) is used.

Requires: DATABASE_URL env var (or .env file).
Model must already exist at models/writer_producer_predictor_calibrated.joblib;
if it doesn't, the script exits cleanly with a warning (graceful degradation).
"""

from __future__ import annotations

import os
import sys
import logging
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("score_writer_producer_daily")

ROOT      = Path(__file__).resolve().parent
CAL_PATH  = ROOT / "models" / "writer_producer_predictor_calibrated.joblib"


def _get_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(url)


def _fetch_features(conn, target_date: date) -> pd.DataFrame:
    """
    Fetch today's rising scores plus lagged scores for trend computation.
    Returns a DataFrame with one row per songwriter (the most recent score
    on or before target_date).
    """
    lag7  = target_date - timedelta(days=7)
    lag30 = target_date - timedelta(days=30)

    sql = """
        WITH today AS (
            SELECT
                "songwriterId"       AS songwriter_id,
                "risingScore"        AS rising_score,
                "streamVelocity"     AS stream_velocity,
                "playlistMomentum"   AS playlist_momentum,
                "collaborationScore" AS collaboration_score,
                "ugcMomentum"        AS ugc_momentum,
                "multiTrackPresence" AS multi_track_presence,
                "isSigned"           AS is_signed
            FROM writer_producer_rising_scores
            WHERE date = %(target_date)s
        ),
        lag7d AS (
            SELECT "songwriterId" AS songwriter_id, "risingScore" AS rising_score_lag7d
            FROM writer_producer_rising_scores
            WHERE date = %(lag7)s
        ),
        lag30d AS (
            SELECT "songwriterId" AS songwriter_id, "risingScore" AS rising_score_lag30d
            FROM writer_producer_rising_scores
            WHERE date = %(lag30)s
        ),
        track_counts AS (
            SELECT "songwriterId" AS songwriter_id, COUNT(*) AS track_count
            FROM songwriter_tracks
            GROUP BY "songwriterId"
        )
        SELECT
            t.songwriter_id,
            t.rising_score,
            t.stream_velocity,
            t.playlist_momentum,
            t.collaboration_score,
            t.ugc_momentum,
            t.multi_track_presence,
            t.is_signed::int,
            COALESCE(tc.track_count, 0)        AS track_count,
            COALESCE(l7.rising_score_lag7d,  0) AS rising_score_lag7d,
            COALESCE(l30.rising_score_lag30d, 0) AS rising_score_lag30d
        FROM today t
        LEFT JOIN lag7d  l7  ON l7.songwriter_id  = t.songwriter_id
        LEFT JOIN lag30d l30 ON l30.songwriter_id = t.songwriter_id
        LEFT JOIN track_counts tc ON tc.songwriter_id = t.songwriter_id
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"target_date": target_date, "lag7": lag7, "lag30": lag30})
        rows = cur.fetchall()

    if not rows:
        logger.warning("No rising scores found for %s", target_date)
        return pd.DataFrame()

    logger.info("Fetched %d songwriter rows for %s", len(rows), target_date)
    return pd.DataFrame([dict(r) for r in rows])


def _write_predictions(conn, target_date: date, songwriter_ids: list, probs: np.ndarray) -> int:
    """
    Update mlBreakoutProb30d for each songwriter on target_date.
    Returns the number of rows updated.
    """
    sql = """
        UPDATE writer_producer_rising_scores
        SET "mlBreakoutProb30d" = %(prob)s
        WHERE "songwriterId" = %(songwriter_id)s
          AND date = %(date)s
    """
    updated = 0
    with conn.cursor() as cur:
        for sid, prob in zip(songwriter_ids, probs):
            cur.execute(sql, {"prob": float(prob), "songwriter_id": int(sid), "date": target_date})
            updated += cur.rowcount
    conn.commit()
    return updated


def score_for_date(target_date: date) -> None:
    if not CAL_PATH.exists():
        logger.warning(
            "Calibrated model not found at %s. "
            "Run ml/training/train_writer_producer_predictor.py first.",
            CAL_PATH,
        )
        return

    logger.info("Loading calibrated model from %s", CAL_PATH)
    model = joblib.load(CAL_PATH)

    # Import here so the script can be called without the full ML package when
    # only doing a quick check.
    from ml.features.writer_producer_features import build_writer_producer_features

    conn = _get_conn()
    try:
        df = _fetch_features(conn, target_date)
        if df.empty:
            return

        songwriter_ids = df["songwriter_id"].tolist()
        records = df.to_dict(orient="records")

        X, feature_names = build_writer_producer_features(records)
        logger.info("Built feature matrix: %s  (%d features)", X.shape, len(feature_names))

        probs = model.predict_proba(X)[:, 1]
        logger.info(
            "Predictions: min=%.3f  mean=%.3f  max=%.3f",
            probs.min(), probs.mean(), probs.max(),
        )

        n_updated = _write_predictions(conn, target_date, songwriter_ids, probs)
        logger.info("Updated mlBreakoutProb30d for %d / %d rows", n_updated, len(songwriter_ids))

    finally:
        conn.close()


def main() -> None:
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    if arg:
        try:
            target = date.fromisoformat(arg)
        except ValueError:
            logger.error("Invalid date '%s'. Expected YYYY-MM-DD.", arg)
            sys.exit(1)
    else:
        target = date.today()

    logger.info("Scoring writer/producer breakout probabilities for %s", target)
    score_for_date(target)
    logger.info("Done.")


if __name__ == "__main__":
    main()
