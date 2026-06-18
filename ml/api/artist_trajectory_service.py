"""
Music Intelligence ML Service

FastAPI service exposing:
  POST /v1/artist/trajectory/predict  — artist breakout classification
  POST /v1/track/predict              — viral + popularity + trend classification
  POST /v1/track/predict/batch        — batch track prediction
  POST /v1/feedback                   — ingest user feedback labels
  GET  /health                        — service health check
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from ml.artist_trajectory_model import (
    FEATURE_COLS,
    MODEL_NAME,
    MODEL_VERSION,
    MODEL_PATH,
    SCALER_PATH,
    INV_STATUS_MAP,
)
from ml.inference.service import score_batch
from ml.inference.metrics_writer import update_from_batch_result
from ml.config import configure_logging, MODEL_DIR

# Neural predictor — imported lazily so the service starts even if models aren't trained yet
_neural_predict       = None
_neural_predict_batch = None

def _get_neural():
    global _neural_predict, _neural_predict_batch
    if _neural_predict is None:
        try:
            from ml.inference.neural_predictor import predict, predict_batch
            _neural_predict       = predict
            _neural_predict_batch = predict_batch
        except Exception as e:
            logger.warning("Neural predictor not available: %s", e)
    return _neural_predict, _neural_predict_batch

logger = configure_logging("ml.api")

app = FastAPI(
    title="Music Intelligence ML Service",
    version="2.0.0",
    description="Viral prediction, popularity forecasting, and artist breakout classification.",
)


# ── startup ───────────────────────────────────────────────────────────────────

_trajectory_clf = None
_trajectory_scaler = None

@app.on_event("startup")
def _load_models():
    global _trajectory_clf, _trajectory_scaler
    if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
        _trajectory_clf    = joblib.load(MODEL_PATH)
        _trajectory_scaler = joblib.load(SCALER_PATH)
        logger.info("Loaded trajectory model from %s", MODEL_PATH)
    else:
        logger.warning("Trajectory model not found — /v1/artist/trajectory/predict will fail")


# ── Artist Trajectory ─────────────────────────────────────────────────────────

class ArtistFeatures(BaseModel):
    artist_id: int
    streams7dDelta: float = 0.0
    streams28dDelta: float = 0.0
    streams90dDelta: float = 0.0
    playlistsDelta28d: float = 0.0
    followersDelta28d: float = 0.0
    tiktokVelocityScore: float = 0.0
    airplayVelocityScore: float = 0.0
    maxTrackProbViral: float = 0.0
    spotifyBreakProb: float = 0.0


class ArtistPrediction(BaseModel):
    artist_id: int
    status: str
    breakProbability: float
    modelName: str
    modelVersion: str


@app.post("/v1/artist/trajectory/predict", response_model=Dict[str, List[ArtistPrediction]])
def predict_trajectory(body: Dict[str, List[ArtistFeatures]]):
    items = body.get("items") or []
    if not items:
        raise HTTPException(status_code=400, detail="items is required and must be non-empty")

    if _trajectory_clf is None:
        raise HTTPException(status_code=503, detail="Trajectory model not loaded")

    artist_ids = [item.artist_id for item in items]

    # Build a numpy array directly — no pandas DataFrame overhead in the hot path.
    col_index = {c: i for i, c in enumerate(FEATURE_COLS)}
    matrix = np.zeros((len(items), len(FEATURE_COLS)), dtype=np.float32)
    for row_i, item in enumerate(items):
        matrix[row_i, col_index["streams7dDelta"]]      = item.streams7dDelta
        matrix[row_i, col_index["streams28dDelta"]]     = item.streams28dDelta
        matrix[row_i, col_index["streams90dDelta"]]     = item.streams90dDelta
        matrix[row_i, col_index["playlistsDelta28d"]]   = item.playlistsDelta28d
        matrix[row_i, col_index["followersDelta28d"]]   = item.followersDelta28d
        matrix[row_i, col_index["tiktokVelocityScore"]] = item.tiktokVelocityScore
        matrix[row_i, col_index["airplayVelocityScore"]]= item.airplayVelocityScore
        matrix[row_i, col_index["maxTrackProbViral"]]   = item.maxTrackProbViral
        matrix[row_i, col_index["spotifyBreakProb"]]    = item.spotifyBreakProb

    X = _trajectory_scaler.transform(matrix)
    probs = _trajectory_clf.predict_proba(X)
    preds = _trajectory_clf.predict(X)

    class_to_idx = {cls: i for i, cls in enumerate(_trajectory_clf.classes_)}
    about_idx = class_to_idx.get(3)
    break_probs = probs[:, about_idx] if about_idx is not None else probs.max(axis=1)

    result = []
    for i, artist_id in enumerate(artist_ids):
        result.append(ArtistPrediction(
            artist_id=artist_id,
            status=INV_STATUS_MAP.get(int(preds[i]), "STABLE"),
            breakProbability=float(break_probs[i]),
            modelName=MODEL_NAME,
            modelVersion=MODEL_VERSION,
        ))

    return {"items": result}


# ── Track Prediction ──────────────────────────────────────────────────────────

class TrackFeatureInput(BaseModel):
    trackId: int = Field(..., description="Internal track ID")
    # Audio
    bpm: Optional[float] = None
    energy: Optional[float] = None
    danceability: Optional[float] = None
    valence: Optional[float] = None
    loudness: Optional[float] = None
    tempo: Optional[float] = None
    # Spotify
    spotify_streams: Optional[float] = None
    spotify_popularity: Optional[int] = None
    spotify_stream_velocity_7d: Optional[float] = None
    spotify_stream_velocity_30d: Optional[float] = None
    spotify_playlist_count: Optional[int] = None
    spotify_editorial_playlist_count: Optional[int] = None
    playlist_adds_7d: Optional[int] = None
    playlist_adds_30d: Optional[int] = None
    playlist_editorial_adds_7d: Optional[int] = None
    # TikTok UGC
    tiktok_video_count: Optional[int] = None
    tiktok_growth_rate_7d: Optional[float] = None
    tiktok_growth_rate_30d: Optional[float] = None
    tiktok_avg_views_per_video: Optional[float] = None
    tiktok_avg_likes_per_video: Optional[float] = None
    tiktok_region_diversity_score: Optional[float] = None
    # YouTube
    youtube_shorts_views: Optional[float] = None
    youtube_view_velocity_7d: Optional[float] = None
    # Radio
    radio_spins_7d: Optional[int] = None
    radio_spins_30d: Optional[int] = None
    radio_spin_velocity: Optional[float] = None
    radio_market_count: Optional[int] = None
    # Chart
    chart_count: Optional[int] = None
    chart_peak_rank: Optional[int] = None
    chart_days_on_chart: Optional[int] = None
    chart_rank_velocity: Optional[float] = None
    # Misc
    trigger_city_count: Optional[int] = None
    viral_score: Optional[float] = None
    playlist_streams7d: Optional[float] = None
    explain: bool = False


class ViralProbabilities(BaseModel):
    d7: Optional[float] = Field(None, alias="7d")
    d14: Optional[float] = Field(None, alias="14d")
    d30: Optional[float] = Field(None, alias="30d")

    class Config:
        populate_by_name = True


class PopularityProbabilities(BaseModel):
    d7: Optional[float]  = Field(None, alias="7d")
    d30: Optional[float] = Field(None, alias="30d")
    d90: Optional[float] = Field(None, alias="90d")

    class Config:
        populate_by_name = True


class TrackPredictionResponse(BaseModel):
    trackId: int
    viral_probabilities: Dict[str, Optional[float]]
    popularity_probabilities: Dict[str, Optional[float]]
    trend_prediction: Dict[str, Any]
    shap: Optional[Dict[str, Any]] = None


@app.post("/v1/track/predict", response_model=TrackPredictionResponse)
def predict_track(req: TrackFeatureInput):
    record = req.model_dump(exclude={"explain"})
    result = score_batch([record], explain=req.explain)[0]
    return TrackPredictionResponse(
        trackId=req.trackId,
        viral_probabilities=result.get("viral_probabilities", {}),
        popularity_probabilities=result.get("popularity_probabilities", {}),
        trend_prediction=result.get("trend_prediction", {}),
        shap=result.get("shap"),
    )


class BatchTrackRequest(BaseModel):
    items: List[TrackFeatureInput]
    explain: bool = False


@app.post("/v1/track/predict/batch")
def predict_tracks_batch(req: BatchTrackRequest, background_tasks: BackgroundTasks):
    if not req.items:
        raise HTTPException(status_code=400, detail="items must be non-empty")
    if len(req.items) > 500:
        raise HTTPException(status_code=400, detail="max batch size is 500")

    records = [item.model_dump(exclude={"explain"}) for item in req.items]
    results = score_batch(records, explain=req.explain)

    # Write metrics asynchronously so the response isn't delayed
    background_tasks.add_task(update_from_batch_result, results)

    return {
        "items": [
            {
                "trackId": req.items[i].trackId,
                **results[i],
            }
            for i in range(len(results))
        ]
    }


# ── Neural Track Prediction (continual-learning model) ───────────────────────

class DailyStatPoint(BaseModel):
    streams:        Optional[float] = None
    tiktok_growth:  Optional[float] = None
    playlist_adds:  Optional[float] = None
    radio_spins:    Optional[float] = None
    viral_score:    Optional[float] = None


class NeuralTrackRequest(BaseModel):
    """Single-track neural prediction with optional temporal history and ground truth."""
    features:       TrackFeatureInput
    daily_history:  Optional[List[DailyStatPoint]] = Field(
        None, description="Up to 90 days of daily stats for the temporal encoder."
    )
    known_targets:  Optional[Dict[str, int]] = Field(
        None,
        description="Ground-truth labels (triggers online learning update). "
                    "Keys: viral (0/1), popular (0/1), trend (0-3), traj (0-3)."
    )
    explain:        bool = False


class NeuralBatchRequest(BaseModel):
    items: List[NeuralTrackRequest]


@app.post("/v1/track/neural/predict")
def neural_predict_single(req: NeuralTrackRequest, background_tasks: BackgroundTasks):
    """
    Neural prediction for a single track.
    Returns viral/popularity probabilities, trend label, trajectory label,
    audio similarity to known viral hits, and optional trend alerts.

    If known_targets is supplied, the model performs an online gradient update
    in the background — the model learns from this input immediately.
    """
    npredict, _ = _get_neural()
    if npredict is None:
        raise HTTPException(
            status_code=503,
            detail="Neural model not loaded. Run: npm run ml:neural:train"
        )

    record = req.features.model_dump(exclude={"explain"})
    history = [s.model_dump() for s in req.daily_history] if req.daily_history else None

    if req.known_targets:
        # Online update runs in background — doesn't block response
        def _update():
            npredict(record, daily_history=history, known_targets=req.known_targets)

        background_tasks.add_task(_update)
        # Still return the prediction without waiting for the update
        result = npredict(record, daily_history=history, explain=req.explain)
    else:
        result = npredict(record, daily_history=history, explain=req.explain)

    return result


@app.post("/v1/track/neural/predict/batch")
def neural_predict_batch(req: NeuralBatchRequest, background_tasks: BackgroundTasks):
    """
    Batch neural prediction. Accepts up to 200 tracks.
    Tracks with known_targets trigger background online learning updates.
    """
    _, npredict_batch = _get_neural()
    if npredict_batch is None:
        raise HTTPException(status_code=503, detail="Neural model not loaded.")

    if len(req.items) > 200:
        raise HTTPException(status_code=400, detail="max batch size is 200")

    records  = [item.features.model_dump(exclude={"explain"}) for item in req.items]
    histories = [
        [s.model_dump() for s in item.daily_history] if item.daily_history else None
        for item in req.items
    ]
    targets = [item.known_targets for item in req.items]

    def _batch_update():
        npredict_batch(records, daily_histories=histories, known_targets_batch=targets)

    background_tasks.add_task(_batch_update)

    # Return predictions without online update (update runs async)
    results = npredict_batch(records, daily_histories=histories)
    return {"items": results}


# ── Feedback Ingestion ────────────────────────────────────────────────────────

class FeedbackItem(BaseModel):
    trackId: int
    label: Optional[str] = Field(None, description="VIRAL | TRENDING | POPULAR | NONE")
    is_viral: Optional[bool] = None
    is_popular: Optional[bool] = None
    notes: Optional[str] = None
    source: Optional[str] = Field(None, description="curator | ar | algorithm | user")


@app.post("/v1/feedback", status_code=202)
def ingest_feedback(items: List[FeedbackItem], background_tasks: BackgroundTasks):
    """
    Accept user feedback on track labels. Items are written to the database
    asynchronously. The retrain scheduler picks them up on next cycle.
    """
    if not items:
        raise HTTPException(status_code=400, detail="items must be non-empty")

    background_tasks.add_task(_write_feedback_to_db, items)
    return {"accepted": len(items)}


def _write_feedback_to_db(items: List[FeedbackItem]):
    import os
    import psycopg2
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.warning("DATABASE_URL not set — feedback not persisted")
        return
    try:
        conn = psycopg2.connect(db_url)
        with conn.cursor() as cur:
            for item in items:
                cur.execute(
                    """
                    INSERT INTO user_feedback
                        (track_id, label, is_viral, is_popular, notes, source, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        item.trackId,
                        item.label,
                        item.is_viral,
                        item.is_popular,
                        item.notes,
                        item.source,
                    ),
                )
        conn.commit()
        conn.close()
        logger.info("Persisted %d feedback items to DB", len(items))
    except Exception as e:
        logger.error("Failed to write feedback to DB")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    from ml.config import MODEL_DIR
    return {
        "status": "ok",
        "trajectory_model_loaded": _trajectory_clf is not None,
        "viral_models": [
            p.stem for p in MODEL_DIR.glob("viral_predictor_*_xgb.json")
        ],
        "popularity_models": [
            p.stem for p in MODEL_DIR.glob("popularity_predictor_*_xgb.json")
        ],
        "trend_classifier": (MODEL_DIR / "trend_classifier_xgb.json").exists(),
    }
