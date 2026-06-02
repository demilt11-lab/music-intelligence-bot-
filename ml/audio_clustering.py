"""
ml/audio_clustering.py

Cluster all tracks by audio features to identify which sonic profiles are
currently trending ("hot clusters").

Dependencies: scikit-learn, pandas, numpy, joblib, psycopg2-binary
"""

from __future__ import annotations

import os
from typing import Any

import joblib
import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA  # noqa: F401 – available for exploration
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

# ── configuration ──────────────────────────────────────────────────────────────

FEATURE_COLS = [
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
]

N_CLUSTERS = 20  # 20 sonic archetypes

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
SCALER_PATH = os.path.join(MODEL_DIR, "audio_cluster_scaler.joblib")
KMEANS_PATH = os.path.join(MODEL_DIR, "audio_cluster_kmeans.joblib")

HOT_CLUSTER_PERCENTILE = 75  # clusters whose mean viralScore exceeds this are "hot"


# ── data loading ───────────────────────────────────────────────────────────────

def load_features(conn: Any) -> pd.DataFrame:
    """
    JOIN track_audio_features with the latest talent_scout_scores per track.
    Returns a DataFrame with columns: trackId, <FEATURE_COLS>, viralScore.
    Rows missing any feature value are dropped.
    """
    sql = """
        SELECT
            taf."trackId",
            taf."danceability",
            taf."energy",
            taf."loudness",
            taf."speechiness",
            taf."acousticness",
            taf."instrumentalness",
            taf."liveness",
            taf."valence",
            taf."tempo",
            COALESCE(latest.viral_score, 0.0) AS "viralScore"
        FROM track_audio_features taf
        LEFT JOIN LATERAL (
            SELECT "viralScore" AS viral_score
            FROM talent_scout_scores
            WHERE "trackId" = taf."trackId"
            ORDER BY date DESC
            LIMIT 1
        ) latest ON TRUE
        WHERE
            taf."danceability"     IS NOT NULL
            AND taf."energy"           IS NOT NULL
            AND taf."loudness"         IS NOT NULL
            AND taf."speechiness"      IS NOT NULL
            AND taf."acousticness"     IS NOT NULL
            AND taf."instrumentalness" IS NOT NULL
            AND taf."liveness"         IS NOT NULL
            AND taf."valence"          IS NOT NULL
            AND taf."tempo"            IS NOT NULL
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    df = pd.DataFrame(rows, columns=["trackId"] + FEATURE_COLS + ["viralScore"])
    df = df.dropna(subset=FEATURE_COLS)
    df = df.reset_index(drop=True)
    print(f"[load_features] loaded {len(df)} tracks with full audio features")
    return df


# ── model training ─────────────────────────────────────────────────────────────

def train_clusters(df: pd.DataFrame) -> tuple[StandardScaler, KMeans]:
    """
    Fit StandardScaler + KMeans(n_clusters=N_CLUSTERS).
    Saves models to ml/models/ and returns (scaler, kmeans).
    """
    X = df[FEATURE_COLS].values.astype(float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10)
    kmeans.fit(X_scaled)

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(kmeans, KMEANS_PATH)

    print(f"[train_clusters] trained KMeans with {N_CLUSTERS} clusters, "
          f"inertia={kmeans.inertia_:.2f}")
    print(f"[train_clusters] models saved → {SCALER_PATH}, {KMEANS_PATH}")
    return scaler, kmeans


# ── hot-cluster identification ─────────────────────────────────────────────────

def identify_hot_clusters(df: pd.DataFrame, labels: np.ndarray) -> list[int]:
    """
    For each cluster, compute mean viralScore of its members.
    Return cluster IDs where mean viralScore > overall 75th-percentile viral score.
    These are the "hot sound" clusters.
    """
    df = df.copy()
    df["_cluster"] = labels

    cluster_means = (
        df.groupby("_cluster")["viralScore"]
        .mean()
        .reset_index()
        .rename(columns={"viralScore": "clusterViralMean"})
    )

    threshold = float(np.percentile(df["viralScore"].values, HOT_CLUSTER_PERCENTILE))
    hot_ids: list[int] = (
        cluster_means.loc[cluster_means["clusterViralMean"] > threshold, "_cluster"]
        .astype(int)
        .tolist()
    )

    print(f"[identify_hot_clusters] viralScore p{HOT_CLUSTER_PERCENTILE} threshold: "
          f"{threshold:.4f}")
    print(f"[identify_hot_clusters] hot clusters ({len(hot_ids)}): {sorted(hot_ids)}")
    return hot_ids


# ── DB write ───────────────────────────────────────────────────────────────────

def write_cluster_assignments(
    conn: Any,
    df: pd.DataFrame,
    labels: np.ndarray,
    hot_clusters: list[int],
) -> None:
    """
    Upsert into track_audio_clusters (trackId, clusterId, isHotCluster, clusterViralMean).
    """
    df = df.copy()
    df["_cluster"] = labels

    cluster_viral_means: dict[int, float] = (
        df.groupby("_cluster")["viralScore"]
        .mean()
        .to_dict()
    )
    hot_set = set(hot_clusters)

    rows = [
        (
            int(row["trackId"]),
            int(row["_cluster"]),
            int(row["_cluster"]) in hot_set,
            float(cluster_viral_means.get(int(row["_cluster"]), 0.0)),
        )
        for _, row in df.iterrows()
    ]

    sql = """
        INSERT INTO track_audio_clusters
            ("trackId", "clusterId", "isHotCluster", "clusterViralMean", "updatedAt")
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT ("trackId") DO UPDATE SET
            "clusterId"        = EXCLUDED."clusterId",
            "isHotCluster"     = EXCLUDED."isHotCluster",
            "clusterViralMean" = EXCLUDED."clusterViralMean",
            "updatedAt"        = NOW()
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=500)
    conn.commit()

    print(f"[write_cluster_assignments] upserted {len(rows)} rows into "
          "track_audio_clusters")


# ── inference for new tracks ───────────────────────────────────────────────────

def compute_new_track_similarity(features: dict[str, float]) -> dict:
    """
    Given a single track's audio features, load the saved model, assign a cluster,
    and return:
        clusterId, isHotCluster, clusterViralMean, similarTracks (top-5 by cosine sim).

    'features' must contain all FEATURE_COLS keys.
    The function re-loads the saved scaler + kmeans from disk.

    Note: this does NOT query the DB for similar tracks — it operates on the
    KMeans cluster centroids to identify the nearest centroid neighbors.
    For full track-level similarity, integrate with a vector store or query
    track_audio_clusters for trackIds in the same cluster.
    """
    scaler: StandardScaler = joblib.load(SCALER_PATH)
    kmeans: KMeans = joblib.load(KMEANS_PATH)

    vec = np.array([[features.get(col, 0.0) for col in FEATURE_COLS]], dtype=float)
    vec_scaled = scaler.transform(vec)

    cluster_id = int(kmeans.predict(vec_scaled)[0])

    # Cosine similarity against all cluster centroids (proxy for similar "sonic zones")
    sims = cosine_similarity(vec_scaled, kmeans.cluster_centers_)[0]
    top5_idx = np.argsort(sims)[::-1][:5].tolist()

    # Hot-cluster metadata is stored per centroid in a sidecar JSON (optional).
    # Here we return the raw cluster IDs and similarities; callers should enrich
    # from the DB if needed.
    similar_clusters = [
        {"clusterId": int(idx), "cosineSimilarity": float(sims[idx])}
        for idx in top5_idx
    ]

    return {
        "clusterId": cluster_id,
        "similarClusters": similar_clusters,
        # isHotCluster / clusterViralMean require DB lookup — not available offline
    }


# ── main pipeline ──────────────────────────────────────────────────────────────

def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    conn = psycopg2.connect(database_url)
    try:
        # 1. Load
        df = load_features(conn)
        if df.empty:
            print("[main] No tracks with audio features found — aborting")
            return

        # 2. Train
        scaler, kmeans = train_clusters(df)

        # 3. Assign labels
        X = df[FEATURE_COLS].values.astype(float)
        X_scaled = scaler.transform(X)
        labels: np.ndarray = kmeans.labels_

        # 4. Identify hot clusters
        hot_clusters = identify_hot_clusters(df, labels)

        # 5. Write back to DB
        write_cluster_assignments(conn, df, labels, hot_clusters)

        print("[main] Audio DNA clustering pipeline complete")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
