"""
User Feedback Collector

Reads from the `user_feedback` database table and the request logs, then
generates augmented training labels. The output is a parquet file that is
merged into the main training datasets before retraining.

How user signals feed into training:
  1. Explicit feedback  — third-party API consumers POST /api/v1/feedback
     with a label, is_viral, or is_popular flag. These become high-confidence
     training samples (weight × 3).

  2. Implicit API signals — which tracks are queried most often for trend
     and trajectory data. Repeated lookups for a specific track indicate
     professional interest (A&R, playlist curators). These become soft
     positive labels (weight × 1.5) for TRENDING.

  3. Search patterns — tracks that appear in many tenant search queries
     within a short window get an implicit "rising" label.

Output files (merged into main training data before each retrain):
  data/feedback_viral_labels.parquet
  data/feedback_popularity_labels.parquet
  data/feedback_trend_labels.parquet
"""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
import psycopg2
import psycopg2.extras

from ml.config import DATA_DIR, configure_logging
from ml.pipeline.feature_store import FeatureStore

logger = configure_logging(__name__)

DATA_DIR.mkdir(parents=True, exist_ok=True)

VIRAL_OUT   = DATA_DIR / "feedback_viral_labels.parquet"
POPULAR_OUT = DATA_DIR / "feedback_popularity_labels.parquet"
TREND_OUT   = DATA_DIR / "feedback_trend_labels.parquet"

TREND_LABEL_MAP = {
    "viral":    "VIRAL",
    "trending": "TRENDING",
    "popular":  "POPULAR",
    "none":     "NONE",
    "rising":   "TRENDING",
    "peaking":  "POPULAR",
    "declining":"NONE",
}


class FeedbackCollector:
    def __init__(self, db_url: Optional[str] = None):
        self._db_url = db_url or os.environ["DATABASE_URL"]
        self._store = FeatureStore(db_url=self._db_url)

    def _conn(self):
        return psycopg2.connect(self._db_url, cursor_factory=psycopg2.extras.RealDictCursor)

    # ── main entry point ──────────────────────────────────────────────────

    def collect_and_export(self, since_days: int = 30):
        """
        Pull all feedback signals from the last `since_days` and write
        augmented label parquet files that the training scripts will merge.
        """
        cutoff = datetime.utcnow() - timedelta(days=since_days)

        with self._conn() as conn:
            with conn.cursor() as cur:
                explicit   = self._fetch_explicit_feedback(cur, cutoff)
                implicit   = self._fetch_implicit_signals(cur, cutoff)
                search_sig = self._fetch_search_signals(cur, cutoff)

        all_track_ids = list({r["track_id"] for r in explicit + implicit + search_sig})
        if not all_track_ids:
            logger.info("No feedback signals found in last %d days", since_days)
            return

        logger.info("Fetching features for %d feedback tracks", len(all_track_ids))
        base_records = self._store.fetch_track_features(
            track_ids=all_track_ids, with_labels=False
        )
        base_map = {r["trackId"]: r for r in base_records}

        viral_rows   = []
        popular_rows = []
        trend_rows   = []

        # ── Explicit feedback (highest confidence) ────────────────────────
        for fb in explicit:
            tid = fb["track_id"]
            base = base_map.get(tid, {"trackId": tid})

            if fb.get("is_viral") is not None:
                row = {**base, "viral_30d": int(fb["is_viral"]), "sample_weight": 3.0}
                viral_rows.append(row)

            if fb.get("is_popular") is not None:
                row = {**base, "popular_30d": int(fb["is_popular"]), "sample_weight": 3.0}
                popular_rows.append(row)

            if fb.get("label"):
                mapped = TREND_LABEL_MAP.get(fb["label"].lower())
                if mapped:
                    row = {**base, "label": mapped, "sample_weight": 3.0}
                    trend_rows.append(row)

        # ── Implicit API query signals ────────────────────────────────────
        track_query_counts: Dict[int, int] = defaultdict(int)
        for sig in implicit:
            track_query_counts[sig["track_id"]] += sig.get("query_count", 1)

        for tid, count in track_query_counts.items():
            if count < 5:
                continue  # noise threshold
            base = base_map.get(tid, {"trackId": tid})
            weight = min(1.5 + count / 20.0, 3.0)
            # High query count implies the track is on professional radar → TRENDING
            row = {**base, "label": "TRENDING", "sample_weight": weight}
            trend_rows.append(row)

        # ── Search signal ──────────────────────────────────────────────────
        search_counts: Dict[int, int] = defaultdict(int)
        for sig in search_sig:
            search_counts[sig["track_id"]] += sig.get("search_count", 1)

        for tid, count in search_counts.items():
            if count < 3:
                continue
            base = base_map.get(tid, {"trackId": tid})
            weight = min(1.2 + count / 30.0, 2.0)
            row = {**base, "label": "TRENDING", "sample_weight": weight}
            trend_rows.append(row)

        # ── Write outputs ─────────────────────────────────────────────────
        if viral_rows:
            pd.DataFrame.from_records(viral_rows).to_parquet(str(VIRAL_OUT), index=False)
            logger.info("Wrote %d viral feedback rows to %s", len(viral_rows), VIRAL_OUT)

        if popular_rows:
            pd.DataFrame.from_records(popular_rows).to_parquet(str(POPULAR_OUT), index=False)
            logger.info("Wrote %d popularity feedback rows to %s", len(popular_rows), POPULAR_OUT)

        if trend_rows:
            pd.DataFrame.from_records(trend_rows).to_parquet(str(TREND_OUT), index=False)
            logger.info("Wrote %d trend feedback rows to %s", len(trend_rows), TREND_OUT)

    # ── DB query helpers ──────────────────────────────────────────────────

    def _fetch_explicit_feedback(self, cur, cutoff: datetime) -> List[Dict]:
        try:
            cur.execute(
                """
                SELECT track_id, label, is_viral, is_popular, created_at
                FROM user_feedback
                WHERE created_at >= %s
                ORDER BY created_at DESC
                """,
                (cutoff,),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.debug("user_feedback table not found (expected before first migration): %s", e)
            return []

    def _fetch_implicit_signals(self, cur, cutoff: datetime) -> List[Dict]:
        """
        Count how many times each track was queried via /trend and /trajectory
        endpoints across all tenants — proxy for professional interest.
        """
        try:
            cur.execute(
                """
                SELECT
                    CAST(
                        regexp_replace(endpoint, '.*/tracks/([0-9]+)/.*', '\\1')
                        AS INTEGER
                    ) AS track_id,
                    COUNT(*) AS query_count
                FROM request_logs
                WHERE endpoint ~ '/tracks/[0-9]+/(trend|trajectory|features)'
                  AND status_code = 200
                  AND created_at >= %s
                GROUP BY track_id
                HAVING COUNT(*) >= 5
                ORDER BY query_count DESC
                LIMIT 5000
                """,
                (cutoff,),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.debug("request_logs query failed: %s", e)
            return []

    def _fetch_search_signals(self, cur, cutoff: datetime) -> List[Dict]:
        """
        Extract track IDs from search query logs.
        When multiple tenants search the same track, it's gaining real-world
        attention and should be treated as a soft TRENDING signal.
        """
        try:
            cur.execute(
                """
                SELECT
                    CAST(
                        regexp_replace(endpoint, '.*/tracks/([0-9]+).*', '\\1')
                        AS INTEGER
                    ) AS track_id,
                    COUNT(DISTINCT tenant_id) AS search_count
                FROM request_logs
                WHERE endpoint ~ '/api/v1/search'
                  AND status_code = 200
                  AND created_at >= %s
                GROUP BY track_id
                HAVING COUNT(DISTINCT tenant_id) >= 3
                LIMIT 2000
                """,
                (cutoff,),
            )
            return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.debug("search log query failed: %s", e)
            return []


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--since-days", type=int, default=30)
    args = parser.parse_args()
    FeedbackCollector().collect_and_export(since_days=args.since_days)


if __name__ == "__main__":
    main()
