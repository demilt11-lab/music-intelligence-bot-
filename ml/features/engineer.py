"""
Feature engineering for breakout artist detection.
All features are computed relative to prediction_date with strict temporal leakage guards.
"""

import logging
import warnings
import numpy as np
import pandas as pd

from ml.features.blueprint import FEATURE_BLUEPRINT

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """
    Transforms raw weekly artist snapshot data into engineered features.
    Enforces strict temporal leakage guards — no data after prediction_date is used.
    """

    def __init__(self):
        self.temporal_leakage_dropped: int = 0
        self._blueprint_map = {f.name: f for f in FEATURE_BLUEPRINT}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Engineer all features and return enriched DataFrame."""
        df = df.copy()

        df = self._enforce_temporal_guard(df)
        df = self._add_raw_features(df)
        df = self._add_behavioral_features(df)   # skip_rate_inv needed by interaction
        df = self._add_transformed_features(df)
        df = self._add_aggregated_features(df)
        df = self._add_interaction_features(df)
        df = self._add_temporal_features(df)
        df = self._clip_features(df)
        self._log_feature_summary(df)

        return df

    # ------------------------------------------------------------------
    # Temporal guard
    # ------------------------------------------------------------------

    def _enforce_temporal_guard(self, df: pd.DataFrame) -> pd.DataFrame:
        """Drop rows where computed_at > prediction_date (future data leakage)."""
        try:
            computed_at = pd.to_datetime(df["computed_at"], utc=False, errors="coerce")
            prediction_date = pd.to_datetime(df["prediction_date"], utc=False, errors="coerce")

            # Normalize tz-aware/naive mix
            if computed_at.dt.tz is not None:
                computed_at = computed_at.dt.tz_localize(None)
            if prediction_date.dt.tz is not None:
                prediction_date = prediction_date.dt.tz_localize(None)

            mask_violation = computed_at > prediction_date
            n_violations = mask_violation.sum()

            if n_violations > 0:
                logger.warning(
                    "Temporal leakage guard: dropping %d rows where computed_at > prediction_date",
                    n_violations,
                )
                self.temporal_leakage_dropped += int(n_violations)
                df = df[~mask_violation].reset_index(drop=True)
        except Exception as e:
            logger.warning("Temporal guard check failed: %s", e)

        return df

    # ------------------------------------------------------------------
    # Raw features (passthrough — already in the DataFrame)
    # ------------------------------------------------------------------

    def _add_raw_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Raw features are already present; apply log transform to youtube_views."""
        try:
            if "youtube_views" in df.columns:
                df["youtube_views_log"] = np.log1p(df["youtube_views"].clip(0))
        except Exception as e:
            logger.warning("_add_raw_features error: %s", e)
        return df

    # ------------------------------------------------------------------
    # Transformed features
    # ------------------------------------------------------------------

    def _add_transformed_features(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            df["stream_velocity"] = (
                (df["streams_week2"] - df["streams_week1"]) / (df["streams_week1"] + 1)
            )
        except Exception as e:
            logger.warning("stream_velocity failed: %s", e)
            df["stream_velocity"] = np.nan

        try:
            df["save_rate"] = df["saves_week2"] / (df["streams_week2"] + 1e-8)
        except Exception as e:
            logger.warning("save_rate failed: %s", e)
            df["save_rate"] = np.nan

        try:
            df["listener_to_follower"] = (
                df["new_followers_week1"] / (df["unique_listeners_week1"] + 1)
            )
        except Exception as e:
            logger.warning("listener_to_follower failed: %s", e)
            df["listener_to_follower"] = np.nan

        try:
            df["ugc_growth_rate"] = (
                (df["tiktok_videos_week2"] - df["tiktok_videos_week1"])
                / (df["tiktok_videos_week1"] + 1)
            )
        except Exception as e:
            logger.warning("ugc_growth_rate failed: %s", e)
            df["ugc_growth_rate"] = np.nan

        try:
            df["follower_velocity"] = (
                (df["followers_week2"] - df["followers_week1"])
                / (df["followers_week1"] + 1)
            )
        except Exception as e:
            logger.warning("follower_velocity failed: %s", e)
            df["follower_velocity"] = np.nan

        try:
            if "youtube_views_week1" in df.columns and "youtube_views_week2" in df.columns:
                df["youtube_view_velocity"] = (
                    (df["youtube_views_week2"] - df["youtube_views_week1"])
                    / (df["youtube_views_week1"] + 1)
                )
            else:
                df["youtube_view_velocity"] = np.nan
        except Exception as e:
            logger.warning("youtube_view_velocity failed: %s", e)
            df["youtube_view_velocity"] = np.nan

        try:
            if "radio_stations_week1" in df.columns and "radio_stations_week2" in df.columns:
                df["radio_station_velocity"] = (
                    (df["radio_stations_week2"] - df["radio_stations_week1"])
                    / (df["radio_stations_week1"] + 1)
                )
            else:
                df["radio_station_velocity"] = np.nan
        except Exception as e:
            logger.warning("radio_station_velocity failed: %s", e)
            df["radio_station_velocity"] = np.nan

        return df

    # ------------------------------------------------------------------
    # Aggregated features
    # ------------------------------------------------------------------

    def _add_aggregated_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute rolling aggregates per artist, sorted by prediction_date."""
        try:
            df["prediction_date_dt"] = pd.to_datetime(df["prediction_date"], errors="coerce")
            df = df.sort_values(["artist_id", "prediction_date_dt"])

            def _rolling_mean(series, window):
                return series.rolling(window, min_periods=1).mean()

            def _rolling_max(series, window):
                return series.rolling(window, min_periods=1).max()

            def _sustained(series, window):
                return series.rolling(window, min_periods=1).apply(
                    lambda x: (x > 0.15).sum() / 12, raw=True
                )

            grouped_sv = df.groupby("artist_id")["stream_velocity"]
            df["stream_velocity_7d_avg"] = grouped_sv.transform(
                lambda x: _rolling_mean(x, 7)
            )
            df["peak_stream_velocity_90d"] = grouped_sv.transform(
                lambda x: _rolling_max(x, 90)
            )
            df["sustained_momentum"] = grouped_sv.transform(
                lambda x: _sustained(x, 12)
            )

            if "save_rate" in df.columns:
                df["save_rate_30d_avg"] = df.groupby("artist_id")["save_rate"].transform(
                    lambda x: _rolling_mean(x, 30)
                )
            else:
                df["save_rate_30d_avg"] = np.nan

            if "ugc_growth_rate" in df.columns:
                df["tiktok_velocity_7d_avg"] = df.groupby("artist_id")[
                    "ugc_growth_rate"
                ].transform(lambda x: _rolling_mean(x, 7))
            else:
                df["tiktok_velocity_7d_avg"] = np.nan

            if "follower_velocity" in df.columns:
                df["follower_velocity_30d_avg"] = df.groupby("artist_id")[
                    "follower_velocity"
                ].transform(lambda x: _rolling_mean(x, 30))
            else:
                df["follower_velocity_30d_avg"] = np.nan

        except Exception as e:
            logger.warning("_add_aggregated_features error: %s", e)
            for col in [
                "stream_velocity_7d_avg",
                "save_rate_30d_avg",
                "peak_stream_velocity_90d",
                "sustained_momentum",
                "tiktok_velocity_7d_avg",
                "follower_velocity_30d_avg",
            ]:
                if col not in df.columns:
                    df[col] = np.nan

        return df

    # ------------------------------------------------------------------
    # Interaction features
    # ------------------------------------------------------------------

    def _add_interaction_features(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            df["high_quality_growth"] = df["save_rate"] * df["stream_velocity"]
        except Exception as e:
            logger.warning("high_quality_growth failed: %s", e)
            df["high_quality_growth"] = np.nan

        try:
            df["social_momentum"] = df["ugc_growth_rate"] * df["follower_velocity"]
        except Exception as e:
            logger.warning("social_momentum failed: %s", e)
            df["social_momentum"] = np.nan

        try:
            par = df.get("playlist_addition_rate") if hasattr(df, "get") else df.get(
                "playlist_addition_rate", pd.Series(0, index=df.index)
            )
            if par is None or (isinstance(par, pd.Series) and par.isna().all()):
                par = pd.Series(0.0, index=df.index)
            df["playlist_quality"] = par / (df["skip_rate"] + 0.01)
        except Exception as e:
            logger.warning("playlist_quality failed: %s", e)
            df["playlist_quality"] = np.nan

        try:
            df["organic_score"] = (
                0.45 * df["stream_velocity"]
                + 0.35 * df["save_rate"]
                + 0.20 * df["follower_velocity"]
            )
        except Exception as e:
            logger.warning("organic_score failed: %s", e)
            df["organic_score"] = np.nan

        try:
            df["tiktok_stream_conversion"] = df["ugc_growth_rate"] * df["stream_velocity"]
        except Exception as e:
            logger.warning("tiktok_stream_conversion failed: %s", e)
            df["tiktok_stream_conversion"] = np.nan

        try:
            df["algo_traffic_pct"] = df["algo_streams"] / (df["total_streams"] + 1e-8)
        except Exception as e:
            logger.warning("algo_traffic_pct failed: %s", e)
            df["algo_traffic_pct"] = np.nan

        try:
            df["editorial_signal"] = 1 - df["algo_traffic_pct"]
        except Exception as e:
            logger.warning("editorial_signal failed: %s", e)
            df["editorial_signal"] = np.nan

        try:
            df["save_stream_quality"] = df["save_rate"] * np.log1p(
                np.clip(df["stream_velocity"] + 1, 0, None)
            )
        except Exception as e:
            logger.warning("save_stream_quality failed: %s", e)
            df["save_stream_quality"] = np.nan

        try:
            df["viral_with_retention"] = (
                df["ugc_growth_rate"] * df["save_rate"] * df["stream_velocity"]
            )
        except Exception as e:
            logger.warning("viral_with_retention failed: %s", e)
            df["viral_with_retention"] = np.nan

        try:
            df["momentum_quality"] = df["stream_velocity"] * df["skip_rate_inv"]
        except Exception as e:
            logger.warning("momentum_quality failed: %s", e)
            df["momentum_quality"] = np.nan

        return df

    # ------------------------------------------------------------------
    # Temporal features
    # ------------------------------------------------------------------

    def _add_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            pred_dt = pd.to_datetime(df["prediction_date"], errors="coerce")
            rel_dt = pd.to_datetime(df["release_date"], errors="coerce")
            df["days_since_release"] = (pred_dt - rel_dt).dt.days.clip(0, 3650)
        except Exception as e:
            logger.warning("days_since_release failed: %s", e)
            df["days_since_release"] = np.nan

        try:
            df["release_recency_flag"] = (df["days_since_release"] <= 14).astype(int)
            # Zero out stream_velocity for cold-start window
            df.loc[df["release_recency_flag"] == 1, "stream_velocity"] = 0.0
        except Exception as e:
            logger.warning("release_recency_flag failed: %s", e)
            df["release_recency_flag"] = np.nan

        try:
            def compute_tiktok_lag(row):
                try:
                    viral_date = row.get("first_tiktok_viral_date")
                    if viral_date is None or (
                        isinstance(viral_date, float) and np.isnan(viral_date)
                    ):
                        return np.nan
                    lag = (
                        pd.Timestamp(row["prediction_date"])
                        - pd.Timestamp(viral_date)
                    ).days / 7
                    return min(max(lag, 0), 8)
                except Exception:
                    return np.nan

            df["tiktok_to_streaming_lag"] = df.apply(compute_tiktok_lag, axis=1)
        except Exception as e:
            logger.warning("tiktok_to_streaming_lag failed: %s", e)
            df["tiktok_to_streaming_lag"] = np.nan

        try:
            def weeks_since_viral(row):
                try:
                    viral_date = row.get("first_tiktok_viral_date")
                    if viral_date is None or (
                        isinstance(viral_date, float) and np.isnan(viral_date)
                    ):
                        return np.nan
                    lag = (
                        pd.Timestamp(row["prediction_date"])
                        - pd.Timestamp(viral_date)
                    ).days / 7
                    return max(lag, 0)
                except Exception:
                    return np.nan

            df["weeks_since_tiktok_viral"] = df.apply(weeks_since_viral, axis=1)
        except Exception as e:
            logger.warning("weeks_since_tiktok_viral failed: %s", e)
            df["weeks_since_tiktok_viral"] = np.nan

        try:
            if "streams_week3" in df.columns:
                v1 = (df["streams_week2"] - df["streams_week1"]) / (
                    df["streams_week1"] + 1
                )
                v2 = (df["streams_week3"] - df["streams_week2"]) / (
                    df["streams_week2"] + 1
                )
                df["momentum_acceleration"] = v2 - v1
            else:
                df["momentum_acceleration"] = np.nan
        except Exception as e:
            logger.warning("momentum_acceleration failed: %s", e)
            df["momentum_acceleration"] = np.nan

        return df

    # ------------------------------------------------------------------
    # Behavioral features
    # ------------------------------------------------------------------

    def _add_behavioral_features(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            df["skip_rate_inv"] = 1 - df["skip_rate"].clip(0, 1)
        except Exception as e:
            logger.warning("skip_rate_inv failed: %s", e)
            df["skip_rate_inv"] = np.nan

        try:
            df["completion_rate"] = df["streams_reaching_100pct"] / (
                df["streams_week2"] + 1e-8
            )
        except Exception as e:
            logger.warning("completion_rate failed: %s", e)
            df["completion_rate"] = np.nan

        try:
            df["repeat_listen_rate"] = df["streams_week2"] / (
                df["unique_listeners_week1"] + 1
            )
        except Exception as e:
            logger.warning("repeat_listen_rate failed: %s", e)
            df["repeat_listen_rate"] = np.nan

        try:
            df["algo_vs_playlist_split"] = df["algo_streams"] / (
                df["playlist_streams"] + 1e-8
            )
        except Exception as e:
            logger.warning("algo_vs_playlist_split failed: %s", e)
            df["algo_vs_playlist_split"] = np.nan

        try:
            df["pre_save_normalized"] = df["pre_saves"] / 10_000.0
        except Exception as e:
            logger.warning("pre_save_normalized failed: %s", e)
            df["pre_save_normalized"] = np.nan

        return df

    # ------------------------------------------------------------------
    # Clip features to valid ranges
    # ------------------------------------------------------------------

    def _clip_features(self, df: pd.DataFrame) -> pd.DataFrame:
        for spec in FEATURE_BLUEPRINT:
            if spec.name not in df.columns:
                continue
            try:
                lo, hi = spec.valid_range
                if hi == float("inf"):
                    df[spec.name] = df[spec.name].clip(lower=lo)
                else:
                    df[spec.name] = df[spec.name].clip(lower=lo, upper=hi)
            except Exception as e:
                logger.warning("Clip failed for %s: %s", spec.name, e)
        return df

    # ------------------------------------------------------------------
    # Logging / summary
    # ------------------------------------------------------------------

    def _log_feature_summary(self, df: pd.DataFrame) -> None:
        n = len(df)
        if n == 0:
            logger.warning("Feature summary: DataFrame is empty after processing.")
            return

        for col in df.columns:
            try:
                null_rate = df[col].isna().sum() / n
                if null_rate > 0.20:
                    logger.warning(
                        "Feature '%s' has %.1f%% null values — review computation.",
                        col,
                        null_rate * 100,
                    )
            except Exception:
                pass

        logger.info(
            "Feature engineering complete: %d rows, %d columns, %d rows dropped (temporal guard)",
            n,
            len(df.columns),
            self.temporal_leakage_dropped,
        )
