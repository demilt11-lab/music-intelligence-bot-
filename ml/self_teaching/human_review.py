"""
human_review.py — Human-review routing system for A&R breakout predictions.

Manages a review queue for uncertain predictions, collects human decisions,
validates labels before they enter training, and guards against circular
self-reinforcement where model predictions are fed back as training labels.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
import warnings
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[2]
_OUTPUTS_DIR = _REPO_ROOT / "ml" / "outputs"
_QUEUE_PATH = _OUTPUTS_DIR / "review_queue.json"
_DECISIONS_PATH = _OUTPUTS_DIR / "review_decisions.json"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CONFIDENCE_UNCERTAIN_LOW = 0.40
CONFIDENCE_UNCERTAIN_HIGH = 0.60
CONFIDENCE_REJECT_THRESHOLD = 0.30
REVIEW_EXPIRY_DAYS = 14
OUTCOME_WINDOW_DAYS = 90
LABEL_WEIGHT_CONFIRMED = 1.0
LABEL_WEIGHT_INFERRED = 0.6
LABEL_WEIGHT_UNCERTAIN_DECISION = 0.5
VALID_LABEL_SOURCES = {"chart_monitor", "billboard_api", "manual"}
LOW_STREAM_THRESHOLD = 1000


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ReviewItem:
    """A single prediction awaiting human review."""

    id: str
    artist_id: int
    breakout_probability: float
    confidence_score: float
    top_signals: list[dict[str, Any]]
    predicted_at: str
    reason: str
    status: str  # "pending" | "reviewed" | "expired"
    enqueued_at: str
    expires_at: str

    def is_expired(self) -> bool:
        now = datetime.now(timezone.utc)
        exp = datetime.fromisoformat(self.expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return now > exp

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReviewItem":
        return cls(**data)


@dataclass
class ReviewDecision:
    """A human reviewer's verdict on a ReviewItem."""

    review_id: str
    artist_id: int
    reviewer_id: str
    decision: str  # "breakout" | "no_breakout" | "uncertain"
    notes: str
    decided_at: str
    original_probability: float
    label_weight: float  # 1.0 for confirmed, 0.5 for uncertain

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ReviewDecision":
        return cls(**data)


@dataclass
class ValidatedLabelBatch:
    """Output of LabelQualityGate.validate()."""

    records: list[dict[str, Any]]
    weights: list[float]
    rejection_summary: dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_outputs_dir() -> None:
    _OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


def _load_json_list(path: Path) -> list[dict[str, Any]]:
    """Load a JSON file that contains a list. Returns [] if missing or corrupt."""
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
        logger.warning("Expected list in %s, got %s — resetting.", path, type(data))
        return []
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Could not read %s: %s — starting fresh.", path, exc)
        return []


def _save_json_list(path: Path, data: list[dict[str, Any]]) -> None:
    _ensure_outputs_dir()
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, default=str)
    tmp.replace(path)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_po(prediction_output: Any) -> dict[str, Any]:
    """
    Normalise a PredictionOutput to a plain dict.

    Handles: dataclass instances, plain dicts, and arbitrary objects
    (including those where fields are class-level attributes rather than
    instance-level, which makes vars() return {}).
    """
    if isinstance(prediction_output, dict):
        return prediction_output
    if hasattr(prediction_output, "__dataclass_fields__"):
        return asdict(prediction_output)
    # Generic object: merge class-level attrs with instance-level attrs,
    # ignoring dunder attributes and callables.
    merged: dict[str, Any] = {}
    for key, val in type(prediction_output).__dict__.items():
        if not key.startswith("_") and not callable(val):
            merged[key] = val
    merged.update(
        {k: v for k, v in vars(prediction_output).items() if not k.startswith("_")}
    )
    return merged


def _iso_plus_days(iso: str, days: int) -> str:
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# HumanReviewQueue
# ---------------------------------------------------------------------------


class HumanReviewQueue:
    """
    File-backed queue for predictions that need human A&R review.

    Queue is persisted at ml/outputs/review_queue.json.
    Decisions are persisted at ml/outputs/review_decisions.json.
    """

    def __init__(
        self,
        queue_path: Path = _QUEUE_PATH,
        decisions_path: Path = _DECISIONS_PATH,
    ) -> None:
        self._queue_path = Path(queue_path)
        self._decisions_path = Path(decisions_path)

    # ------------------------------------------------------------------
    # Internal I/O
    # ------------------------------------------------------------------

    def _read_queue(self) -> list[ReviewItem]:
        return [ReviewItem.from_dict(d) for d in _load_json_list(self._queue_path)]

    def _write_queue(self, items: list[ReviewItem]) -> None:
        _save_json_list(self._queue_path, [i.to_dict() for i in items])

    def _read_decisions(self) -> list[ReviewDecision]:
        return [ReviewDecision.from_dict(d) for d in _load_json_list(self._decisions_path)]

    def _write_decisions(self, decisions: list[ReviewDecision]) -> None:
        _save_json_list(self._decisions_path, [d.to_dict() for d in decisions])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def enqueue(self, prediction_output: Any, reason: str) -> ReviewItem:
        """
        Add a prediction to the review queue.

        Parameters
        ----------
        prediction_output:
            A PredictionOutput instance (or any object with the expected
            fields). Accepts both dataclass instances and plain dicts.
        reason:
            Human-readable string explaining why this prediction was routed
            (e.g. "confidence in uncertain zone 0.40–0.60").

        Returns
        -------
        ReviewItem
            The newly created queue entry.
        """
        po = _extract_po(prediction_output)

        now_iso = _utcnow_iso()
        item = ReviewItem(
            id=str(uuid.uuid4()),
            artist_id=int(po["artist_id"]),
            breakout_probability=float(po["breakout_probability"]),
            confidence_score=float(po["confidence_score"]),
            top_signals=po.get("top_signals", []),
            predicted_at=str(po.get("predicted_at", now_iso)),
            reason=reason,
            status="pending",
            enqueued_at=now_iso,
            expires_at=_iso_plus_days(now_iso, REVIEW_EXPIRY_DAYS),
        )

        items = self._read_queue()

        # Avoid duplicate pending entries for the same artist
        existing_ids = {
            i.artist_id for i in items if i.status == "pending"
        }
        if item.artist_id in existing_ids:
            logger.debug(
                "Artist %s already has a pending review; skipping duplicate enqueue.",
                item.artist_id,
            )
            # Return the existing item rather than creating a duplicate
            for existing in items:
                if existing.artist_id == item.artist_id and existing.status == "pending":
                    return existing

        items.append(item)
        self._write_queue(items)
        logger.info("Enqueued review %s for artist %s (reason: %s).", item.id, item.artist_id, reason)
        return item

    def get_pending(self, limit: int = 20) -> list[ReviewItem]:
        """
        Return up to `limit` pending (non-expired) review items, oldest first.

        Expired items are automatically transitioned to status="expired" and
        persisted before filtering.
        """
        items = self._read_queue()
        mutated = False
        pending: list[ReviewItem] = []

        for item in items:
            if item.status == "pending" and item.is_expired():
                item.status = "expired"
                mutated = True
            if item.status == "pending":
                pending.append(item)

        if mutated:
            self._write_queue(items)

        # Sort by enqueued_at ascending so oldest come first
        pending.sort(key=lambda x: x.enqueued_at)
        return pending[:limit]

    def submit_decision(
        self,
        review_id: str,
        decision: str,
        reviewer_id: str,
        notes: str = "",
    ) -> ReviewDecision:
        """
        Record a human reviewer's verdict for the given review_id.

        Parameters
        ----------
        review_id:
            UUID of the ReviewItem being decided.
        decision:
            One of "breakout", "no_breakout", "uncertain".
        reviewer_id:
            Identifier of the reviewer (e.g. Slack handle, employee ID).
        notes:
            Optional free-text notes from the reviewer.

        Returns
        -------
        ReviewDecision
            The persisted decision record.

        Raises
        ------
        ValueError
            If review_id is not found, already reviewed, or decision is invalid.
        """
        valid_decisions = {"breakout", "no_breakout", "uncertain"}
        if decision not in valid_decisions:
            raise ValueError(
                f"Invalid decision '{decision}'. Must be one of {valid_decisions}."
            )

        items = self._read_queue()
        target: ReviewItem | None = None
        for item in items:
            if item.id == review_id:
                target = item
                break

        if target is None:
            raise ValueError(f"Review ID '{review_id}' not found in queue.")
        if target.status == "reviewed":
            raise ValueError(f"Review ID '{review_id}' has already been decided.")
        if target.status == "expired":
            raise ValueError(f"Review ID '{review_id}' has expired and can no longer be decided.")

        # Label weight: confirmed decisions get 1.0, uncertain gets 0.5
        label_weight = (
            LABEL_WEIGHT_UNCERTAIN_DECISION if decision == "uncertain" else LABEL_WEIGHT_CONFIRMED
        )

        review_decision = ReviewDecision(
            review_id=review_id,
            artist_id=target.artist_id,
            reviewer_id=reviewer_id,
            decision=decision,
            notes=notes,
            decided_at=_utcnow_iso(),
            original_probability=target.breakout_probability,
            label_weight=label_weight,
        )

        # Mark item as reviewed
        target.status = "reviewed"
        self._write_queue(items)

        # Persist decision
        decisions = self._read_decisions()
        decisions.append(review_decision)
        self._write_decisions(decisions)

        logger.info(
            "Decision submitted for review %s: %s (weight=%.2f) by %s.",
            review_id,
            decision,
            label_weight,
            reviewer_id,
        )
        return review_decision

    def get_completed(self, since_days: int = 30) -> list[ReviewDecision]:
        """
        Return all completed decisions made within the last `since_days` days.

        Intended for retrieval by the training pipeline to incorporate
        high-weight human-labeled examples.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
        decisions = self._read_decisions()
        result: list[ReviewDecision] = []
        for d in decisions:
            decided_at = datetime.fromisoformat(d.decided_at)
            if decided_at.tzinfo is None:
                decided_at = decided_at.replace(tzinfo=timezone.utc)
            if decided_at >= cutoff:
                result.append(d)
        return result


# ---------------------------------------------------------------------------
# ReviewRouter
# ---------------------------------------------------------------------------


class ReviewRouter:
    """
    Decides whether a prediction should be routed to human review,
    and enqueues it if so.
    """

    def __init__(self, queue: HumanReviewQueue | None = None) -> None:
        self._queue = queue or HumanReviewQueue()

    # ------------------------------------------------------------------
    # Routing logic
    # ------------------------------------------------------------------

    def should_route_to_human(self, prediction_output: Any) -> tuple[bool, str]:
        """
        Evaluate whether `prediction_output` should go to a human reviewer.

        Returns
        -------
        (bool, reason_str)
            bool  — True if routing to human is warranted.
            reason_str — Description of the triggering condition, or ""
                         if no routing is needed.
        """
        po = _extract_po(prediction_output)

        confidence: float = float(po.get("confidence_score", 0.0))
        top_signals: list[dict] = po.get("top_signals", []) or []

        # Rule 1: Confidence in the uncertain zone
        if CONFIDENCE_UNCERTAIN_LOW <= confidence <= CONFIDENCE_UNCERTAIN_HIGH:
            return True, (
                f"Confidence score {confidence:.3f} is in the uncertain zone "
                f"[{CONFIDENCE_UNCERTAIN_LOW}, {CONFIDENCE_UNCERTAIN_HIGH}]."
            )

        # Rule 2: Contradictory signals — high TikTok engagement but low save rate
        signal_map: dict[str, float] = {}
        for sig in top_signals:
            name = str(sig.get("signal", sig.get("name", ""))).lower()
            value = sig.get("value")
            try:
                signal_map[name] = float(value)
            except (TypeError, ValueError):
                pass

        tiktok_keys = [k for k in signal_map if "tiktok" in k]
        save_rate_keys = [k for k in signal_map if "save" in k and "rate" in k]

        if tiktok_keys and save_rate_keys:
            tiktok_val = max(signal_map[k] for k in tiktok_keys)
            save_rate_val = min(signal_map[k] for k in save_rate_keys)
            # Heuristic: TikTok signal in top 25% but save rate in bottom 25%
            if tiktok_val >= 0.75 and save_rate_val <= 0.25:
                return True, (
                    f"Contradictory signals: high TikTok engagement ({tiktok_val:.2f}) "
                    f"combined with low save rate ({save_rate_val:.2f})."
                )

        # Rule 3: Artist has fewer than LOW_STREAM_THRESHOLD streams
        stream_keys = [k for k in signal_map if "stream" in k]
        if stream_keys:
            total_streams = sum(signal_map[k] for k in stream_keys)
            if total_streams < LOW_STREAM_THRESHOLD:
                return True, (
                    f"Artist has only {total_streams:.0f} streams "
                    f"(threshold: {LOW_STREAM_THRESHOLD})."
                )

        return False, ""

    def route(self, prediction_output: Any) -> dict[str, Any]:
        """
        Evaluate and (if warranted) enqueue the prediction for human review.

        Returns
        -------
        dict with keys:
            routed (bool)        — whether the prediction was queued.
            reason (str)         — reason for routing, or "" if not routed.
            review_item (ReviewItem | None) — the queue entry, if created.
        """
        should_route, reason = self.should_route_to_human(prediction_output)

        if not should_route:
            return {"routed": False, "reason": "", "review_item": None}

        review_item = self._queue.enqueue(prediction_output, reason)
        return {"routed": True, "reason": reason, "review_item": review_item}


# ---------------------------------------------------------------------------
# LabelQualityGate
# ---------------------------------------------------------------------------


class LabelQualityGate:
    """
    Validates outcome records before they are added to the training set.

    Applies business rules around time windows, source trust, and
    confidence thresholds to assign per-record weights and filter noise.
    """

    def validate(
        self,
        outcome_records: list[dict[str, Any]],
        reference_date: datetime | None = None,
    ) -> ValidatedLabelBatch:
        """
        Filter and weight a batch of outcome records for training.

        Parameters
        ----------
        outcome_records:
            Each record is expected to have at minimum:
                - predicted_at (ISO timestamp)
                - confidence_score (float 0–1)
                - feedback_source or feedbackSource (str)
                - outcome_label or label (str, e.g. "breakout"/"no_breakout")
        reference_date:
            Treat this as "now" when computing the 90-day window. Defaults to
            the real UTC now. Useful for deterministic unit testing.

        Returns
        -------
        ValidatedLabelBatch
        """
        if reference_date is None:
            reference_date = datetime.now(timezone.utc)

        accepted: list[dict[str, Any]] = []
        weights: list[float] = []
        rejection_counts: dict[str, int] = {
            "outcome_window_not_passed": 0,
            "low_confidence_negative": 0,
            "unknown_source": 0,
        }

        for record in outcome_records:
            # Normalise field names
            predicted_at_raw = record.get("predicted_at") or record.get("predictedAt", "")
            confidence = float(record.get("confidence_score", record.get("confidenceScore", 0.0)))
            feedback_source = str(
                record.get("feedback_source", record.get("feedbackSource", "unknown"))
            ).lower()
            outcome_label = str(
                record.get("outcome_label", record.get("label", "unknown"))
            ).lower()

            # Rule 1: 90-day outcome window must have elapsed
            try:
                predicted_at = datetime.fromisoformat(predicted_at_raw)
                if predicted_at.tzinfo is None:
                    predicted_at = predicted_at.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                # Cannot parse date — treat as if window has not passed
                rejection_counts["outcome_window_not_passed"] += 1
                logger.debug("Rejected record (unparseable predicted_at): %s", record.get("artist_id"))
                continue

            days_elapsed = (reference_date - predicted_at).days
            if days_elapsed < OUTCOME_WINDOW_DAYS:
                rejection_counts["outcome_window_not_passed"] += 1
                logger.debug(
                    "Rejected record for artist %s: only %d days elapsed (need %d).",
                    record.get("artist_id"),
                    days_elapsed,
                    OUTCOME_WINDOW_DAYS,
                )
                continue

            # Rule 2: Reject low-confidence predictions with a negative outcome
            # (too noisy to train on — the model wasn't sure AND the outcome is negative)
            is_negative_outcome = outcome_label in {"no_breakout", "negative", "0", "false"}
            if confidence < CONFIDENCE_REJECT_THRESHOLD and is_negative_outcome:
                rejection_counts["low_confidence_negative"] += 1
                logger.debug(
                    "Rejected record for artist %s: confidence %.3f < %.2f with negative outcome.",
                    record.get("artist_id"),
                    confidence,
                    CONFIDENCE_REJECT_THRESHOLD,
                )
                continue

            # Rule 3: Assign weight based on feedback source
            if feedback_source in {"manual"}:
                weight = LABEL_WEIGHT_CONFIRMED
            elif feedback_source in {"billboard_api"}:
                weight = LABEL_WEIGHT_CONFIRMED
            elif feedback_source not in {"", "unknown", "model_prediction"}:
                # Any other known source is treated as inferred
                weight = LABEL_WEIGHT_INFERRED
            else:
                # Completely unknown source — reject
                rejection_counts["unknown_source"] += 1
                logger.debug(
                    "Rejected record for artist %s: unknown feedback source '%s'.",
                    record.get("artist_id"),
                    feedback_source,
                )
                continue

            enriched = dict(record)
            enriched["_label_weight"] = weight
            accepted.append(enriched)
            weights.append(weight)

        total = len(outcome_records)
        accepted_count = len(accepted)
        rejection_summary: dict[str, Any] = {
            "total_input": total,
            "accepted": accepted_count,
            "rejected": total - accepted_count,
            "rejection_breakdown": rejection_counts,
            "acceptance_rate": round(accepted_count / total, 4) if total > 0 else 0.0,
        }

        logger.info(
            "LabelQualityGate: %d/%d records accepted (%.1f%%).",
            accepted_count,
            total,
            rejection_summary["acceptance_rate"] * 100,
        )

        return ValidatedLabelBatch(
            records=accepted,
            weights=weights,
            rejection_summary=rejection_summary,
        )


# ---------------------------------------------------------------------------
# SelfReinforcementGuard
# ---------------------------------------------------------------------------


class SelfReinforcementGuard:
    """
    Prevents the model from training on its own past predictions.

    Circular training — using model-generated labels as ground truth —
    leads to compounding bias and confidence inflation over time.
    This guard removes any rows where label_source indicates the label
    itself originated from the model.
    """

    VALID_SOURCES: frozenset[str] = frozenset(VALID_LABEL_SOURCES)

    def filter_training_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Remove rows where `label_source` is "model_prediction".

        Parameters
        ----------
        df:
            Training DataFrame. Must contain a ``label_source`` column.
            If the column is absent, a warning is logged and the DataFrame
            is returned unchanged.

        Returns
        -------
        pd.DataFrame
            Filtered DataFrame with self-reinforcing rows removed.
        """
        if "label_source" not in df.columns:
            warnings.warn(
                "SelfReinforcementGuard: 'label_source' column not found in DataFrame. "
                "No filtering applied — verify the training pipeline is passing the correct data.",
                UserWarning,
                stacklevel=2,
            )
            return df

        circular_mask = df["label_source"] == "model_prediction"
        circular_count: int = int(circular_mask.sum())

        if circular_count > 0:
            logger.warning(
                "SelfReinforcementGuard: Removed %d row(s) where label_source == "
                "'model_prediction'. Circular training data is NOT allowed.",
                circular_count,
            )

        # Also warn about any unrecognised sources (but don't hard-reject them here —
        # that is the responsibility of LabelQualityGate).
        unknown_mask = ~df["label_source"].isin(self.VALID_SOURCES) & ~circular_mask
        unknown_count: int = int(unknown_mask.sum())
        if unknown_count > 0:
            unknown_sources = df.loc[unknown_mask, "label_source"].unique().tolist()
            logger.warning(
                "SelfReinforcementGuard: %d row(s) have unrecognised label sources: %s. "
                "These were not removed here — pass the data through LabelQualityGate first.",
                unknown_count,
                unknown_sources,
            )

        filtered = df[~circular_mask].copy()
        filtered.reset_index(drop=True, inplace=True)
        return filtered

    def audit(self, df: pd.DataFrame) -> dict[str, Any]:
        """
        Return a summary of label sources present in the DataFrame without
        modifying it. Useful for debugging pipeline provenance.

        Returns
        -------
        dict with keys:
            total_rows (int)
            source_counts (dict[str, int])
            circular_rows (int)
            valid_rows (int)
            unknown_source_rows (int)
        """
        if "label_source" not in df.columns:
            return {
                "total_rows": len(df),
                "source_counts": {},
                "circular_rows": 0,
                "valid_rows": 0,
                "unknown_source_rows": 0,
                "error": "label_source column missing",
            }

        source_counts: dict[str, int] = df["label_source"].value_counts().to_dict()
        circular = int((df["label_source"] == "model_prediction").sum())
        valid = int(df["label_source"].isin(self.VALID_SOURCES).sum())
        unknown = len(df) - circular - valid

        return {
            "total_rows": len(df),
            "source_counts": source_counts,
            "circular_rows": circular,
            "valid_rows": valid,
            "unknown_source_rows": max(unknown, 0),
        }
