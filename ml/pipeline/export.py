"""
Model export for production deployment: pickle, ONNX, inference API.
"""
import json
import logging
import pickle
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

try:
    import hydra
except ImportError:
    hydra = None
import numpy as np
try:
    from omegaconf import DictConfig
except ImportError:
    DictConfig = dict
from pydantic import BaseModel, Field, field_validator

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class LatencyResult:
    n_samples: int
    p50_ms: float
    p95_ms: float
    p99_ms: float
    mean_ms: float


class PredictionResult(BaseModel):
    entity_id: int
    is_viral: bool
    viral_probability: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    model_version: str
    latency_ms: float

    @field_validator("viral_probability", "confidence", mode="before")
    @classmethod
    def clamp_probability(cls, v: Any) -> float:
        return float(max(0.0, min(1.0, v)))


# ---------------------------------------------------------------------------
# Exporter
# ---------------------------------------------------------------------------


class ModelExporter:
    """Exports trained models to various formats for deployment."""

    def export_pickle(self, model: Any, path: str, metadata: dict) -> str:
        """Pickle model with cloudpickle; write metadata sidecar JSON."""
        import cloudpickle

        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "wb") as f:
            cloudpickle.dump(model, f)

        sidecar_path = p.with_suffix(".json")
        with open(sidecar_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, default=str)

        log.info("Exported pickle to %s  (sidecar: %s)", p, sidecar_path)
        return str(p)

    def export_onnx(self, model: Any, path: str, input_example: np.ndarray) -> str:
        """Export sklearn model to ONNX via skl2onnx (optional dependency)."""
        try:
            from skl2onnx import convert_sklearn
            from skl2onnx.common.data_types import FloatTensorType

            n_features = input_example.shape[1] if input_example.ndim > 1 else len(input_example)
            initial_type = [("float_input", FloatTensorType([None, n_features]))]
            onx = convert_sklearn(model, initial_types=initial_type)

            p = Path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "wb") as f:
                f.write(onx.SerializeToString())
            log.info("Exported ONNX model to %s", p)
            return str(p)

        except ImportError:
            log.warning("skl2onnx not installed; skipping ONNX export for sklearn model.")
        except Exception as exc:
            log.warning("ONNX export failed: %s", exc)

        # PyTorch fallback
        try:
            import torch

            if isinstance(model, torch.nn.Module):
                p = Path(path)
                p.parent.mkdir(parents=True, exist_ok=True)
                dummy = torch.tensor(input_example, dtype=torch.float32)
                torch.onnx.export(
                    model,
                    dummy,
                    str(p),
                    input_names=["input"],
                    output_names=["output"],
                    dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
                )
                log.info("Exported PyTorch ONNX model to %s", p)
                return str(p)
        except Exception as exc:
            log.warning("PyTorch ONNX export failed: %s", exc)

        return ""

    def export_metadata(self, model: Any, path: str, metadata: dict) -> str:
        """Save a model card JSON file."""
        from datetime import datetime

        card = {
            "name": metadata.get("name", type(model).__name__),
            "version": metadata.get("version", "1.0.0"),
            "created_at": datetime.utcnow().isoformat(),
            "metrics": metadata.get("metrics", {}),
            "feature_names": metadata.get("feature_names", []),
            "input_schema": {
                "type": "array",
                "items": {"type": "number"},
                "description": "Numeric feature vector",
            },
            "output_schema": {
                "type": "object",
                "properties": {
                    "is_viral": {"type": "boolean"},
                    "viral_probability": {"type": "number", "minimum": 0, "maximum": 1},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
        }

        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(card, f, indent=2, default=str)
        log.info("Metadata JSON saved to %s", p)
        return str(p)

    def test_inference(self, model_path: str, n_samples: int = 100) -> LatencyResult:
        """Load model and measure inference latency (ms) over n_samples."""
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        # Determine input dimensionality
        n_features = 20  # fallback
        if hasattr(model, "n_features_in_"):
            n_features = model.n_features_in_
        elif hasattr(model, "feature_importances_"):
            n_features = len(model.feature_importances_)

        X = np.random.rand(n_samples, n_features).astype(np.float32)

        latencies_ms: list[float] = []
        for i in range(n_samples):
            t0 = time.perf_counter()
            if hasattr(model, "predict_proba"):
                model.predict_proba(X[i : i + 1])
            else:
                model.predict(X[i : i + 1])
            latencies_ms.append((time.perf_counter() - t0) * 1000)

        arr = np.array(latencies_ms)
        return LatencyResult(
            n_samples=n_samples,
            p50_ms=float(np.percentile(arr, 50)),
            p95_ms=float(np.percentile(arr, 95)),
            p99_ms=float(np.percentile(arr, 99)),
            mean_ms=float(arr.mean()),
        )


# ---------------------------------------------------------------------------
# Inference wrapper
# ---------------------------------------------------------------------------


class InferenceWrapper:
    """Production-ready inference wrapper with preprocessing and validation."""

    def __init__(self, model_path: str, preprocessor_path: str) -> None:
        with open(model_path, "rb") as f:
            payload = pickle.load(f)
        self.model = payload if not isinstance(payload, dict) else payload.get("model", payload)
        self.model_version = Path(model_path).stem

        with open(preprocessor_path, "rb") as f:
            preprocessor = pickle.load(f)
        self.scaler = preprocessor.get("scaler")
        self.imputer = preprocessor.get("imputer")
        self.encoders = preprocessor.get("encoders", {})

    def predict(self, features: dict) -> PredictionResult:
        """Validate input, preprocess, run model, return PredictionResult."""
        t0 = time.perf_counter()
        entity_id = int(features.get("entity_id", 0))

        X = self._preprocess_single(features)

        if hasattr(self.model, "predict_proba"):
            prob = float(self.model.predict_proba(X)[0, 1])
        else:
            import torch

            if isinstance(self.model, torch.nn.Module):
                self.model.eval()
                with torch.no_grad():
                    prob = float(self.model(torch.tensor(X, dtype=torch.float32)).item())
            else:
                prob = float(self.model.predict(X)[0])

        latency_ms = (time.perf_counter() - t0) * 1000

        return PredictionResult(
            entity_id=entity_id,
            is_viral=prob >= 0.5,
            viral_probability=prob,
            confidence=min(1.0, abs(prob - 0.5) * 2),
            model_version=self.model_version,
            latency_ms=latency_ms,
        )

    def predict_batch(self, records: list[dict]) -> list[PredictionResult]:
        """Run batch inference over a list of feature dicts."""
        return [self.predict(r) for r in records]

    def _preprocess_single(self, features: dict) -> np.ndarray:
        """Convert feature dict to scaled numpy array."""
        exclude = {"id", "entity_id", "entity_type", "computed_at", "is_viral"}
        keys = [k for k in features if k not in exclude]

        row = np.array([[float(features.get(k, 0.0)) for k in keys]], dtype=np.float32)

        if self.imputer is not None:
            try:
                row = self.imputer.transform(row)
            except Exception:
                pass

        if self.scaler is not None:
            try:
                row = self.scaler.transform(row)
            except Exception:
                pass

        return row


# ---------------------------------------------------------------------------
# Export pipeline
# ---------------------------------------------------------------------------


class ExportPipeline:
    """Exports best trained model for production deployment."""

    def run(self, cfg: DictConfig) -> None:
        log.info("=== Export Pipeline ===")

        checkpoints_dir = Path(cfg.paths.checkpoints_dir)
        processed_dir = Path(cfg.paths.processed_dir)
        exports_dir = Path(cfg.paths.exports_dir)
        exports_dir.mkdir(parents=True, exist_ok=True)

        version = cfg.project.version.replace(".", "_")
        exporter = ModelExporter()

        # 1. Find best checkpoint -------------------------------------------
        ckpt_files = list(checkpoints_dir.glob("*_best.pkl"))
        if not ckpt_files:
            log.error("No checkpoints found in %s", checkpoints_dir)
            return

        # Pick the one with highest val_auroc from sidecar metadata
        best_ckpt, best_auroc = ckpt_files[0], -1.0
        for ckpt in ckpt_files:
            sidecar = ckpt.with_suffix(".json")
            if sidecar.exists():
                try:
                    with open(sidecar) as f:
                        meta = json.load(f)
                    auroc = float(meta.get("val_auroc", 0.0))
                    if auroc > best_auroc:
                        best_auroc, best_ckpt = auroc, ckpt
                except Exception:
                    pass

        log.info("Best checkpoint: %s  (val_auroc=%.4f)", best_ckpt.name, best_auroc)

        with open(best_ckpt, "rb") as f:
            payload = pickle.load(f)
        model = payload if not isinstance(payload, dict) else payload.get("model", payload)
        metadata_in = payload.get("metadata", {}) if isinstance(payload, dict) else {}
        feature_cols = metadata_in.get("feature_cols", [])

        # 2. Load preprocessor -----------------------------------------------
        preprocessor_path = processed_dir / "preprocessor.pkl"

        # 3. Export pickle ---------------------------------------------------
        pkl_path = str(exports_dir / f"model_v{version}.pkl")
        export_meta = {
            "name": "viral-music-predictor",
            "version": cfg.project.version,
            "model_type": metadata_in.get("model_type", "unknown"),
            "val_auroc": best_auroc,
            "feature_names": feature_cols,
            "metrics": {"val_auroc": best_auroc},
        }
        exporter.export_pickle(model, pkl_path, export_meta)

        # 4. Export ONNX -----------------------------------------------------
        if feature_cols:
            dummy = np.random.rand(1, len(feature_cols)).astype(np.float32)
            onnx_path = str(exports_dir / f"model_v{version}.onnx")
            exporter.export_onnx(model, onnx_path, dummy)

        # 5. Export metadata JSON -------------------------------------------
        meta_path = str(exports_dir / f"model_v{version}_card.json")
        exporter.export_metadata(model, meta_path, export_meta)

        # 6. Latency test ----------------------------------------------------
        latency = exporter.test_inference(pkl_path, n_samples=100)
        log.info(
            "Latency — p50: %.2fms  p95: %.2fms  p99: %.2fms",
            latency.p50_ms,
            latency.p95_ms,
            latency.p99_ms,
        )

        print("\n=== Inference Latency Report ===")
        print(f"  Samples : {latency.n_samples}")
        print(f"  Mean    : {latency.mean_ms:.2f} ms")
        print(f"  p50     : {latency.p50_ms:.2f} ms")
        print(f"  p95     : {latency.p95_ms:.2f} ms")
        print(f"  p99     : {latency.p99_ms:.2f} ms")

        # 7. Log to MLflow ---------------------------------------------------
        try:
            import mlflow

            mlflow.set_tracking_uri(cfg.registry.tracking_uri)
            mlflow.set_experiment(cfg.registry.experiment_name)
            with mlflow.start_run(run_name="export"):
                mlflow.log_metrics(
                    {
                        "latency_p50_ms": latency.p50_ms,
                        "latency_p95_ms": latency.p95_ms,
                        "latency_p99_ms": latency.p99_ms,
                    }
                )
                for artifact in exports_dir.iterdir():
                    mlflow.log_artifact(str(artifact))
        except Exception as exc:
            log.warning("MLflow logging skipped: %s", exc)

        log.info("=== Export Pipeline Complete ===")


def main(cfg=None) -> None:
    ExportPipeline().run(cfg)


if __name__ == "__main__":
    if hydra is not None:
        import functools
        hydra.main(config_path="../conf", config_name="config", version_base=None)(main)()
    else:
        main()
