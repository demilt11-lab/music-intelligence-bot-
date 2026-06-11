"""
ml/backtest_rankings.py
Backtests the breaking-artists ranking against realized outcomes.

For each historical snapshot date (weekly steps), takes the top-K artists by
statusScore and checks whether each artist's trailing-28d streams grew by at
least OUTCOME_GROWTH within HORIZON_DAYS. Reports precision@K per window and
overall, and upserts the overall figure into model_accuracy_reports
(modelName='ranking_backtest_topK') so the product can display measured —
not claimed — ranking quality.

This is the number to quote to a label exec: "of our weekly top-K, X% showed
real breakout-grade growth within 30 days."

Usage:
  DATABASE_URL=... python -m ml.backtest_rankings [--k 20] [--horizon-days 30]
                                                  [--growth 0.5] [--step-days 7]
"""

import argparse
import logging
import os
import sys
from datetime import date, timedelta

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger("backtest_rankings")


def fetch_snapshot_dates(conn) -> list[date]:
    with conn.cursor() as cur:
        cur.execute('SELECT DISTINCT "date"::date FROM "ArtistTrajectorySnapshot" ORDER BY 1')
        return [r[0] for r in cur.fetchall()]


def top_k_at(conn, snapshot_date: date, k: int) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            '''
            SELECT "artistId", "statusScore", "streams28d"
            FROM "ArtistTrajectorySnapshot"
            WHERE "date"::date = %(d)s
            ORDER BY "statusScore" DESC, "artistId" ASC
            LIMIT %(k)s
            ''',
            {"d": snapshot_date, "k": k},
        )
        return list(cur.fetchall())


def streams_28d_at(conn, artist_id: int, on_date: date) -> float | None:
    """Trailing 28d stream total ending at on_date, from artist_daily_stats."""
    with conn.cursor() as cur:
        cur.execute(
            '''
            SELECT SUM("totalStreams")::numeric
            FROM artist_daily_stats
            WHERE "artistId" = %(aid)s
              AND "date"::date > %(start)s
              AND "date"::date <= %(end)s
            ''',
            {
                "aid": artist_id,
                "start": on_date - timedelta(days=28),
                "end": on_date,
            },
        )
        row = cur.fetchone()
        return float(row[0]) if row and row[0] is not None else None


def upsert_accuracy_report(conn, model_name: str, eval_date: date, window_days: int,
                           total: int, correct: int) -> None:
    accuracy = correct / total if total else 0.0
    with conn.cursor() as cur:
        cur.execute(
            '''
            INSERT INTO model_accuracy_reports
              ("modelName", "evaluationDate", "windowDays",
               "totalPredictions", "correctPredictions", "accuracy",
               "precision", notes, "createdAt")
            VALUES (%(m)s, %(d)s, %(w)s, %(t)s, %(c)s, %(a)s, %(a)s,
                    %(notes)s, NOW())
            ON CONFLICT ("modelName", "evaluationDate", "windowDays") DO UPDATE SET
              "totalPredictions"   = EXCLUDED."totalPredictions",
              "correctPredictions" = EXCLUDED."correctPredictions",
              "accuracy"           = EXCLUDED."accuracy",
              "precision"          = EXCLUDED."precision",
              notes                = EXCLUDED.notes
            ''',
            {
                "m": model_name,
                "d": eval_date,
                "w": window_days,
                "t": total,
                "c": correct,
                "a": accuracy,
                "notes": "precision@K of the breaking-artists ranking vs realized 28d stream growth",
            },
        )
    conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backtest ranking precision@K.")
    parser.add_argument("--k", type=int, default=20)
    parser.add_argument("--horizon-days", type=int, default=30)
    parser.add_argument("--growth", type=float, default=0.5,
                        help="Outcome threshold: 28d streams must grow by this fraction")
    parser.add_argument("--step-days", type=int, default=7)
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        return 1

    conn = psycopg2.connect(database_url)
    try:
        all_dates = fetch_snapshot_dates(conn)
        horizon = timedelta(days=args.horizon_days)
        today = date.today()

        # Only windows whose outcome horizon has fully elapsed are evaluable.
        eval_dates: list[date] = []
        last_kept: date | None = None
        for d in all_dates:
            if d + horizon > today:
                continue
            if last_kept is None or (d - last_kept).days >= args.step_days:
                eval_dates.append(d)
                last_kept = d

        if not eval_dates:
            logger.warning(
                "No snapshot dates with a fully elapsed %dd horizon yet — "
                "backtest needs at least %d days of history. Nothing to report.",
                args.horizon_days, args.horizon_days,
            )
            return 0

        total_picked = 0
        total_hits = 0

        for d in eval_dates:
            picks = top_k_at(conn, d, args.k)
            hits = 0
            evaluable = 0
            for p in picks:
                base = streams_28d_at(conn, p["artistId"], d)
                future = streams_28d_at(conn, p["artistId"], d + horizon)
                if base is None or future is None or base <= 0:
                    continue  # no outcome data — excluded, not counted as a miss
                evaluable += 1
                if (future - base) / base >= args.growth:
                    hits += 1
            if evaluable:
                logger.info(
                    "window %s: precision@%d = %.2f (%d/%d evaluable)",
                    d, args.k, hits / evaluable, hits, evaluable,
                )
                total_picked += evaluable
                total_hits += hits

        if total_picked == 0:
            logger.warning("No evaluable picks across any window — outcome data is missing.")
            return 0

        precision = total_hits / total_picked
        logger.info(
            "OVERALL precision@%d over %d windows: %.3f (%d/%d) — "
            "growth threshold +%.0f%% within %dd",
            args.k, len(eval_dates), precision, total_hits, total_picked,
            args.growth * 100, args.horizon_days,
        )

        upsert_accuracy_report(
            conn,
            model_name=f"ranking_backtest_top{args.k}",
            eval_date=today,
            window_days=args.horizon_days,
            total=total_picked,
            correct=total_hits,
        )
        logger.info("Wrote model_accuracy_reports row (ranking_backtest_top%d)", args.k)
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
