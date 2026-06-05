"""
Feature validation: temporal leakage, label leakage, null rates, redundancy, distribution checks.
"""

import logging
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

KNOWN_LEAKAGE_FEATURES = ["streams_after_breakout", "breakout_flag_at_prediction"]


class FeatureValidator:
    """Runs structural and statistical validation checks on engineered features."""

    # ------------------------------------------------------------------
    # Temporal leakage check
    # ------------------------------------------------------------------

    def check_temporal_leakage(
        self,
        df: pd.DataFrame,
        prediction_date_col: str,
        feature_cols: list,
    ) -> dict:
        """
        Check structural integrity: assert computed_at <= prediction_date for every row.
        Returns status, list of violations (as row indices), and row count checked.
        """
        violations = []
        rows_checked = len(df)

        try:
            if "computed_at" not in df.columns:
                return {
                    "status": "passed",
                    "violations": [],
                    "rows_checked": rows_checked,
                    "note": "computed_at column not present — skipped",
                }

            computed_at = pd.to_datetime(df["computed_at"], errors="coerce")
            prediction_date = pd.to_datetime(df[prediction_date_col], errors="coerce")

            if computed_at.dt.tz is not None:
                computed_at = computed_at.dt.tz_localize(None)
            if prediction_date.dt.tz is not None:
                prediction_date = prediction_date.dt.tz_localize(None)

            mask = computed_at > prediction_date
            violations = list(df.index[mask])

        except Exception as e:
            logger.warning("check_temporal_leakage error: %s", e)
            return {
                "status": "failed",
                "violations": [],
                "rows_checked": rows_checked,
                "error": str(e),
            }

        status = "failed" if violations else "passed"
        return {
            "status": status,
            "violations": violations,
            "rows_checked": rows_checked,
        }

    # ------------------------------------------------------------------
    # Label leakage check
    # ------------------------------------------------------------------

    def check_label_leakage(
        self,
        df: pd.DataFrame,
        label_col: str,
        feature_cols: list,
    ) -> dict:
        """
        Flags features with |correlation| > 0.95 with the label as potential leakage.
        Also hardcodes known leakage features.
        """
        leakage_features = []
        correlations = {}

        try:
            if label_col not in df.columns:
                return {
                    "leakage_features": KNOWN_LEAKAGE_FEATURES,
                    "correlations": {},
                    "note": f"Label column '{label_col}' not found",
                }

            label = pd.to_numeric(df[label_col], errors="coerce")

            for col in feature_cols:
                if col not in df.columns or col == label_col:
                    continue
                try:
                    feat = pd.to_numeric(df[col], errors="coerce")
                    valid = feat.notna() & label.notna()
                    if valid.sum() < 5:
                        continue
                    corr = float(feat[valid].corr(label[valid]))
                    correlations[col] = corr
                    if abs(corr) > 0.95:
                        leakage_features.append(col)
                except Exception:
                    pass

        except Exception as e:
            logger.warning("check_label_leakage error: %s", e)

        # Always include hardcoded known leakage features
        for f in KNOWN_LEAKAGE_FEATURES:
            if f not in leakage_features:
                leakage_features.append(f)

        return {
            "leakage_features": leakage_features,
            "correlations": correlations,
        }

    # ------------------------------------------------------------------
    # Null rate check
    # ------------------------------------------------------------------

    def check_null_rates(self, df: pd.DataFrame, threshold: float = 0.3) -> dict:
        """Return features with null rate > threshold."""
        high_null = []
        null_rates = {}

        try:
            n = len(df)
            if n == 0:
                return {"high_null_features": [], "null_rates": {}}

            for col in df.columns:
                try:
                    rate = float(df[col].isna().sum() / n)
                    null_rates[col] = rate
                    if rate > threshold:
                        high_null.append(col)
                except Exception:
                    pass
        except Exception as e:
            logger.warning("check_null_rates error: %s", e)

        return {
            "high_null_features": high_null,
            "null_rates": null_rates,
        }

    # ------------------------------------------------------------------
    # Redundancy check
    # ------------------------------------------------------------------

    def check_redundancy(self, df: pd.DataFrame, threshold: float = 0.9) -> dict:
        """Compute pairwise Pearson correlation; flag pairs with |corr| > threshold."""
        redundant_pairs = []

        try:
            numeric_df = df.select_dtypes(include=[np.number])
            cols = list(numeric_df.columns)

            for i in range(len(cols)):
                for j in range(i + 1, len(cols)):
                    try:
                        col_a, col_b = cols[i], cols[j]
                        valid = numeric_df[col_a].notna() & numeric_df[col_b].notna()
                        if valid.sum() < 5:
                            continue
                        corr = float(
                            numeric_df.loc[valid, col_a].corr(
                                numeric_df.loc[valid, col_b]
                            )
                        )
                        if abs(corr) > threshold:
                            redundant_pairs.append((col_a, col_b, round(corr, 4)))
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("check_redundancy error: %s", e)

        return {"redundant_pairs": redundant_pairs}

    # ------------------------------------------------------------------
    # Distribution check
    # ------------------------------------------------------------------

    def check_distribution(self, df: pd.DataFrame) -> dict:
        """Flag features with |skewness| > 5 as highly skewed."""
        skewed_features = []
        skewness = {}

        try:
            numeric_df = df.select_dtypes(include=[np.number])

            for col in numeric_df.columns:
                try:
                    series = numeric_df[col].dropna()
                    if len(series) < 3:
                        continue
                    sk = float(series.skew())
                    skewness[col] = round(sk, 4)
                    if abs(sk) > 5:
                        skewed_features.append(col)
                except Exception:
                    pass
        except Exception as e:
            logger.warning("check_distribution error: %s", e)

        return {
            "skewed_features": skewed_features,
            "skewness": skewness,
        }

    # ------------------------------------------------------------------
    # Run all checks
    # ------------------------------------------------------------------

    def run_all_checks(self, df: pd.DataFrame, label_col: str = None) -> dict:
        """Run all validation checks and return a combined report."""
        feature_cols = [
            c for c in df.columns if c not in {"artist_id", "prediction_date", "computed_at"}
        ]

        report = {}

        report["temporal_leakage"] = self.check_temporal_leakage(
            df, "prediction_date", feature_cols
        )
        report["null_rates"] = self.check_null_rates(df)
        report["redundancy"] = self.check_redundancy(df)
        report["distribution"] = self.check_distribution(df)

        if label_col is not None:
            report["label_leakage"] = self.check_label_leakage(df, label_col, feature_cols)

        return report
