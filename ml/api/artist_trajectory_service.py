# ml/api/artist_trajectory_service.py
import os
from typing import List, Optional

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from ml.artist_trajectory_model import (
    FEATURE_COLS,
    MODEL_NAME,
    MODEL_VERSION,
    MODEL_PATH,
    SCALER_PATH,
    INV_STATUS_MAP,
)

app = FastAPI(
    title="Artist Trajectory Service",
    version="1.0.0",
    description="Predict artist breakout status based on unified trend features.",
)


class ArtistTrajectoryFeatures(BaseModel):
  artist_id: int = Field(..., description="Internal artist ID")
  streams7dDelta: float
  streams28dDelta: float
  streams90dDelta: float
  playlistsDelta28d: float
  followersDelta28d: float
  tiktokVelocityScore: float = 0.0
  airplayVelocityScore: float = 0.0
  maxTrackProbViral: float = 0.0
  spotifyBreakProb: float = 0.0


class ArtistTrajectoryPrediction(BaseModel):
  artist_id: int
  status: str
  breakProbability: float
  modelName: str
  modelVersion: str


class BatchRequest(BaseModel):
  items: List[ArtistTrajectoryFeatures]


class BatchResponse(BaseModel):
  items: List[ArtistTrajectoryPrediction]


def load_model():
  if not os.path.exists(MODEL_PATH):
    raise RuntimeError(f"Model not found at {MODEL_PATH}")
  if not os.path.exists(SCALER_PATH):
    raise RuntimeError(f"Scaler not found at {SCALER_PATH}")

  clf = joblib.load(MODEL_PATH)
  scaler = joblib.load(SCALER_PATH)
  return clf, scaler


clf, scaler = load_model()


@app.post("/v1/artist/trajectory/predict", response_model=BatchResponse)
def predict_trajectory(req: BatchRequest):
  if not req.items:
    raise HTTPException(
        status_code=400, detail="Empty items list"
    )

  # Build DataFrame in same order as FEATURE_COLS
  rows = []
  artist_ids = []
  for item in req.items:
    artist_ids.append(item.artist_id)
    row = {
        "streams7dDelta": item.streams7dDelta,
        "streams28dDelta": item.streams28dDelta,
        "streams90dDelta": item.streams90dDelta,
        "playlistsDelta28d": item.playlistsDelta28d,
        "followersDelta28d": item.followersDeltaDelta,
        "tiktokVelocityScore": item.tiktokVelocityScore,
        "airplayVelocityScore": item.airplayVelocityScore,
        "maxTrackProbViral": item.maxTrackProbViral,
        "spotifyBreakProb": item.spotifyBreakProb,
    }
    rows.append(row)

  df = pd.DataFrame(rows, columns=FEATURE_COLS).fillna(0.0)
  X = scaler.transform(df)

  probs = clf.predict_proba(X)
  preds = clf.predict(X)

  # class index for ABOUT_TO_BREAK
  class_to_idx = {cls: i for i, cls in enumerate(clf.classes_)}
  about_idx = class_to_idx.get(3, None)  # 3 == ABOUT_TO_BREAK in STATUS_MAP
  if about_idx is None:
    # fallback: use max prob class
    break_probs = probs.max(axis=1)
  else:
    break_probs = probs[:, about_idx]

  items: List[ArtistTrajectoryPrediction] = []
  for i, artist_id in enumerate(artist_ids):
    status_id = int(preds[i])
    status = INV_STATUS_MAP.get(status_id, "STABLE")
    items.append(
        ArtistTrajectoryPrediction(
            artist_id=artist_id,
            status=status,
            breakProbability=float(break_probs[i]),
            modelName=MODEL_NAME,
            modelVersion=MODEL_VERSION,
        )
    )

  return BatchResponse(items=items)v
