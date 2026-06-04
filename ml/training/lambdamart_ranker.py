"""
LambdaMART signal ranking for A&R explanations.

Learns to rank signals by their predictive contribution for each artist context,
optimizing NDCG (Normalized Discounted Cumulative Gain) directly.

This goes beyond global feature importance (XGBoost gain) by learning
context-dependent signal rankings — e.g., save_rate matters more for
pop artists, TikTok matters more for artists under 100K followers.

Training:
  - Query = artist (grouped by artist_id)
  - Documents = signals (one per signal type)
  - Relevance = how much that signal's value predicted breakout outcome (0-3 scale)

Inference:
  - Given artist's current signals, return ranked list of signals by predictive importance
"""
import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

# Relevance labels (0-3 scale for NDCG)
IRRELEVANT = 0       # signal present but not predictive for this artist
MARGINAL = 1         # slight predictive value
RELEVANT = 2         # meaningful contribution
HIGHLY_RELEVANT = 3  # primary driver of breakout signal

# Global signal weights (used as fallback without XGBoost)
SIGNAL_WEIGHTS = {
    "save_rate": 0.22,
    "tiktok_growth": 0.28,
    "stream_velocity": 0.20,
    "follower_velocity": 0.09,
    "chart_momentum": 0.10,
    "playlist_signal": 0.05,
    "radio_spike": 0.02,
    "pre_save_normalized": 0.02,
}


@dataclass
class RankingQuery:
    artist_id: int
    signal_names: list        # all signals for this artist
    signal_values: np.ndarray     # shape (n_signals,) — normalized values
    signal_features: np.ndarray   # shape (n_signals, n_features) — per-signal features
    relevance_labels: np.ndarray  # shape (n_signals,) — 0-3 relevance (from outcome data)


class SignalFeatureExtractor:
    """Extracts per-signal features for ranking model input."""

    FEATURE_NAMES = [
        "signal_value",              # normalized signal value 0-1
        "signal_value_sq",           # quadratic term
        "signal_trend_slope",        # recent trend (+/- rate of change)
        "signal_percentile_approx",  # approximate percentile vs benchmark
        "signal_global_weight",      # from SIGNAL_WEIGHTS dict
        "is_official_source",        # 1 if official, 0 if unofficial/scraped
        "age_hours_normalized",      # signal age / TTL (0=fresh, 1=at TTL, >1=stale)
        "artist_follower_tier",      # 0=micro(<10K), 1=mid(10K-100K), 2=macro(>100K)
        "genre_encoded",             # one-hot or ordinal genre encoding
    ]

    def extract(self, signal_name: str, signal_value: float, signal_meta: dict) -> np.ndarray:
        """Returns feature vector for a single (artist, signal) pair."""
        val = float(signal_value)
        val_clamped = float(np.clip(val, 0.0, 1.0))

        # signal_value: normalized 0-1
        f_signal_value = val_clamped

        # signal_value_sq
        f_signal_value_sq = val_clamped ** 2

        # signal_trend_slope: from meta, default 0.0
        f_trend_slope = float(signal_meta.get("trend_slope", 0.0))

        # signal_percentile_approx: val as rough percentile proxy
        f_percentile = float(np.clip(val_clamped, 0.0, 1.0))

        # signal_global_weight
        f_global_weight = float(SIGNAL_WEIGHTS.get(signal_name, 0.01))

        # is_official_source
        source = signal_meta.get("source", "official")
        f_is_official = 0.0 if source == "unofficial" else 1.0

        # age_hours_normalized: age_hours / TTL
        age_hours = float(signal_meta.get("age_hours", 0.0))
        ttl = float(signal_meta.get("ttl_hours", 24.0))
        f_age_norm = age_hours / max(ttl, 1.0)

        # artist_follower_tier
        followers = int(signal_meta.get("artist_followers", 0))
        if followers < 10_000:
            f_tier = 0.0
        elif followers < 100_000:
            f_tier = 1.0
        else:
            f_tier = 2.0

        # genre_encoded: ordinal from meta
        f_genre = float(signal_meta.get("genre_encoded", 0.0))

        return np.array([
            f_signal_value,
            f_signal_value_sq,
            f_trend_slope,
            f_percentile,
            f_global_weight,
            f_is_official,
            f_age_norm,
            f_tier,
            f_genre,
        ], dtype=np.float32)


class LambdaMARTRanker:
    """
    LambdaMART approximation using XGBoost's rank:ndcg objective.

    XGBoost supports learning-to-rank natively via:
      objective = "rank:ndcg"
      eval_metric = "ndcg@3"   # optimize top-3 ranking (what A&R sees)
    """

    def __init__(self, xgb_params: Optional[dict] = None):
        self.params = xgb_params or {
            "objective": "rank:ndcg",
            "eval_metric": ["ndcg@3", "ndcg@5"],
            "learning_rate": 0.05,
            "max_depth": 4,
            "n_estimators": 200,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_weight": 5,
        }
        self._model = None
        self._extractor = SignalFeatureExtractor()

    def fit(self, queries: list) -> "LambdaMARTRanker":
        """
        Train on a list of (artist, signals, relevance) queries.

        Converts to XGBoost DMatrix with group structure (one group per artist).
        """
        X_parts = []
        y_parts = []
        groups = []

        for q in queries:
            X_parts.append(q.signal_features)
            y_parts.append(q.relevance_labels)
            groups.append(len(q.signal_names))

        if not X_parts:
            log.warning("No training queries provided; skipping fit.")
            return self

        X = np.vstack(X_parts).astype(np.float32)
        y = np.concatenate(y_parts).astype(np.float32)
        groups_arr = np.array(groups, dtype=np.int32)

        # Try XGBoost import; if unavailable, fall back to pre-learned weights
        try:
            import xgboost as xgb
            dtrain = xgb.DMatrix(X, label=y)
            dtrain.set_group(groups_arr)
            # Extract num_boost_round from params, don't pass as booster param
            num_boost_round = self.params.pop("n_estimators", 200)
            self._model = xgb.train(
                self.params,
                dtrain,
                num_boost_round=num_boost_round,
            )
            self.params["n_estimators"] = num_boost_round  # restore
        except ImportError:
            log.warning("XGBoost not available; using pre-learned weight fallback")
            self._model = None

        return self

    def rank(self, artist_id: int, signals: dict, signal_meta: dict) -> list:
        """
        Rank signals for a specific artist.

        Returns list of {signal, score, rank} sorted by score descending.
        Falls back to global weight × value if model not trained.
        """
        if self._model is None:
            # Pre-learned weight fallback — still useful without training data
            results = []
            for sig, val in signals.items():
                weight = SIGNAL_WEIGHTS.get(sig, 0.01)
                source_discount = 0.70 if signal_meta.get(sig, {}).get("source") == "unofficial" else 1.0
                score = weight * val * source_discount
                results.append({"signal": sig, "score": score})
            results.sort(key=lambda x: x["score"], reverse=True)
            for i, r in enumerate(results):
                r["rank"] = i + 1
            return results

        # Model-based ranking
        try:
            import xgboost as xgb
            X = np.array([
                self._extractor.extract(sig, val, signal_meta.get(sig, {}))
                for sig, val in signals.items()
            ])
            scores = self._model.predict(xgb.DMatrix(X))
            results = [
                {"signal": sig, "score": float(scores[i])}
                for i, sig in enumerate(signals.keys())
            ]
            results.sort(key=lambda x: x["score"], reverse=True)
            for i, r in enumerate(results):
                r["rank"] = i + 1
            return results
        except Exception as e:
            log.warning(f"LambdaMART prediction failed: {e}; using fallback")
            # Reset model to None temporarily to use fallback
            saved_model = self._model
            self._model = None
            result = self.rank(artist_id, signals, signal_meta)
            self._model = saved_model
            return result

    def compute_relevance_from_outcomes(self, df: pd.DataFrame) -> list:
        """
        Build training queries from historical prediction outcome data.

        For each artist with a known outcome (broke out / didn't):
        - For each signal, compute relevance (0-3) based on:
          - Value percentile × outcome correlation
          - High value + artist broke out = HIGHLY_RELEVANT (3)
          - High value + artist didn't break out = MARGINAL (1)
          - Low value + artist broke out = IRRELEVANT (0)
          - Low value + artist didn't break out = RELEVANT (2) [signal correctly predicted failure]
        """
        required_cols = {"artist_id", "signal_name", "signal_value", "broke_out"}
        if not required_cols.issubset(df.columns):
            missing = required_cols - set(df.columns)
            raise ValueError(f"DataFrame missing columns: {missing}")

        queries = []
        # Compute per-signal global percentile thresholds (50th as boundary)
        signal_medians = df.groupby("signal_name")["signal_value"].median().to_dict()

        for artist_id, artist_df in df.groupby("artist_id"):
            if artist_df.empty:
                continue

            broke_out = bool(artist_df["broke_out"].iloc[0])
            signal_names = artist_df["signal_name"].tolist()
            signal_values = artist_df["signal_value"].values.astype(np.float32)

            relevance = []
            for _, row in artist_df.iterrows():
                sig = row["signal_name"]
                val = float(row["signal_value"])
                median = signal_medians.get(sig, 0.5)
                high_val = val >= median

                if broke_out and high_val:
                    rel = HIGHLY_RELEVANT
                elif not broke_out and high_val:
                    rel = MARGINAL
                elif broke_out and not high_val:
                    rel = IRRELEVANT
                else:  # not broke_out and not high_val
                    rel = RELEVANT
                relevance.append(rel)

            relevance_arr = np.array(relevance, dtype=np.float32)

            # Build per-signal features (use empty meta — no additional context available)
            signal_features = np.array([
                self._extractor.extract(
                    signal_names[i],
                    float(signal_values[i]),
                    {},
                )
                for i in range(len(signal_names))
            ], dtype=np.float32)

            queries.append(RankingQuery(
                artist_id=int(artist_id),
                signal_names=signal_names,
                signal_values=signal_values,
                signal_features=signal_features,
                relevance_labels=relevance_arr,
            ))

        return queries

    def save(self, path: str) -> None:
        import cloudpickle
        with open(path, "wb") as f:
            cloudpickle.dump(self, f)

    @classmethod
    def load(cls, path: str) -> "LambdaMARTRanker":
        import cloudpickle
        with open(path, "rb") as f:
            return cloudpickle.load(f)

    def ndcg_score(self, queries: list, k: int = 3) -> float:
        """Compute mean NDCG@k across all queries (evaluation metric)."""
        if not queries:
            return 0.0

        ndcg_scores = []
        for q in queries:
            if self._model is None:
                # Use fallback: score by global weight × value
                scores = np.array([
                    SIGNAL_WEIGHTS.get(sig, 0.01) * float(q.signal_values[i])
                    for i, sig in enumerate(q.signal_names)
                ])
            else:
                try:
                    import xgboost as xgb
                    X = q.signal_features
                    scores = self._model.predict(xgb.DMatrix(X))
                except Exception:
                    scores = np.array([
                        SIGNAL_WEIGHTS.get(sig, 0.01) * float(q.signal_values[i])
                        for i, sig in enumerate(q.signal_names)
                    ])

            ndcg = _ndcg_at_k(q.relevance_labels, scores, k=k)
            ndcg_scores.append(ndcg)

        return float(np.mean(ndcg_scores))


def _dcg_at_k(relevances: np.ndarray, k: int) -> float:
    """Compute DCG@k given relevance values in ranked order."""
    relevances = np.asarray(relevances, dtype=np.float64)[:k]
    if relevances.size == 0:
        return 0.0
    gains = (2.0 ** relevances - 1.0) / np.log2(np.arange(2, relevances.size + 2))
    return float(gains.sum())


def _ndcg_at_k(true_relevances: np.ndarray, scores: np.ndarray, k: int) -> float:
    """Compute NDCG@k: actual DCG / ideal DCG."""
    order = np.argsort(scores)[::-1]
    ranked_rel = true_relevances[order]
    dcg = _dcg_at_k(ranked_rel, k)

    ideal_order = np.argsort(true_relevances)[::-1]
    ideal_rel = true_relevances[ideal_order]
    idcg = _dcg_at_k(ideal_rel, k)

    if idcg == 0.0:
        return 1.0  # all labels are 0 → perfect by convention
    return dcg / idcg
