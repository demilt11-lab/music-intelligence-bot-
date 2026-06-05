"""
LoopOrchestrator — ties together all continuous-learning components.

Called by the watchdog after each retraining trigger and on the weekly
scheduled run. Runs the full loop:

  1. Collect outcomes (90-day window)
  2. Run drift detection (data, performance, feature)
  3. Validate labels (quality gate + self-reinforcement guard)
  4. Route uncertain predictions to human review
  5. Trigger retraining if thresholds are met
  6. Promote or rollback new model version
  7. Save new reference snapshot for next drift cycle

Design principle: the model's own predictions are NEVER used as training
labels. Only chart_monitor / billboard_api / manual labels are admitted.
"""
import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class LoopRunResult:
    ran_at: str
    outcomes_evaluated: int
    new_labeled_cases: int
    drift_action: str            # "none" | "investigate" | "retrain" | "alert_team"
    drift_features: list[str]    # affected features
    labels_admitted: int
    labels_rejected: int
    rejection_reasons: dict
    human_review_routed: int
    retraining_triggered: bool
    retraining_action: str       # "promoted" | "rolled_back" | "skipped" | "failed" | "none"
    retraining_delta: Optional[float]
    error: Optional[str]


class LoopOrchestrator:
    """
    Orchestrates the full continuous-learning cycle.

    Parameters
    ----------
    trainer_cfg : RetrainingConfig
        Config for the weekly trainer (model type, thresholds, paths).
    outcomes_path : str
        Path to outcomes CSV/parquet (AccuracyTracker file).
    reference_snapshot_path : str
        Path to the feature reference JSON snapshot (DriftMonitor uses this).
    review_queue_path : str
        Path to the human review queue JSON file.
    """

    def __init__(
        self,
        trainer_cfg,
        outcomes_path: str = "ml/outputs/outcomes.csv",
        reference_snapshot_path: str = "ml/outputs/feature_reference.json",
        review_queue_path: str = "ml/outputs/review_queue.json",
    ) -> None:
        self.trainer_cfg = trainer_cfg
        self.outcomes_path = outcomes_path
        self.reference_snapshot_path = reference_snapshot_path
        self.review_queue_path = review_queue_path

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(
        self,
        pending_predictions: list[dict],
        chart_data: list[dict],
        current_feature_df=None,    # pandas DataFrame of recent feature values
        uncertain_predictions: list = None,  # PredictionOutput list for review routing
    ) -> LoopRunResult:
        """
        Run one full learning-loop iteration.

        Parameters
        ----------
        pending_predictions : list[dict]
            Predictions from DB that are past the 90-day evaluation window.
        chart_data : list[dict]
            Chart appearances (artist_id, charted_at, chart_name) fetched externally.
        current_feature_df : pd.DataFrame, optional
            Recent feature values for drift detection. Skip drift if None.
        uncertain_predictions : list[PredictionOutput], optional
            New predictions in confidence 40-60% range to route to human review.
        """
        ran_at = datetime.now(timezone.utc).isoformat()
        error: Optional[str] = None

        # ── 1. Evaluate outcomes ─────────────────────────────────────────
        from ml.self_teaching.feedback_loop import FeedbackLoop, AccuracyTracker

        tracker = AccuracyTracker(outcomes_path=self.outcomes_path)
        feedback = FeedbackLoop(self.trainer_cfg, outcomes_path=self.outcomes_path)

        outcome_records = feedback.evaluate_pending(pending_predictions, chart_data)
        tracker.add_outcomes(outcome_records)
        outcomes_evaluated = len(outcome_records)
        new_labeled = tracker.count_new_labeled("")
        log.info("Step 1: evaluated %d outcomes, %d labeled total", outcomes_evaluated, new_labeled)

        # ── 2. Drift detection ───────────────────────────────────────────
        drift_action = "none"
        drift_features: list[str] = []

        try:
            from ml.self_teaching.drift_detector import DriftMonitor, DriftReport

            monitor = DriftMonitor(
                reference_snapshot_path=self.reference_snapshot_path,
                outcomes_path=self.outcomes_path,
            )
            report: DriftReport = monitor.run(current_feature_df=current_feature_df)
            drift_action = report.recommended_action
            drift_features = [s.feature for s in report.data_drift_signals + report.feature_drift_signals]
            log.info(
                "Step 2: drift detection → action=%s, affected=%s",
                drift_action, drift_features,
            )
        except Exception as exc:
            log.warning("Drift detection failed (non-fatal): %s", exc)

        # ── 3. Label quality gate + self-reinforcement guard ─────────────
        labels_admitted = 0
        labels_rejected = 0
        rejection_reasons: dict = {}

        try:
            from ml.self_teaching.human_review import LabelQualityGate, SelfReinforcementGuard
            import pandas as pd

            raw_dicts = [
                {
                    "prediction_id":        r.prediction_id,
                    "artist_id":            r.artist_id,
                    "predicted_at":         r.predicted_at,
                    "breakout_probability": r.breakout_probability,
                    "actual_broke_out":     r.actual_broke_out,
                    "was_correct":          r.was_correct,
                    "charted_at":           r.charted_at,
                    "chart_name":           r.chart_name,
                    "feedback_source":      "chart_monitor",
                    "label_source":         "chart_monitor",
                }
                for r in outcome_records
            ]

            if raw_dicts:
                gate = LabelQualityGate()
                guard = SelfReinforcementGuard()
                df = pd.DataFrame(raw_dicts)
                df = guard.filter_training_data(df)
                validated = gate.validate(df.to_dict("records"))
                labels_admitted = len(validated.records)
                labels_rejected = len(raw_dicts) - labels_admitted
                rejection_reasons = validated.rejection_summary
                log.info(
                    "Step 3: label gate admitted=%d rejected=%d",
                    labels_admitted, labels_rejected,
                )
        except Exception as exc:
            log.warning("Label quality gate failed (non-fatal): %s", exc)

        # ── 4. Route uncertain predictions to human review ───────────────
        human_review_routed = 0

        if uncertain_predictions:
            try:
                from ml.self_teaching.human_review import ReviewRouter
                router = ReviewRouter(queue_path=self.review_queue_path)
                for pred in uncertain_predictions:
                    should_route, reason = router.should_route_to_human(pred)
                    if should_route:
                        router.route(pred)
                        human_review_routed += 1
                log.info("Step 4: routed %d predictions to human review", human_review_routed)
            except Exception as exc:
                log.warning("Human review routing failed (non-fatal): %s", exc)

        # ── 5. Retraining decision ───────────────────────────────────────
        retraining_triggered = False
        retraining_action = "none"
        retraining_delta: Optional[float] = None

        should_retrain = (
            new_labeled >= 100              # 100+ new labels
            or drift_action == "retrain"    # data/performance drift triggered
            or drift_action == "alert_team"
        )

        if should_retrain:
            log.info("Step 5: triggering retraining (reason: %s)", drift_action if drift_action != "none" else "label_threshold")
            retraining_triggered = True
            try:
                from ml.self_teaching.weekly_trainer import WeeklyTrainer
                trainer = WeeklyTrainer(self.trainer_cfg)
                result = trainer.run(new_labeled_cases=new_labeled)
                retraining_action = result.action
                retraining_delta = result.accuracy_delta
                log.info("Step 5: retraining → action=%s, delta=%.4f", result.action, result.accuracy_delta)

                # ── 6. Save new reference snapshot if model promoted ─────
                if result.action == "promoted" and current_feature_df is not None:
                    try:
                        from ml.self_teaching.drift_detector import DriftMonitor
                        DriftMonitor.save_reference_snapshot(
                            current_feature_df,
                            self.reference_snapshot_path,
                        )
                        log.info("Step 6: reference snapshot updated")
                    except Exception as exc:
                        log.warning("Could not save reference snapshot: %s", exc)

            except Exception as exc:
                error = str(exc)
                retraining_action = "failed"
                log.exception("Step 5: retraining failed: %s", exc)
        else:
            log.info("Step 5: no retraining triggered (labels=%d, drift=%s)", new_labeled, drift_action)

        return LoopRunResult(
            ran_at=ran_at,
            outcomes_evaluated=outcomes_evaluated,
            new_labeled_cases=new_labeled,
            drift_action=drift_action,
            drift_features=drift_features,
            labels_admitted=labels_admitted,
            labels_rejected=labels_rejected,
            rejection_reasons=rejection_reasons,
            human_review_routed=human_review_routed,
            retraining_triggered=retraining_triggered,
            retraining_action=retraining_action,
            retraining_delta=retraining_delta,
            error=error,
        )

    def get_system_status(self) -> dict:
        """Quick health summary for the monitoring dashboard."""
        try:
            from ml.self_teaching.feedback_loop import AccuracyTracker
            tracker = AccuracyTracker(outcomes_path=self.outcomes_path)
            report = tracker.compute_accuracy(since_days=30)
            trend = tracker.get_accuracy_trend(n_periods=4)
            return {
                "accuracy_30d":   report.overall_accuracy,
                "precision_30d":  report.precision,
                "recall_30d":     report.recall,
                "f1_30d":         report.f1,
                "total_evaluated": report.total_evaluated,
                "trend":          trend,
            }
        except Exception as exc:
            return {"error": str(exc)}
