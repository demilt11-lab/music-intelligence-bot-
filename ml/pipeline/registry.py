"""
Model registry operations: version, promote, compare, document.
"""
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from omegaconf import DictConfig
from pydantic import BaseModel

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


class ModelVersion(BaseModel):
    name: str
    version: str
    stage: str
    metrics: dict
    params: dict
    tags: dict
    created_at: str
    run_id: str


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class ModelRegistry:
    """Wraps the MLflow model registry for promotion and lifecycle management."""

    def __init__(self, cfg: DictConfig) -> None:
        try:
            import mlflow
            from mlflow.tracking import MlflowClient

            mlflow.set_tracking_uri(cfg.registry.tracking_uri)
            self.client = MlflowClient()
            self._mlflow = mlflow
            self._enabled = True
        except Exception as exc:
            log.warning("MLflow unavailable (%s). Registry operations disabled.", exc)
            self._enabled = False
            self.client = None
            self._mlflow = None
        self.cfg = cfg

    def register(
        self,
        model: Any,
        model_name: str,
        run_id: str,
        metrics: dict,
    ) -> ModelVersion:
        """Register a model artifact in the MLflow model registry."""
        if not self._enabled:
            return self._stub_version(model_name, metrics)

        try:
            model_uri = f"runs:/{run_id}/model"
            mv = self._mlflow.register_model(model_uri, model_name)
            version_str = mv.version

            # Annotate with tags
            base_tags = dict(self.cfg.registry.registry.tags)
            for k, v in base_tags.items():
                self.client.set_model_version_tag(model_name, version_str, k, str(v))
            for k, v in metrics.items():
                self.client.set_model_version_tag(model_name, version_str, f"metric_{k}", str(v))

            log.info("Registered %s v%s from run %s", model_name, version_str, run_id)
            return ModelVersion(
                name=model_name,
                version=version_str,
                stage="None",
                metrics=metrics,
                params={},
                tags=base_tags,
                created_at=datetime.utcnow().isoformat(),
                run_id=run_id,
            )
        except Exception as exc:
            log.error("Model registration failed: %s", exc)
            return self._stub_version(model_name, metrics)

    def promote(
        self,
        model_name: str,
        version: str,
        stage: str,
        thresholds: dict,
    ) -> bool:
        """Transition model version to target stage if it meets metric thresholds."""
        if not self._enabled:
            log.warning("MLflow disabled; cannot promote model.")
            return False

        try:
            mv = self.client.get_model_version(model_name, version)
            tags = {t.key: t.value for t in mv.tags}

            for metric, min_val in thresholds.items():
                tag_key = f"metric_{metric}"
                actual = float(tags.get(tag_key, 0.0))
                if actual < float(min_val):
                    log.info(
                        "Promotion to %s denied: %s=%.3f < threshold %.3f",
                        stage,
                        metric,
                        actual,
                        float(min_val),
                    )
                    return False

            self.client.transition_model_version_stage(
                name=model_name,
                version=version,
                stage=stage,
                archive_existing_versions=False,
            )
            log.info("Promoted %s v%s → %s", model_name, version, stage)
            return True
        except Exception as exc:
            log.error("Promotion failed: %s", exc)
            return False

    def list_versions(self, model_name: str) -> list[ModelVersion]:
        """List all registered versions for a model."""
        if not self._enabled:
            return []
        try:
            versions = self.client.search_model_versions(f"name='{model_name}'")
            results = []
            for mv in versions:
                tags = {t.key: t.value for t in mv.tags}
                metrics = {
                    k.replace("metric_", ""): float(v)
                    for k, v in tags.items()
                    if k.startswith("metric_")
                }
                results.append(
                    ModelVersion(
                        name=mv.name,
                        version=mv.version,
                        stage=mv.current_stage,
                        metrics=metrics,
                        params={},
                        tags={k: v for k, v in tags.items() if not k.startswith("metric_")},
                        created_at=mv.creation_timestamp
                        and datetime.utcfromtimestamp(mv.creation_timestamp / 1000).isoformat()
                        or "",
                        run_id=mv.run_id or "",
                    )
                )
            return results
        except Exception as exc:
            log.error("list_versions failed: %s", exc)
            return []

    def get_production(self, model_name: str) -> Optional[ModelVersion]:
        """Return the current Production version, if any."""
        versions = self.list_versions(model_name)
        for v in versions:
            if v.stage.lower() == "production":
                return v
        return None

    def compare_with_production(
        self, new_metrics: dict, model_name: str
    ) -> dict:
        """Return metric deltas between new_metrics and the production model."""
        prod = self.get_production(model_name)
        if not prod:
            log.info("No production model found for %s; delta is N/A.", model_name)
            return {}
        deltas = {}
        for k, new_val in new_metrics.items():
            prod_val = prod.metrics.get(k, 0.0)
            deltas[k] = float(new_val) - float(prod_val)
        return deltas

    def archive_old(self, model_name: str, keep_n: int = 3) -> None:
        """Archive all but the N most recent versions in each stage."""
        if not self._enabled:
            return
        try:
            versions = self.list_versions(model_name)
            stage_buckets: dict[str, list[ModelVersion]] = {}
            for v in versions:
                stage_buckets.setdefault(v.stage, []).append(v)

            for stage, stage_versions in stage_buckets.items():
                sorted_vs = sorted(stage_versions, key=lambda x: x.version, reverse=True)
                for old in sorted_vs[keep_n:]:
                    self.client.transition_model_version_stage(
                        name=model_name,
                        version=old.version,
                        stage="Archived",
                    )
                    log.info("Archived %s v%s (was %s)", model_name, old.version, stage)
        except Exception as exc:
            log.error("archive_old failed: %s", exc)

    # ------------------------------------------------------------------

    def _stub_version(self, model_name: str, metrics: dict) -> ModelVersion:
        return ModelVersion(
            name=model_name,
            version="0",
            stage="None",
            metrics=metrics,
            params={},
            tags={},
            created_at=datetime.utcnow().isoformat(),
            run_id="",
        )


# ---------------------------------------------------------------------------
# Model documenter
# ---------------------------------------------------------------------------


class ModelDocumenter:
    """Generates model cards in Markdown format."""

    def generate_model_card(
        self,
        version: ModelVersion,
        eval_result: Any,
        output_path: str,
    ) -> None:
        metrics_section = "\n".join(
            f"- **{k}**: {v:.4f}" for k, v in version.metrics.items() if isinstance(v, float)
        )
        tags_section = "\n".join(f"- {k}: {v}" for k, v in version.tags.items())

        usage_example = f"""```python
from ml.pipeline.export import InferenceWrapper

wrapper = InferenceWrapper(
    model_path="exports/{version.name}_v{version.version}.pkl",
    preprocessor_path="data/processed/preprocessor.pkl",
)
result = wrapper.predict({{
    "entity_id": 12345,
    "momentum": 0.72,
    "breakout_prob": 0.45,
    "virality_score": 0.61,
    "confidence": 0.88,
}})
print(result.viral_probability)
```"""

        card = f"""# Model Card: {version.name}

## Model Description
- **Name**: {version.name}
- **Version**: {version.version}
- **Stage**: {version.stage}
- **Run ID**: {version.run_id}
- **Created**: {version.created_at}

## Training Data
- Source: Trajectory predictions table
- Features: momentum, breakout_prob, virality_score, confidence, temporal cyclics, interaction terms
- Target: `is_viral` (1 if virality_score > 0.7)
- Training strategy: stratified train/val/test split (70/15/15)

## Metrics
{metrics_section}

## Tags
{tags_section}

## Limitations
- Model is trained on historical data and may not generalise to unseen music genres.
- Class imbalance (~20–30% positive rate) is handled via `scale_pos_weight`.
- Temporal drift should be monitored monthly; retrain if AUROC drops below 0.75.

## Usage Example
{usage_example}
"""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(card)
        log.info("Model card saved to %s", output_path)
