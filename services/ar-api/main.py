"""
services/ar-api/main.py
Predictive A&R FastAPI service.
Exposes artist search, explanation, and playlist pitch endpoints.

ASSUMPTION: DATABASE_URL env var is set and points to a Postgres database.
ASSUMPTION: artist table has columns: id, name, slug, imageUrl, country, popularity.
TODO: Implement real playlist pitch recommendations using audio feature matching.
"""

import os
import logging
from datetime import date
from typing import Optional, List, Any

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("ar_api")

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL", "")
# SQLAlchemy async requires asyncpg driver
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace(
    "postgres://", "postgresql+asyncpg://"
)

engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, pool_size=5, max_overflow=10)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Predictive A&R API",
    description="Artist scoring, breakout probability, and A&R recommendations",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class ArtistScoreResult(BaseModel):
    artist_id: int
    name: str
    slug: Optional[str] = None
    image_url: Optional[str] = None
    country: Optional[str] = None
    heat_score: Optional[float] = None
    stability_score: Optional[float] = None
    platform_balance_score: Optional[float] = None
    breakout_prob_30d: Optional[float] = None
    listeners_growth_7d: Optional[float] = None
    listeners_growth_30d: Optional[float] = None
    tiktok_views_growth_7d: Optional[float] = None
    growth_consistency_30d: Optional[float] = None
    score_date: Optional[date] = None


class FeatureBreakdown(BaseModel):
    feature: str
    value: Optional[float]
    contribution: str
    description: str


class ArtistExplanation(BaseModel):
    artist_id: int
    name: str
    breakout_prob_30d: Optional[float]
    heat_score: Optional[float]
    score_date: Optional[date]
    feature_breakdown: List[FeatureBreakdown]
    summary: str


class PlaylistPitch(BaseModel):
    playlist_id: int
    playlist_name: str
    platform: str
    follower_count: Optional[int]
    match_reason: str
    confidence: float


class PlaylistPitchResponse(BaseModel):
    artist_id: int
    recommendations: List[PlaylistPitch]
    note: str = "Placeholder recommendations — real implementation requires audio feature matching"


# ---------------------------------------------------------------------------
# Helper: get latest scores date
# ---------------------------------------------------------------------------

async def _get_latest_score_date(session: AsyncSession) -> Optional[date]:
    result = await session.execute(
        text('SELECT MAX(date) FROM artist_scores_daily')
    )
    row = result.fetchone()
    return row[0] if row else None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/artists/search", response_model=List[ArtistScoreResult])
async def search_artists(
    min_heat: Optional[float] = Query(None, ge=1.0, le=10.0, description="Minimum heat score (1–10)"),
    min_breakout_prob: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum breakout probability (0–1)"),
    max_monthly_listeners: Optional[int] = Query(None, ge=0, description="Max monthly listeners (unsigned)"),
    genre: Optional[str] = Query(None, description="Filter by primary genre (from artist_trajectory_snapshots)"),
    country: Optional[str] = Query(None, description="Filter by country code (ISO-2)"),
    order_by: str = Query("breakout_prob_30d", description="Sort field: heat_score | breakout_prob_30d | listeners_growth_30d"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    score_date: Optional[date] = Query(None, description="Score date (defaults to latest)"),
):
    """
    Search and filter artists by A&R scores.
    Returns artists sorted by the requested metric.
    """
    async with AsyncSessionLocal() as session:
        target_date = score_date
        if target_date is None:
            target_date = await _get_latest_score_date(session)
        if target_date is None:
            raise HTTPException(status_code=404, detail="No scored artists found")

        # Build dynamic WHERE clauses
        conditions = ['asd.date = :score_date']
        params: dict[str, Any] = {"score_date": target_date, "limit": limit}

        if min_heat is not None:
            conditions.append('asd."heatScore" >= :min_heat')
            params["min_heat"] = min_heat

        if min_breakout_prob is not None:
            conditions.append('asd."breakoutProb30d" >= :min_breakout_prob')
            params["min_breakout_prob"] = min_breakout_prob

        if country is not None:
            conditions.append('a.country = :country')
            params["country"] = country.upper()

        if max_monthly_listeners is not None:
            # Join artist_daily_stats for latest listener count
            conditions.append(
                """
                EXISTS (
                    SELECT 1 FROM artist_daily_stats ads2
                    WHERE ads2."artistId" = a.id
                      AND ads2."date" = (
                          SELECT MAX(ads3."date") FROM artist_daily_stats ads3
                          WHERE ads3."artistId" = a.id
                      )
                      AND ads2."totalListeners" <= :max_monthly_listeners
                )
                """
            )
            params["max_monthly_listeners"] = max_monthly_listeners

        if genre is not None:
            conditions.append(
                """
                EXISTS (
                    SELECT 1 FROM "ArtistTrajectorySnapshot" ats
                    WHERE ats."artistId" = a.id
                      AND ats."primaryGenre" = :genre
                    LIMIT 1
                )
                """
            )
            params["genre"] = genre

        where_clause = " AND ".join(conditions)

        # Order by
        order_col_map = {
            "heat_score": 'asd."heatScore"',
            "breakout_prob_30d": 'asd."breakoutProb30d"',
            "listeners_growth_30d": 'afd."listenersGrowth30d"',
        }
        order_col = order_col_map.get(order_by, 'asd."breakoutProb30d"')

        query = text(f"""
            SELECT
                a.id                         AS artist_id,
                a.name,
                a.slug,
                a."imageUrl"                 AS image_url,
                a.country,
                asd."heatScore"              AS heat_score,
                asd."stabilityScore"         AS stability_score,
                asd."platformBalanceScore"   AS platform_balance_score,
                asd."breakoutProb30d"        AS breakout_prob_30d,
                afd."listenersGrowth7d"      AS listeners_growth_7d,
                afd."listenersGrowth30d"     AS listeners_growth_30d,
                afd."tiktokViewsGrowth7d"    AS tiktok_views_growth_7d,
                afd."growthConsistency30d"   AS growth_consistency_30d,
                asd.date                     AS score_date
            FROM artists a
            JOIN artist_scores_daily asd ON asd."artistId" = a.id
            LEFT JOIN artist_features_daily afd
                ON afd."artistId" = a.id AND afd.date = asd.date
            WHERE {where_clause}
            ORDER BY {order_col} DESC NULLS LAST
            LIMIT :limit
        """)

        result = await session.execute(query, params)
        rows = result.mappings().all()

        return [ArtistScoreResult(**dict(row)) for row in rows]


@app.get("/artists/{artist_id}/explanation", response_model=ArtistExplanation)
async def explain_artist(
    artist_id: int,
    score_date: Optional[date] = Query(None, description="Score date (defaults to latest)"),
):
    """
    Returns a feature breakdown explaining why an artist has a high breakout probability.
    """
    async with AsyncSessionLocal() as session:
        target_date = score_date
        if target_date is None:
            result = await session.execute(
                text('SELECT MAX(date) FROM artist_scores_daily WHERE "artistId" = :aid'),
                {"aid": artist_id},
            )
            row = result.fetchone()
            target_date = row[0] if row else None

        if target_date is None:
            raise HTTPException(status_code=404, detail=f"No scores found for artist {artist_id}")

        query = text("""
            SELECT
                a.id, a.name,
                asd."heatScore",
                asd."stabilityScore",
                asd."platformBalanceScore",
                asd."breakoutProb30d",
                asd.date AS score_date,
                afd."listenersGrowth7d",
                afd."listenersGrowth14d",
                afd."listenersGrowth30d",
                afd."listenersGrowth90d",
                afd."listenersVelocity7d",
                afd."listenersAcceleration7d",
                afd."tiktokVideosPerDay7d",
                afd."tiktokViewsGrowth7d",
                afd."crossPlatformSpikes7d",
                afd."streamsPerPlaylistAdd7d",
                afd."savesPerStream30d",
                afd."growthConsistency30d"
            FROM artists a
            JOIN artist_scores_daily asd ON asd."artistId" = a.id AND asd.date = :date
            LEFT JOIN artist_features_daily afd ON afd."artistId" = a.id AND afd.date = :date
            WHERE a.id = :aid
        """)

        result = await session.execute(query, {"aid": artist_id, "date": target_date})
        row = result.mappings().fetchone()

        if not row:
            raise HTTPException(status_code=404, detail=f"Artist {artist_id} not found for date {target_date}")

        # Build feature breakdown
        feature_defs = [
            ("listenersGrowth7d", "7-day Spotify listener growth %", "Short-term momentum"),
            ("listenersGrowth30d", "30-day Spotify listener growth %", "Medium-term growth trend"),
            ("listenersGrowth90d", "90-day Spotify listener growth %", "Long-term trajectory"),
            ("listenersVelocity7d", "Listener velocity (abs. change/day over 7d)", "Speed of growth"),
            ("listenersAcceleration7d", "Listener acceleration (velocity change vs prior 7d)", "Momentum acceleration"),
            ("tiktokViewsGrowth7d", "TikTok views growth % (7d)", "Viral social momentum"),
            ("tiktokVideosPerDay7d", "TikTok videos per day (7d avg)", "Content creation rate"),
            ("crossPlatformSpikes7d", "# platforms with >20% growth (7d)", "Cross-platform breakout signal"),
            ("streamsPerPlaylistAdd7d", "Streams per playlist add (7d)", "Conversion efficiency"),
            ("savesPerStream30d", "Saves per stream (30d)", "Listener engagement depth"),
            ("growthConsistency30d", "Growth consistency score (30d)", "Steadiness of growth"),
        ]

        breakdowns = []
        for feat_key, desc, contribution_label in feature_defs:
            val = row.get(feat_key)
            breakdowns.append(
                FeatureBreakdown(
                    feature=feat_key,
                    value=float(val) if val is not None else None,
                    contribution=contribution_label,
                    description=desc,
                )
            )

        # Generate summary
        prob = row.get("breakoutProb30d")
        heat = row.get("heatScore")
        growth7d = row.get("listenersGrowth7d")
        tiktok = row.get("tiktokViewsGrowth7d")

        summary_parts = [f"{row['name']} has a breakout probability of {prob:.1%}." if prob else f"{row['name']}"]
        if heat:
            summary_parts.append(f"Heat score: {heat:.1f}/10.")
        if growth7d:
            summary_parts.append(f"Spotify listeners grew {growth7d:+.1f}% over 7 days.")
        if tiktok:
            summary_parts.append(f"TikTok view growth: {tiktok:+.1f}% (7d).")

        return ArtistExplanation(
            artist_id=artist_id,
            name=row["name"],
            breakout_prob_30d=prob,
            heat_score=heat,
            score_date=row["score_date"],
            feature_breakdown=breakdowns,
            summary=" ".join(summary_parts),
        )


@app.get("/playlists_to_pitch", response_model=PlaylistPitchResponse)
async def playlists_to_pitch(
    artist_id: int = Query(..., description="Artist ID to get playlist recommendations for"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Returns playlist pitch recommendations for an artist.
    TODO: Implement real audio-feature-based matching using track_audio_features
    and playlist genre/mood tags. Currently returns placeholder data.
    """
    # TODO: Real implementation should:
    # 1. Load artist's top tracks + audio features from track_audio_features
    # 2. Compute centroid audio feature vector
    # 3. Find playlists with similar audio fingerprints via cosine similarity
    # 4. Filter by editorial vs indie, follower count, genre match
    # 5. Rank by match score * playlist reach

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id, name FROM artists WHERE id = :aid"),
            {"aid": artist_id},
        )
        artist_row = result.fetchone()
        if not artist_row:
            raise HTTPException(status_code=404, detail=f"Artist {artist_id} not found")

        # Return placeholder recommendations
        return PlaylistPitchResponse(
            artist_id=artist_id,
            recommendations=[
                PlaylistPitch(
                    playlist_id=0,
                    playlist_name="Placeholder — implement audio-feature matching",
                    platform="spotify",
                    follower_count=None,
                    match_reason="TODO: real implementation required",
                    confidence=0.0,
                )
            ],
            note=(
                "Placeholder recommendations. Real implementation requires "
                "audio feature matching via track_audio_features table. "
                "See TODO comments in services/ar-api/main.py."
            ),
        )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
