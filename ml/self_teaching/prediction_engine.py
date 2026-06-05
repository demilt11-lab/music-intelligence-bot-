"""
Real-time prediction engine for the A&R bot.

Accepts artist ID or raw feature dict → returns breakout probability (0-100%),
confidence score, and top 3 predicting signals.

Caches predictions in memory (TTL=1h) to avoid re-scoring on every request.
Falls back to last cached prediction + warning if model unavailable.
"""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np

log = logging.getLogger(__name__)

try:
    from ml.monitoring.telemetry import telemetry as _tel
except Exception:
    _tel = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# PredictionOutput
# ---------------------------------------------------------------------------

@dataclass
class PredictionOutput:
    artist_id: int
    breakout_probability: float      # 0-100 (percentage)
    confidence_score: float          # 0-1
    model_version: str
    top_signals: list                # [{signal, value, weight, interpretation}]
    predicted_at: str                # ISO timestamp
    warning: Optional[str]
    from_cache: bool
    source_completeness: float = 1.0  # fraction of expected signals present


# ---------------------------------------------------------------------------
# PredictionCache
# ---------------------------------------------------------------------------

class PredictionCache:
    """Simple in-memory TTL cache."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: dict[str, tuple[float, dict]] = {}

    def get(self, key: str) -> Optional[dict]:
        entry = self._store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > self.ttl_seconds:
            # Mark as expired but keep in store for stale fallback (get_any_age)
            return None
        return value

    def set(self, key: str, value: dict) -> None:
        self._store[key] = (time.time(), value)

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def get_any_age(self, key: str) -> Optional[dict]:
        """Return cached value regardless of TTL (fallback path)."""
        entry = self._store.get(key)
        return entry[1] if entry else None


# ---------------------------------------------------------------------------
# SignalInterpreter
# ---------------------------------------------------------------------------

SIGNAL_INTERPRETATIONS = {
    "stream_velocity":   lambda v: f"{'Strong' if v > 0.6 else 'Moderate' if v > 0.3 else 'Weak'} streaming growth ({v:.0%})",
    "tiktok_growth":     lambda v: f"{'Viral' if v > 0.7 else 'Growing' if v > 0.4 else 'Low'} TikTok traction ({v:.0%})",
    "save_rate":         lambda v: f"{'High' if v > 0.5 else 'Normal' if v > 0.25 else 'Low'} save rate ({v:.0%})",
    "follower_velocity": lambda v: f"{'Rapid' if v > 0.3 else 'Steady' if v > 0.1 else 'Slow'} follower growth ({v:.0%})",
    "chart_momentum":    lambda v: f"{'Charting strongly' if v > 0.6 else 'Charting' if v > 0.3 else 'Not charting'}",
    "playlist_add":      lambda v: f"{'Heavy' if v > 0.6 else 'Moderate'} playlist activity",
    "radio_spike":       lambda v: f"{'Significant' if v > 0.5 else 'Moderate'} radio airplay",
    "organic_score":     lambda v: f"{'Exceptional' if v > 0.7 else 'Strong' if v > 0.5 else 'Average'} organic growth",
}


class SignalInterpreter:
    """Converts raw feature values to human-readable strings."""

    @staticmethod
    def interpret(signal: str, value: float) -> str:
        fn = SIGNAL_INTERPRETATIONS.get(signal)
        if fn:
            try:
                return fn(value)
            except Exception:
                pass
        return signal


# ---------------------------------------------------------------------------
# Feature column ordering (must match training)
# ---------------------------------------------------------------------------

EXPECTED_FEATURES = [
    "momentum", "breakout_prob", "virality_score", "peak_score_estimate",
    "confidence", "stream_velocity", "tiktok_growth", "save_rate",
    "follower_velocity", "chart_momentum", "playlist_add", "radio_spike",
    "organic_score", "score_product", "confidence_weighted_score",
    "breakout_momentum_ratio", "skip_rate_inv",
]

EXPECTED_SIGNALS = [
    "stream_velocity", "tiktok_growth", "save_rate", "follower_velocity",
    "chart_momentum", "playlist_add", "radio_spike", "skip_rate_inv",
    "pre_save_normalized", "listener_follower_conversion",
]
MIN_COMPLETENESS_FOR_HIGH_CONFIDENCE = 0.6  # < 60% signals = low confidence

SIGNAL_WEIGHTS: dict[str, float] = {
    "stream_velocity":   0.22,
    "tiktok_growth":     0.28,
    "save_rate":         0.18,
    "follower_velocity": 0.09,
    "chart_momentum":    0.15,
    "playlist_add":      0.05,
    "radio_spike":       0.03,
    "organic_score":     0.10,
}


# ---------------------------------------------------------------------------
# BreakoutPredictor
# ---------------------------------------------------------------------------

class BreakoutPredictor:
    """Real-time breakout prediction with TTL caching and graceful fallback."""

    def __init__(self, store_dir: str = "ml/outputs/model_store") -> None:
        from ml.self_teaching.model_store import ModelStore
        self._store = ModelStore(store_dir=store_dir)
        self._cache = PredictionCache(ttl_seconds=3600)
        self._model: Any = None
        self._model_meta: Any = None
        self._model_available = False
        self._try_load_model()

    def _try_load_model(self) -> None:
        from ml.self_teaching.model_store import NoActiveModelError
        try:
            self._model, self._model_meta = self._store.load_active()
            self._model_available = True
            log.info("Loaded active model version %s", self._model_meta.version)
        except (NoActiveModelError, Exception) as exc:
            log.warning("No active model available: %s", exc)
            self._model_available = False

    def reload_model(self) -> bool:
        """Re-attempt to load the active model. Returns True if successful."""
        self._try_load_model()
        return self._model_available

    def predict(self, artist_id: int, features: dict) -> PredictionOutput:
        _t0 = time.monotonic()
        cache_key = str(artist_id)

        # Cache hit
        cached = self._cache.get(cache_key)
        if cached is not None:
            out = PredictionOutput(**{**cached, "from_cache": True, "warning": None})
            if _tel:
                _tel.record_prediction(
                    artist_id=artist_id,
                    breakout_prob=out.breakout_probability,
                    confidence=out.confidence_score,
                    latency_seconds=time.monotonic() - _t0,
                    from_cache=True,
                )
            return out

        # Model unavailable — try stale cache then neutral fallback
        if not self._model_available:
            stale = self._cache.get_any_age(cache_key)
            if stale is not None:
                return PredictionOutput(
                    **{**stale, "from_cache": True,
                       "warning": "Using cached prediction — model unavailable"}
                )
            return PredictionOutput(
                artist_id=artist_id,
                breakout_probability=50.0,
                confidence_score=0.1,
                model_version="none",
                top_signals=[],
                predicted_at=datetime.now(timezone.utc).isoformat(),
                warning="No model available, using baseline estimate",
                from_cache=False,
            )

        # Build feature vector
        X = self._build_feature_vector(features)

        # Score
        try:
            raw_prob = float(self._model.clf_viral.predict_proba(X)[0, 1])
        except Exception as exc:
            log.warning("Prediction failed: %s", exc)
            raw_prob = 0.5

        # Confidence from feature completeness
        non_null = sum(1 for k in EXPECTED_FEATURES if features.get(k) is not None)
        confidence_score = non_null / max(len(EXPECTED_FEATURES), 1)

        # Compute source completeness — fraction of expected signals present
        n_available = sum(1 for s in EXPECTED_SIGNALS if features.get(s) is not None)
        source_completeness = n_available / len(EXPECTED_SIGNALS)

        # Override confidence downward if data is too sparse
        warning = None
        if source_completeness < MIN_COMPLETENESS_FOR_HIGH_CONFIDENCE:
            confidence_score = min(confidence_score, 0.40)
            warning = (warning or "") + f" Low signal completeness ({source_completeness:.0%}); prediction unreliable."

        # Top 3 signals by importance × value
        top_signals = self._top_signals(features)

        output = PredictionOutput(
            artist_id=artist_id,
            breakout_probability=round(raw_prob * 100, 2),
            confidence_score=round(confidence_score, 4),
            model_version=self._model_meta.version if self._model_meta else "unknown",
            top_signals=top_signals,
            predicted_at=datetime.now(timezone.utc).isoformat(),
            warning=warning,
            from_cache=False,
            source_completeness=round(source_completeness, 4),
        )

        # Cache
        import dataclasses
        self._cache.set(cache_key, dataclasses.asdict(output))

        if _tel:
            _tel.record_prediction(
                artist_id=artist_id,
                breakout_prob=output.breakout_probability,
                confidence=output.confidence_score,
                latency_seconds=time.monotonic() - _t0,
                from_cache=False,
            )

        return output

    def predict_batch(self, requests: list[dict]) -> list[PredictionOutput]:
        """Score a batch in a single model call."""
        if not requests:
            return []

        results = []
        if not self._model_available:
            for req in requests:
                results.append(self.predict(req.get("artist_id", 0), req.get("features", {})))
            return results

        artist_ids = [r.get("artist_id", 0) for r in requests]
        feature_dicts = [r.get("features", {}) for r in requests]

        X_batch = np.vstack([self._build_feature_vector(f) for f in feature_dicts])
        try:
            probs = self._model.clf_viral.predict_proba(X_batch)[:, 1]
        except Exception:
            probs = np.full(len(requests), 0.5)

        model_version = self._model_meta.version if self._model_meta else "unknown"
        now = datetime.now(timezone.utc).isoformat()

        import dataclasses
        for i, (aid, feats) in enumerate(zip(artist_ids, feature_dicts)):
            non_null = sum(1 for k in EXPECTED_FEATURES if feats.get(k) is not None)
            confidence_score = non_null / max(len(EXPECTED_FEATURES), 1)
            n_available = sum(1 for s in EXPECTED_SIGNALS if feats.get(s) is not None)
            source_completeness = n_available / len(EXPECTED_SIGNALS)
            batch_warning = None
            if source_completeness < MIN_COMPLETENESS_FOR_HIGH_CONFIDENCE:
                confidence_score = min(confidence_score, 0.40)
                batch_warning = f" Low signal completeness ({source_completeness:.0%}); prediction unreliable."
            output = PredictionOutput(
                artist_id=aid,
                breakout_probability=round(float(probs[i]) * 100, 2),
                confidence_score=round(confidence_score, 4),
                model_version=model_version,
                top_signals=self._top_signals(feats),
                predicted_at=now,
                warning=batch_warning,
                from_cache=False,
                source_completeness=round(source_completeness, 4),
            )
            self._cache.set(str(aid), dataclasses.asdict(output))
            results.append(output)

        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_feature_vector(self, features: dict) -> np.ndarray:
        row = [float(features.get(col, 0.0) or 0.0) for col in EXPECTED_FEATURES]
        return np.array(row, dtype=np.float32).reshape(1, -1)

    def _top_signals(self, features: dict) -> list[dict]:
        signals = []
        for sig, weight in SIGNAL_WEIGHTS.items():
            value = features.get(sig)
            if value is not None:
                try:
                    v = float(value)
                except (TypeError, ValueError):
                    continue
                signals.append({
                    "signal":         sig,
                    "value":          v,
                    "weight":         weight,
                    "interpretation": SignalInterpreter.interpret(sig, v),
                })
        signals.sort(key=lambda s: s["weight"] * s["value"], reverse=True)
        return signals[:3]
