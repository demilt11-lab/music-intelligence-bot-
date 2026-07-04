"""
ml/scoring.py
Predictive A&R — Artist Scoring
Reads ArtistFeaturesDaily and computes composite scores (heat, stability,
platform balance) stored in ArtistScoresDaily.

ASSUMPTION: All feature columns use camelCase as created by Prisma db push.
ASSUMPTION: artist_features_daily and artist_scores_daily table names are snake_case (@@map).
"""

import os
import sys
import logging
from datetime import date
from typing import Optional

import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
from scipy.stats import percentileofscore
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("ar_scoring")

MODEL_VERSION = "v1.0.0"

# ---------------------------------------------------------------------------
# Feature config — weights for heat score
# Higher weight = more influence on heat score
# ---------------------------------------------------------------------------

HEAT_FEATURES = {
    "listenersGrowth7d":        0.28,
    "listenersGrowth30d":       0.18,
    "tiktokViewsGrowth7d":      0.18,
    "listenersVelocity7d":      0.14,
    "streamsPerPlaylistAdd7d":  0.09,
    "savesPerStream30d":        0.04,
    "airplayGrowth7d":          0.05,  # crawl4ai radio-spins momentum
    "chartRankImprovement7d":   0.04,  # crawl4ai chart-crawl momentum (billboard, applemusic, ...)
}

STABILITY_FEATURES = {
    "growthConsistency30d":    0.45,
    "listenersGrowth30d":      0.28,
    "followersGrowth30d":      0.18,
    "chartPresence7d":         0.09,  # breadth of chart presence — durability signal
}

# Platform balance uses platformStreams JSON from artist_daily_stats
# ASSUMPTION: we derive balance from crossPlatformSpikes7d as a proxy
# since we don't have per-platform streams directly in artist_features_daily.
# TODO: Pull actual per-platform listener shares from artist_daily_stats for entropy calc.


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _percentile_rank(series: pd.Series, value: float) -> float:
    """Compute percentile rank of value within series (ignoring NaNs)."""
    valid = series.dropna().values
    if len(valid) == 0:
        return 50.0
    return float(percentileofscore(valid, value, kind="mean"))


def _sigmoid_scale(percentile: float, lo: float = 1.0, hi: float = 10.0) -> float:
    """
    Map a percentile (0–100) to a score in [lo, hi] via sigmoid stretch.
    Using a soft logistic curve centered at 50th percentile.
    """
    x = (percentile - 50.0) / 15.0  # scale to ~[-3, 3] range
    sig = 1.0 / (1.0 + np.exp(-x))  # 0–1
    return float(lo + sig * (hi - lo))


def _weighted_percentile_score(df: pd.DataFrame, weights: dict) -> pd.Series:
    """
    For each row, compute a weighted average of per-feature percentile ranks.
    Missing features are skipped (weight redistributed proportionally).
    """
    scores = pd.Series(0.0, index=df.index)
    total_weight = pd.Series(0.0, index=df.index)

    for feat, w in weights.items():
        if feat not in df.columns:
            continue
        col = df[feat].astype(float)
        valid_mask = col.notna()
        if valid_mask.sum() < 2:
            continue
        # Compute percentile rank for each row using population of all rows
        pct = col.apply(
            lambda v: _percentile_rank(col, v) if pd.notna(v) else np.nan
        )
        scores = scores + pct.fillna(50.0) * w  # treat missing as median
        total_weight = total_weight + w

    # Normalize by actual weight used
    total_weight = total_weight.replace(0, np.nan)
    return scores / total_weight  # 0–100 range


def _platform_balance_score(df: pd.DataFrame) -> pd.Series:
    """
    Entropy-based platform balance.
    Uses crossPlatformSpikes7d as a proxy for multi-platform activity.
    ASSUMPTION: score is based on how many platforms show strong growth.
    TODO: Replace with real per-platform share entropy when data is available.
    """
    # crossPlatformSpikes7d: 0 = no platforms, higher = more balanced
    # Max reasonable value is ~5 platforms
    col = df.get("crossPlatformSpikes7d", pd.Series(0, index=df.index)).fillna(0)
    max_platforms = 5.0
    normalized = (col.clip(0, max_platforms) / max_platforms) * 100.0
    return normalized.apply(lambda p: _sigmoid_scale(float(p)))


# ---------------------------------------------------------------------------
# Main scoring
# ---------------------------------------------------------------------------

def compute_scores_for_date(conn, target_date: date) -> None:
    """
    Compute ArtistScoresDaily for all artists that have ArtistFeaturesDaily
    for target_date. Upserts into artist_scores_daily.

    Args:
        conn: psycopg2 connection
        target_date: Date to compute scores for
    """
    logger.info(f"Computing artist scores for {target_date}")

    sql = """
        SELECT
            "artistId",
            "listenersGrowth7d",
            "listenersGrowth14d",
            "listenersGrowth30d",
            "listenersGrowth90d",
            "followersGrowth7d",
            "followersGrowth30d",
            "airplayGrowth7d",
            "airplayGrowth30d",
            "chartPresence7d",
            "chartRankImprovement7d",
            "listenersVelocity7d",
            "listenersAcceleration7d",
            "tiktokVideosPerDay7d",
            "tiktokViewsGrowth7d",
            "crossPlatformSpikes7d",
            "streamsPerPlaylistAdd7d",
            "savesPerStream30d",
            "igEngagementPerFollower30d",
            "commentsPerView30d",
            "growthConsistency30d"
        FROM artist_features_daily
        WHERE date = %(date)s
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"date": target_date})
        rows = cur.fetchall()

    if not rows:
        logger.warning(f"No artist_features_daily rows found for {target_date}, skipping scoring.")
        return

    df = pd.DataFrame(rows)
    logger.info(f"Scoring {len(df)} artists")

    # Cast numeric columns
    numeric_cols = [c for c in df.columns if c != "artistId"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # --- Heat Score ---
    heat_pct = _weighted_percentile_score(df, HEAT_FEATURES)
    df["heatScoreRaw"] = heat_pct
    df["heatScore"] = heat_pct.apply(_sigmoid_scale)

    # --- Stability Score ---
    stab_pct = _weighted_percentile_score(df, STABILITY_FEATURES)
    df["stabilityScoreRaw"] = stab_pct
    df["stabilityScore"] = stab_pct.apply(_sigmoid_scale)

    # --- Platform Balance Score ---
    df["platformBalanceScore"] = _platform_balance_score(df)

    # --- Upsert ---
    upsert_sql = """
        INSERT INTO artist_scores_daily (
            "artistId", date,
            "heatScore", "stabilityScore", "platformBalanceScore",
            "heatScoreRaw", "stabilityScoreRaw",
            "modelVersion",
            "createdAt", "updatedAt"
        )
        VALUES (
            %(artistId)s, %(date)s,
            %(heatScore)s, %(stabilityScore)s, %(platformBalanceScore)s,
            %(heatScoreRaw)s, %(stabilityScoreRaw)s,
            %(modelVersion)s,
            NOW(), NOW()
        )
        ON CONFLICT ("artistId", date) DO UPDATE SET
            "heatScore"            = EXCLUDED."heatScore",
            "stabilityScore"       = EXCLUDED."stabilityScore",
            "platformBalanceScore" = EXCLUDED."platformBalanceScore",
            "heatScoreRaw"         = EXCLUDED."heatScoreRaw",
            "stabilityScoreRaw"    = EXCLUDED."stabilityScoreRaw",
            "modelVersion"         = EXCLUDED."modelVersion",
            "updatedAt"            = NOW()
    """

    def _safe_float(v) -> Optional[float]:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        return float(v)

    rows_to_upsert = [
        {
            "artistId": int(row["artistId"]),
            "date": target_date,
            "heatScore": _safe_float(row["heatScore"]),
            "stabilityScore": _safe_float(row["stabilityScore"]),
            "platformBalanceScore": _safe_float(row["platformBalanceScore"]),
            "heatScoreRaw": _safe_float(row["heatScoreRaw"]),
            "stabilityScoreRaw": _safe_float(row["stabilityScoreRaw"]),
            "modelVersion": MODEL_VERSION,
        }
        for _, row in df.iterrows()
    ]

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, upsert_sql, rows_to_upsert, page_size=200)
    conn.commit()
    logger.info(f"Upserted {len(rows_to_upsert)} artist_scores_daily rows for {target_date}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compute ArtistScoresDaily for a given date.")
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
        compute_scores_for_date(conn, args.date)
    finally:
        conn.close()
