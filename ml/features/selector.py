"""
Feature selection for breakout artist detection models.
"""

import logging
import numpy as np
import pandas as pd

from ml.features.blueprint import FeatureBlueprintRegistry, ExpectedImpact
from ml.features.validator import FeatureValidator

logger = logging.getLogger(__name__)

# Features that are known to be noisy/lagging and should be removed by default
DEFAULT_NOISY_REMOVE = [
    "monthly_listeners",
    "follower_count",
    "youtube_subscribers",
    "radio_audience",
]


class FeatureSelector:
    """Selects the best feature set for model training."""

    def __init__(self):
        self.registry = FeatureBlueprintRegistry()
        self.validator = FeatureValidator()

    # ------------------------------------------------------------------
    # Main selection method
    # ------------------------------------------------------------------

    def select_features(
        self,
        df: pd.DataFrame,
        label_col: str,
        method: str = "mutual_info",
        top_n: int = 30,
    ) -> list:
        """
        Select features using the specified method.

        method options:
          "blueprint"     — return high-impact features from registry (no data required)
          "correlation"   — |Pearson corr with label|, descending
          "variance"      — drop zero-variance, sort by std descending
          "mutual_info"   — approximate mutual information via quartile discretization
        """
        try:
            if method == "blueprint":
                return self.registry.get_high_impact_features()

            feature_cols = self._get_candidate_cols(df, label_col)

            if method == "correlation":
                return self._select_by_correlation(df, label_col, feature_cols, top_n)
            elif method == "variance":
                return self._select_by_variance(df, feature_cols, top_n)
            elif method == "mutual_info":
                return self._select_by_mutual_info(df, label_col, feature_cols, top_n)
            else:
                logger.warning("Unknown method '%s', falling back to blueprint.", method)
                return self.registry.get_high_impact_features()

        except Exception as e:
            logger.warning("select_features error: %s", e)
            return self.registry.get_high_impact_features()

    # ------------------------------------------------------------------
    # Redundancy removal
    # ------------------------------------------------------------------

    def remove_redundant(
        self,
        df: pd.DataFrame,
        features: list,
        threshold: float = 0.9,
        label_col: str = None,
    ) -> list:
        """
        Remove redundant features. When two features are correlated above threshold,
        keep the one with higher |correlation to label| (or alphabetically first if no label).
        """
        try:
            result = list(features)
            redundancy = self.validator.check_redundancy(df[result] if set(result).issubset(df.columns) else df)
            pairs = redundancy.get("redundant_pairs", [])

            to_remove = set()
            for col_a, col_b, corr in pairs:
                if col_a not in result or col_b not in result:
                    continue
                if col_a in to_remove or col_b in to_remove:
                    continue

                if label_col and label_col in df.columns:
                    label = pd.to_numeric(df[label_col], errors="coerce")
                    try:
                        corr_a = abs(
                            pd.to_numeric(df[col_a], errors="coerce").corr(label)
                        )
                        corr_b = abs(
                            pd.to_numeric(df[col_b], errors="coerce").corr(label)
                        )
                        to_remove.add(col_b if corr_a >= corr_b else col_a)
                    except Exception:
                        to_remove.add(col_b)
                else:
                    to_remove.add(col_b)

            return [f for f in result if f not in to_remove]
        except Exception as e:
            logger.warning("remove_redundant error: %s", e)
            return features

    # ------------------------------------------------------------------
    # Recommended feature set
    # ------------------------------------------------------------------

    def get_recommended_feature_set(
        self, df: pd.DataFrame, label_col: str
    ) -> dict:
        """
        Return the recommended feature set after removing noisy, redundant, and leaky features.

        Steps:
          1. Start with all blueprint training features (no HIGH leakage)
          2. Remove known noisy features
          3. Remove redundant features detected above threshold
          4. Sort by expected_impact (HIGH first), then by |corr with label|
          5. Return top 30 features
        """
        try:
            # Step 1: training-safe blueprint features
            all_training = self.registry.get_training_features()

            # Step 2: remove known noisy features
            removed_noisy = [f for f in DEFAULT_NOISY_REMOVE if f in all_training]
            candidates = [f for f in all_training if f not in DEFAULT_NOISY_REMOVE]

            # Step 3: remove redundant features (only from cols present in df)
            present = [f for f in candidates if f in df.columns]
            if label_col in df.columns and len(present) > 1:
                present_clean = self.remove_redundant(
                    df, present, threshold=0.9, label_col=label_col
                )
            else:
                present_clean = present

            removed_redundant = [f for f in present if f not in present_clean]
            removed_leakage = ["streams_after_breakout", "breakout_flag_at_prediction"]

            # Step 4: sort by impact then correlation
            def sort_key(feat_name):
                spec = self.registry.features.get(feat_name)
                impact_order = {
                    ExpectedImpact.HIGH: 0,
                    ExpectedImpact.MEDIUM: 1,
                    ExpectedImpact.LOW: 2,
                }
                impact_rank = impact_order.get(
                    spec.expected_impact if spec else None, 3
                )
                corr_val = 0.0
                if label_col in df.columns and feat_name in df.columns:
                    try:
                        label = pd.to_numeric(df[label_col], errors="coerce")
                        feat = pd.to_numeric(df[feat_name], errors="coerce")
                        corr_val = abs(float(feat.corr(label)))
                    except Exception:
                        pass
                return (impact_rank, -corr_val)

            sorted_features = sorted(present_clean, key=sort_key)
            top_features = sorted_features[:30]

            rationale = (
                f"Started with {len(all_training)} blueprint training features. "
                f"Removed {len(removed_noisy)} noisy features, "
                f"{len(removed_redundant)} redundant features. "
                f"Returning top {len(top_features)} features sorted by expected impact "
                f"and correlation with label."
            )

            return {
                "features": top_features,
                "removed_noisy": removed_noisy,
                "removed_redundant": removed_redundant,
                "removed_leakage": removed_leakage,
                "rationale": rationale,
            }

        except Exception as e:
            logger.warning("get_recommended_feature_set error: %s", e)
            return {
                "features": self.registry.get_high_impact_features()[:30],
                "removed_noisy": [],
                "removed_redundant": [],
                "removed_leakage": ["streams_after_breakout", "breakout_flag_at_prediction"],
                "rationale": f"Fallback to blueprint due to error: {e}",
            }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_candidate_cols(self, df: pd.DataFrame, label_col: str) -> list:
        """Return numeric columns excluding the label and metadata cols."""
        exclude = {label_col, "artist_id", "prediction_date", "computed_at", "prediction_date_dt"}
        return [
            c
            for c in df.select_dtypes(include=[np.number]).columns
            if c not in exclude
        ]

    def _select_by_correlation(
        self,
        df: pd.DataFrame,
        label_col: str,
        feature_cols: list,
        top_n: int,
    ) -> list:
        """Return top N features by |Pearson correlation with label|."""
        try:
            if label_col not in df.columns:
                return feature_cols[:top_n]

            label = pd.to_numeric(df[label_col], errors="coerce")
            corrs = {}
            for col in feature_cols:
                try:
                    feat = pd.to_numeric(df[col], errors="coerce")
                    valid = feat.notna() & label.notna()
                    if valid.sum() < 3:
                        corrs[col] = 0.0
                        continue
                    corrs[col] = abs(float(feat[valid].corr(label[valid])))
                except Exception:
                    corrs[col] = 0.0

            return sorted(corrs, key=lambda c: corrs[c], reverse=True)[:top_n]
        except Exception as e:
            logger.warning("_select_by_correlation error: %s", e)
            return feature_cols[:top_n]

    def _select_by_variance(
        self, df: pd.DataFrame, feature_cols: list, top_n: int
    ) -> list:
        """Drop zero-variance features; sort remaining by std descending."""
        try:
            stds = {}
            for col in feature_cols:
                try:
                    std = float(pd.to_numeric(df[col], errors="coerce").std())
                    if std > 0:
                        stds[col] = std
                except Exception:
                    pass
            return sorted(stds, key=lambda c: stds[c], reverse=True)[:top_n]
        except Exception as e:
            logger.warning("_select_by_variance error: %s", e)
            return feature_cols[:top_n]

    def _select_by_mutual_info(
        self,
        df: pd.DataFrame,
        label_col: str,
        feature_cols: list,
        top_n: int,
    ) -> list:
        """
        Approximate mutual information by discretizing features into quartiles,
        then computing entropy-based MI.
        """
        try:
            if label_col not in df.columns:
                return feature_cols[:top_n]

            label = pd.to_numeric(df[label_col], errors="coerce")
            mi_scores = {}

            for col in feature_cols:
                try:
                    feat = pd.to_numeric(df[col], errors="coerce")
                    valid = feat.notna() & label.notna()
                    if valid.sum() < 5:
                        mi_scores[col] = 0.0
                        continue

                    f_valid = feat[valid]
                    l_valid = label[valid]

                    # Discretize feature into quartiles
                    try:
                        f_disc = pd.qcut(f_valid, q=4, labels=False, duplicates="drop")
                    except Exception:
                        f_disc = (f_valid > f_valid.median()).astype(int)

                    # Discretize label (binary or quartile)
                    unique_labels = l_valid.nunique()
                    if unique_labels <= 4:
                        l_disc = l_valid.astype(int)
                    else:
                        try:
                            l_disc = pd.qcut(l_valid, q=4, labels=False, duplicates="drop")
                        except Exception:
                            l_disc = (l_valid > l_valid.median()).astype(int)

                    mi_scores[col] = self._compute_mi(f_disc, l_disc)
                except Exception:
                    mi_scores[col] = 0.0

            return sorted(mi_scores, key=lambda c: mi_scores[c], reverse=True)[:top_n]
        except Exception as e:
            logger.warning("_select_by_mutual_info error: %s", e)
            return feature_cols[:top_n]

    @staticmethod
    def _entropy(series: pd.Series) -> float:
        """Compute Shannon entropy."""
        try:
            counts = series.value_counts(dropna=True)
            probs = counts / counts.sum()
            return float(-np.sum(probs * np.log2(probs + 1e-10)))
        except Exception:
            return 0.0

    def _compute_mi(self, x: pd.Series, y: pd.Series) -> float:
        """Compute I(X;Y) = H(X) + H(Y) - H(X,Y)."""
        try:
            valid = x.notna() & y.notna()
            x = x[valid]
            y = y[valid]
            if len(x) < 3:
                return 0.0
            joint = x.astype(str) + "_" + y.astype(str)
            hx = self._entropy(x)
            hy = self._entropy(y)
            hxy = self._entropy(joint)
            return max(0.0, hx + hy - hxy)
        except Exception:
            return 0.0
