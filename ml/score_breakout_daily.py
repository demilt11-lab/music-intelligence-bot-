"""
ml/score_breakout_daily.py
Predictive A&R — Daily Breakout Probability Scoring
Loads the trained XGBClassifier model and scores each artist's 30-day breakout
probability. Upserts into artist_scores_daily.

ASSUMPTION: Model was trained by ml/train_breakout.py and saved to ml/models/breakout_xgb.pkl.
ASSUMPTION: artist_features_daily columns are camelCase as created by Prisma db push.
"""

import os
import sys
import logging
import pickle
from datetime import date
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("score_breakout_daily")

MODEL_PATH = Path(__file__).parent / "models" / "breakout_xgb.pkl"


# ---------------------------------------------------------------------------
# Main scoring
# ---------------------------------------------------------------------------

def score_breakout_prob_for_date(conn, target_date: date) -> None:
    """
    Load the trained model, score all artists with features for target_date,
    and upsert breakout_prob_30d into artist_scores_daily.

    If the model file does not exist, logs a warning and returns without error
    (graceful degradation for CI/CD).

    Args:
        conn: psycopg2 connection
        target_date: Date to score
    """
    if not MODEL_PATH.exists():
        logger.warning(
            f"Model not found at {MODEL_PATH}. "
            "Skipping breakout scoring. Run ml/train_breakout.py first."
        )
        return

    logger.info(f"Loading model from {MODEL_PATH}")
    with open(MODEL_PATH, "rb") as f:
        payload = pickle.load(f)

    model = payload["model"]
    feature_cols = payload["feature_cols"]
    model_version = payload.get("model_version", "unknown")
    feature_medians = payload.get("feature_medians", {})

    logger.info(f"Model version: {model_version}")

    # --- Load features ---
    feature_placeholders = ", ".join(f'"{c}"' for c in feature_cols)
    sql = f"""
        SELECT "artistId", {feature_placeholders}
        FROM artist_features_daily
        WHERE date = %(date)s
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"date": target_date})
        rows = cur.fetchall()

    if not rows:
        logger.warning(f"No artist_features_daily rows found for {target_date}, skipping.")
        return

    df = pd.DataFrame(rows)
    logger.info(f"Scoring {len(df)} artists")

    missing_cols = [c for c in feature_cols if c not in df.columns]
    if missing_cols:
        logger.error(
            f"artist_features_daily is missing model features {missing_cols} — "
            "schema drift between training and inference. Aborting scoring."
        )
        return

    X = df[feature_cols].copy()
    for col in feature_cols:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    # Impute with the training-time medians persisted in the model payload so
    # inference matches training. Fall back to 0 only for legacy payloads.
    imputed_counts = X.isna().sum()
    for col in feature_cols:
        X[col] = X[col].fillna(feature_medians.get(col, 0.0))
    total_imputed = int(imputed_counts.sum())
    if total_imputed:
        worst = imputed_counts.sort_values(ascending=False).head(3)
        logger.info(
            f"Imputed {total_imputed} missing feature values "
            f"(top: {', '.join(f'{c}={int(n)}' for c, n in worst.items() if n)})"
        )

    probs = model.predict_proba(X)[:, 1]

    # --- Upsert into artist_scores_daily ---
    upsert_sql = """
        INSERT INTO artist_scores_daily (
            "artistId", date,
            "breakoutProb30d",
            "modelVersion",
            "createdAt", "updatedAt"
        )
        VALUES (
            %(artistId)s, %(date)s,
            %(breakoutProb30d)s,
            %(modelVersion)s,
            NOW(), NOW()
        )
        ON CONFLICT ("artistId", date) DO UPDATE SET
            "breakoutProb30d" = EXCLUDED."breakoutProb30d",
            "modelVersion"    = EXCLUDED."modelVersion",
            "updatedAt"       = NOW()
    """

    rows_to_upsert = [
        {
            "artistId": int(df.iloc[i]["artistId"]),
            "date": target_date,
            "breakoutProb30d": float(probs[i]),
            "modelVersion": model_version,
        }
        for i in range(len(df))
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, upsert_sql, rows_to_upsert, page_size=200)
    conn.commit()
    logger.info(
        f"Upserted breakout_prob_30d for {len(rows_to_upsert)} artists on {target_date}"
    )

    # Log top-10 breakout candidates
    top_idx = np.argsort(probs)[::-1][:10]
    logger.info("Top-10 breakout candidates:")
    for i in top_idx:
        logger.info(f"  artistId={int(df.iloc[i]['artistId'])} prob={probs[i]:.4f}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Score breakout probability for a given date.")
    parser.add_argument(
        "--date",
        type=lambda s: date.fromisoformat(s),
        default=date.today(),
        help="Target date in YYYY-MM-DD format (default: today)",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var not set.")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        score_breakout_prob_for_date(conn, args.date)
    finally:
        conn.close()
