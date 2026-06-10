# ml/utils/splits.py
"""
Leakage-safe train/test splitting for time-series entity data.

Music trend data is temporal and entity-correlated: random splits leak
future information into training and let the model memorize entities that
appear on both sides. `leakage_safe_split` picks the strongest strategy the
data supports and reports which one was used so metrics can be interpreted:

  1. temporal     — date column present: most recent ~test_size of dates
                    become the test set, and test rows whose entity also
                    appears in train are dropped (entity-disjoint).
  2. group        — no usable date: GroupShuffleSplit on the entity id.
  3. random       — neither column available (logged loudly; metrics from
                    this strategy should not be trusted for forecasting).
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit, train_test_split

logger = logging.getLogger(__name__)


def leakage_safe_split(
    df: pd.DataFrame,
    date_col: Optional[str] = None,
    group_col: Optional[str] = None,
    test_size: float = 0.2,
    random_state: int = 42,
):
    """
    Returns (train_idx, test_idx, strategy) as positional index arrays into df.
    """
    n = len(df)
    if n < 5:
        raise ValueError(f"Not enough rows to split ({n})")

    has_date = bool(date_col) and date_col in df.columns
    has_group = bool(group_col) and group_col in df.columns

    if has_date:
        dates = pd.to_datetime(df[date_col], errors="coerce")
        valid = dates.notna()
        if valid.sum() >= n * 0.9 and dates[valid].nunique() >= 3:
            cutoff = dates[valid].quantile(1 - test_size)
            is_test = (dates > cutoff).to_numpy()
            if has_group and is_test.any() and (~is_test).any():
                train_groups = set(df.loc[~is_test, group_col])
                overlap = is_test & df[group_col].isin(train_groups).to_numpy()
                dropped = int(overlap.sum())
                if dropped:
                    logger.info(
                        "temporal split: dropping %d test rows with entities seen in train",
                        dropped,
                    )
                is_test = is_test & ~overlap
            if is_test.any() and (~is_test).any():
                train_idx = np.where(~is_test)[0]
                test_idx = np.where(is_test)[0]
                logger.info(
                    "split=temporal cutoff=%s train=%d test=%d",
                    cutoff.date() if hasattr(cutoff, "date") else cutoff,
                    len(train_idx),
                    len(test_idx),
                )
                return train_idx, test_idx, "temporal"
        logger.warning("date column unusable for temporal split; trying group split")

    if has_group and df[group_col].nunique() >= 3:
        gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
        train_idx, test_idx = next(gss.split(df, groups=df[group_col]))
        logger.info("split=group train=%d test=%d", len(train_idx), len(test_idx))
        return train_idx, test_idx, "group"

    logger.warning(
        "split=random — no usable date/group columns. Reported metrics will "
        "OVERSTATE forward-looking performance."
    )
    idx = np.arange(n)
    train_idx, test_idx = train_test_split(idx, test_size=test_size, random_state=random_state)
    return train_idx, test_idx, "random"
