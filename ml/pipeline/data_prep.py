"""
Data preparation pipeline: loads from Supabase, engineers features,
validates schema, splits into train/val/test, saves to disk.
"""
import logging
import os
import pickle
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, field_validator
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import (
    LabelEncoder,
    MinMaxScaler,
    RobustScaler,
    StandardScaler,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TrajectoryRecord(BaseModel):
    """Validates a single row from trajectory_predictions table."""

    id: int
    entity_type: str
    entity_id: int
    momentum: float
    breakout_prob: float
    virality_score: float
    peak_score_estimate: float
    confidence: float
    computed_at: str

    @field_validator("momentum", "breakout_prob", "virality_score", "confidence", mode="before")
    @classmethod
    def clamp_to_unit_interval(cls, v: Any) -> float:
        """Clamp float fields to [0, 1]."""
        return float(max(0.0, min(1.0, v)))


class DataPrepConfig(BaseModel):
    """Typed wrapper for Hydra data config."""

    imputation_strategy: str = "median"
    scaler: str = "standard"
    encode_categoricals: bool = True
    temporal_features: bool = True
    train_split: float = 0.70
    val_split: float = 0.15
    test_split: float = 0.15
    random_state: int = 42
    stratify: bool = True
    min_rows: int = 100
    required_columns: list[str] = field(
        default_factory=lambda: ["momentum", "breakout_prob", "virality_score", "confidence"]
    )


# ---------------------------------------------------------------------------
# Supabase loader
# ---------------------------------------------------------------------------


class SupabaseLoader:
    """Loads data from Supabase tables."""

    def __init__(self, url: str, key: str) -> None:
        from supabase import create_client

        self.client = create_client(url, key)
        log.info("Supabase client initialised at %s", url)

    def load_trajectories(self, table: str, limit: Optional[int] = None) -> pd.DataFrame:
        """SELECT all rows from the trajectories table."""
        query = self.client.table(table).select("*")
        if limit:
            query = query.limit(limit)
        response = query.execute()
        data = response.data
        log.info("Loaded %d rows from %s", len(data), table)
        return pd.DataFrame(data)

    def load_signals(
        self,
        table: str,
        entity_ids: Optional[list[int]] = None,
        since_days: int = 90,
    ) -> pd.DataFrame:
        """SELECT signals with optional entity filter and recency window."""
        cutoff = (datetime.utcnow() - timedelta(days=since_days)).isoformat()
        query = self.client.table(table).select("*").gte("created_at", cutoff)
        if entity_ids:
            query = query.in_("entity_id", entity_ids)
        response = query.execute()
        data = response.data
        log.info("Loaded %d signal rows from %s", len(data), table)
        return pd.DataFrame(data)


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------


class FeatureEngineer:
    """Adds derived features to a trajectory DataFrame."""

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fit on df and return transformed copy."""
        return self._add_features(df.copy())

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply same transformations to new data (stateless here)."""
        return self._add_features(df.copy())

    def _add_features(self, df: pd.DataFrame) -> pd.DataFrame:
        # Binary targets / flags
        df["is_viral"] = (df["virality_score"] > 0.7).astype(int)
        df["high_momentum"] = (df["momentum"] > 0.6).astype(int)

        # Interaction features
        df["score_product"] = df["momentum"] * df["virality_score"]
        df["confidence_weighted_score"] = df["virality_score"] * df["confidence"]
        df["breakout_momentum_ratio"] = df["breakout_prob"] / (df["momentum"] + 1e-8)

        # Save rate quality score: penalize high streams with low saves (manufactured plays)
        if "save_rate" in df.columns and "stream_velocity" in df.columns:
            df["save_stream_quality"] = df["save_rate"] * np.log1p(df["stream_velocity"] + 1)
        elif "save_rate" in df.columns:
            df["save_stream_quality"] = df["save_rate"]

        # Organic growth composite: streams + saves + follower — excludes TikTok spikes
        df["organic_score"] = (
            0.45 * df.get("stream_velocity", pd.Series(0, index=df.index)) +
            0.35 * df.get("save_rate", pd.Series(0, index=df.index)).fillna(0) +
            0.20 * df.get("follower_velocity", pd.Series(0, index=df.index)).fillna(0)
        )

        # TikTok conversion rate: does TikTok growth translate to streams?
        # High tiktok + low streams = ephemeral viral; high both = breakout
        if "tiktok_growth" in df.columns and "stream_velocity" in df.columns:
            df["tiktok_stream_conversion"] = df["tiktok_growth"] * df["stream_velocity"]

        # Skip rate signal if available (default 0.5 = unknown)
        if "skip_rate_inv" not in df.columns:
            df["skip_rate_inv"] = 0.5

        # Algorithmic vs editorial traffic split
        # High algo_pct = Spotify pushing the song; editorial = curators chose it
        # editorial traffic is a stronger leading signal than algorithmic
        if "algo_streams" in df.columns and "total_streams" in df.columns:
            df["algo_traffic_pct"] = (
                df["algo_streams"] / (df["total_streams"] + 1e-8)
            ).clip(0, 1)
            # Invert: high editorial (low algo) = stronger organic signal
            df["editorial_signal"] = 1 - df["algo_traffic_pct"]
        else:
            # Default: unknown split, use neutral value
            df["algo_traffic_pct"] = 0.5
            df["editorial_signal"] = 0.5

        # Listener-to-follower conversion rate
        # >5% = building durable fanbase (not just riding algorithmic wave)
        # Best signing signal after save_rate
        if "new_followers_7d" in df.columns and "new_listeners_7d" in df.columns:
            df["listener_follower_conversion"] = (
                df["new_followers_7d"] / (df["new_listeners_7d"] + 1)
            ).clip(0, 1)
            df["strong_conversion"] = (df["listener_follower_conversion"] > 0.05).astype(int)
        else:
            df["listener_follower_conversion"] = np.nan
            df["strong_conversion"] = 0

        # Cross-signal: TikTok virality WITH streaming follow-through
        # High tiktok + low saves = meme (don't sign); high both = genuine breakout
        df["viral_with_retention"] = (
            df.get("tiktok_growth", pd.Series(0, index=df.index)).fillna(0)
            * df.get("save_rate", pd.Series(0, index=df.index)).fillna(0)
            * df.get("stream_velocity", pd.Series(0, index=df.index)).fillna(0)
        )

        # Chart momentum quality: rising chart + low skip = real momentum
        # Rising chart + high skip = gaming / payola
        df["momentum_quality"] = (
            df["chart_momentum"].fillna(0)
            * df["skip_rate_inv"].fillna(0.5)
        )

        # Temporal cyclic encoding from computed_at
        if "computed_at" in df.columns:
            ts = pd.to_datetime(df["computed_at"], errors="coerce", utc=True)
            dow = ts.dt.dayofweek.fillna(0).astype(float)  # 0–6
            month = ts.dt.month.fillna(1).astype(float)   # 1–12

            df["dow_sin"] = np.sin(2 * np.pi * dow / 7)
            df["dow_cos"] = np.cos(2 * np.pi * dow / 7)
            df["month_sin"] = np.sin(2 * np.pi * (month - 1) / 12)
            df["month_cos"] = np.cos(2 * np.pi * (month - 1) / 12)

        return df


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class DataValidator:
    """Validates a DataFrame before training."""

    def validate(self, df: pd.DataFrame, cfg) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []

        # Minimum row count
        min_rows = cfg.data.validation.min_rows
        if len(df) < min_rows:
            errors.append(f"DataFrame has {len(df)} rows; minimum required is {min_rows}.")

        # Required columns
        required = list(cfg.data.validation.required_columns)
        missing = [c for c in required if c not in df.columns]
        if missing:
            errors.append(f"Missing required columns: {missing}")

        # No infinite values
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        inf_cols = [c for c in numeric_cols if np.isinf(df[c]).any()]
        if inf_cols:
            errors.append(f"Infinite values found in columns: {inf_cols}")

        # Warn when save_rate is missing — it's a critical A&R signal
        if "save_rate" not in df.columns:
            warnings.append(
                "Column 'save_rate' is missing. This is a critical A&R signal "
                "(saves/streams ratio) and should be included for accurate breakout prediction."
            )

        # Class balance warning
        if "is_viral" in df.columns:
            ratio = df["is_viral"].mean()
            if ratio < 0.05 or ratio > 0.95:
                warnings.append(
                    f"Class imbalance detected: {ratio:.1%} positive rate. "
                    "Consider oversampling or adjusting class weights."
                )

        valid = len(errors) == 0
        result = ValidationResult(valid=valid, errors=errors, warnings=warnings)

        for w in warnings:
            log.warning("DataValidator: %s", w)
        for e in errors:
            log.error("DataValidator: %s", e)

        return result


# ---------------------------------------------------------------------------
# Synthetic data fallback
# ---------------------------------------------------------------------------


def generate_synthetic_data(n_rows: int = 2000, seed: int = 42) -> pd.DataFrame:
    """Generate synthetic trajectory data for testing without a DB connection."""
    rng = np.random.default_rng(seed)

    n = n_rows
    entity_types = rng.choice(["track", "artist", "playlist"], size=n, p=[0.6, 0.3, 0.1])

    base_date = datetime(2024, 1, 1)
    offsets = rng.integers(0, 365, size=n)
    computed_at = [(base_date + timedelta(days=int(d))).isoformat() for d in offsets]

    df = pd.DataFrame(
        {
            "id": np.arange(1, n + 1),
            "entity_type": entity_types,
            "entity_id": rng.integers(1000, 99999, size=n),
            "stream_velocity": rng.beta(2, 5, size=n),
            "tiktok_growth": rng.beta(1, 8, size=n),
            "chart_momentum": rng.beta(2, 6, size=n),
            "playlist_signal": rng.beta(3, 5, size=n),
            "radio_spike": rng.beta(1, 10, size=n),
            "momentum": rng.beta(2, 4, size=n),
            "breakout_prob": rng.beta(1, 6, size=n),
            "virality_score": rng.beta(2, 8, size=n),
            "peak_score_estimate": rng.uniform(0, 100, size=n),
            "confidence": rng.beta(5, 2, size=n),
            "computed_at": computed_at,
        }
    )
    log.info("Generated %d synthetic rows for local testing.", n)
    return df


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


class DataPreparationPipeline:
    """Orchestrates the full data preparation workflow."""

    def run(self, cfg) -> None:
        log.info("=== Data Preparation Pipeline ===")

        # 1. Load data -------------------------------------------------------
        df = self._load_data(cfg)

        # 2. Validate raw data -----------------------------------------------
        validator = DataValidator()
        raw_result = validator.validate(df, cfg)
        if not raw_result.valid:
            raise ValueError(f"Raw data validation failed: {raw_result.errors}")

        # 3. Feature engineering ---------------------------------------------
        engineer = FeatureEngineer()
        df = engineer.fit_transform(df)
        log.info("Feature engineering complete. Shape: %s", df.shape)

        # 4. Impute missing values -------------------------------------------
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        strategy = cfg.data.preprocessing.imputation_strategy
        imputer = SimpleImputer(strategy=strategy)
        df[numeric_cols] = imputer.fit_transform(df[numeric_cols])

        # 5. Split train/val/test --------------------------------------------
        target_col = "is_viral"
        stratify_col = df[target_col] if cfg.data.splits.stratify else None
        random_state = cfg.data.splits.random_state

        train_ratio = cfg.data.splits.train
        val_ratio = cfg.data.splits.val

        train_df, temp_df = train_test_split(
            df,
            train_size=train_ratio,
            random_state=random_state,
            stratify=stratify_col,
        )
        val_size_of_temp = val_ratio / (1.0 - train_ratio)
        stratify_temp = temp_df[target_col] if cfg.data.splits.stratify else None
        val_df, test_df = train_test_split(
            temp_df,
            train_size=val_size_of_temp,
            random_state=random_state,
            stratify=stratify_temp,
        )
        log.info(
            "Splits — train: %d, val: %d, test: %d",
            len(train_df),
            len(val_df),
            len(test_df),
        )

        # 6. Scale numeric features (fit on train only) ----------------------
        scaler_name = cfg.data.preprocessing.scaler
        scaler_map = {
            "standard": StandardScaler(),
            "minmax": MinMaxScaler(),
            "robust": RobustScaler(),
        }
        scaler = scaler_map.get(scaler_name, StandardScaler())

        scale_cols = [
            c for c in numeric_cols if c not in (target_col, "id", "entity_id")
        ]
        train_df[scale_cols] = scaler.fit_transform(train_df[scale_cols])
        val_df[scale_cols] = scaler.transform(val_df[scale_cols])
        test_df[scale_cols] = scaler.transform(test_df[scale_cols])

        # 7. Encode categoricals ---------------------------------------------
        encoders: dict[str, LabelEncoder] = {}
        if cfg.data.preprocessing.encode_categoricals:
            for col in cfg.data.features.categorical:
                if col in df.columns:
                    le = LabelEncoder()
                    train_df[col] = le.fit_transform(train_df[col].astype(str))
                    val_df[col] = le.transform(val_df[col].astype(str))
                    test_df[col] = le.transform(test_df[col].astype(str))
                    encoders[col] = le

        # 8. Save splits to parquet ------------------------------------------
        processed_dir = Path(cfg.paths.processed_dir)
        processed_dir.mkdir(parents=True, exist_ok=True)

        train_df.to_parquet(processed_dir / "train.parquet", engine="pyarrow", index=False)
        val_df.to_parquet(processed_dir / "val.parquet", engine="pyarrow", index=False)
        test_df.to_parquet(processed_dir / "test.parquet", engine="pyarrow", index=False)
        log.info("Saved parquet splits to %s", processed_dir)

        # 9. Save preprocessor artifacts ------------------------------------
        preprocessor = {"scaler": scaler, "imputer": imputer, "encoders": encoders}
        preprocessor_path = processed_dir / "preprocessor.pkl"
        with open(preprocessor_path, "wb") as f:
            pickle.dump(preprocessor, f)
        log.info("Saved preprocessor to %s", preprocessor_path)

        # 10. Summary stats --------------------------------------------------
        log.info("=== Summary ===")
        log.info("Target rate — train: %.2f%%", train_df[target_col].mean() * 100)
        log.info("Target rate — val: %.2f%%", val_df[target_col].mean() * 100)
        log.info("Target rate — test: %.2f%%", test_df[target_col].mean() * 100)
        log.info("Features: %d", len(scale_cols))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_data(self, cfg) -> pd.DataFrame:
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            try:
                loader = SupabaseLoader(url=supabase_url, key=supabase_key)
                table = cfg.data.supabase.tables.trajectories
                return loader.load_trajectories(table)
            except Exception as exc:
                log.warning("Supabase load failed (%s); falling back to synthetic data.", exc)
        else:
            log.info("SUPABASE_URL not set — using synthetic data for local testing.")

        return generate_synthetic_data(n_rows=2000, seed=cfg.project.seed)


def main(cfg=None) -> None:
    try:
        import hydra
        from omegaconf import DictConfig
    except ImportError:
        pass
    DataPreparationPipeline().run(cfg)


if __name__ == "__main__":
    try:
        import hydra
        from omegaconf import DictConfig

        @hydra.main(config_path="../conf", config_name="config", version_base=None)
        def _hydra_main(cfg: DictConfig) -> None:
            DataPreparationPipeline().run(cfg)

        _hydra_main()
    except ImportError:
        main()
