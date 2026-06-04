"""
Model version store — save, load, compare, and rollback model versions.
Mirrors the Prisma ModelVersion table for Python-side access.
"""
import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ModelNotFoundError(Exception):
    """Raised when a requested model version does not exist in the store."""


class NoActiveModelError(Exception):
    """Raised when load_active() is called but no active model is registered."""


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

@dataclass
class ModelVersionMeta:
    version: str
    model_type: str
    artifact_path: str
    metrics: dict
    hyperparams: dict
    dataset_version: str
    trained_at: str
    is_active: bool
    is_baseline: bool
    train_samples: int
    train_duration_s: float


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

class ModelStore:
    """Filesystem-backed model version store with atomic registry updates."""

    REGISTRY_FILE = "registry.json"

    def __init__(self, store_dir: str = "ml/outputs/model_store") -> None:
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._registry_path = self.store_dir / self.REGISTRY_FILE
        if not self._registry_path.exists():
            self._save_registry({})

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save(self, model: Any, meta: ModelVersionMeta) -> str:
        """Serialize model with cloudpickle and register the version."""
        try:
            import cloudpickle
        except ImportError as exc:
            raise ImportError("cloudpickle required: pip install cloudpickle") from exc

        artifact_path = str(self.store_dir / f"{meta.version}.pkl")
        with open(artifact_path, "wb") as fh:
            cloudpickle.dump(model, fh)

        registry = self._load_registry()

        if meta.is_active:
            for v, entry in registry.items():
                if entry.get("is_active"):
                    entry["is_active"] = False
                    log.info("Deactivated previous active version %s", v)

        meta.artifact_path = artifact_path
        registry[meta.version] = asdict(meta)
        self._save_registry(registry)
        log.info("Saved model version %s to %s", meta.version, artifact_path)
        return artifact_path

    def load(self, version: str) -> tuple[Any, ModelVersionMeta]:
        """Load a specific model version by key."""
        registry = self._load_registry()
        if version not in registry:
            raise ModelNotFoundError(f"Version '{version}' not found in store.")
        meta = ModelVersionMeta(**registry[version])
        model = self._unpickle(meta.artifact_path)
        return model, meta

    def load_active(self) -> tuple[Any, ModelVersionMeta]:
        """Load the currently active model."""
        registry = self._load_registry()
        for entry in registry.values():
            if entry.get("is_active"):
                meta = ModelVersionMeta(**entry)
                model = self._unpickle(meta.artifact_path)
                return model, meta
        raise NoActiveModelError("No active model found in the store.")

    def load_baseline(self) -> tuple[Any, ModelVersionMeta]:
        """Load the baseline (rollback target) model."""
        registry = self._load_registry()
        for entry in registry.values():
            if entry.get("is_baseline"):
                meta = ModelVersionMeta(**entry)
                model = self._unpickle(meta.artifact_path)
                return model, meta
        raise ModelNotFoundError("No baseline model found in the store.")

    def activate(self, version: str) -> None:
        """Mark *version* as active, deactivate all others."""
        registry = self._load_registry()
        if version not in registry:
            raise ModelNotFoundError(f"Version '{version}' not found.")
        for v, entry in registry.items():
            entry["is_active"] = v == version
        self._save_registry(registry)
        log.info("Activated model version %s", version)

    def set_baseline(self, version: str) -> None:
        """Mark *version* as the rollback baseline, clear others."""
        registry = self._load_registry()
        if version not in registry:
            raise ModelNotFoundError(f"Version '{version}' not found.")
        for v, entry in registry.items():
            entry["is_baseline"] = v == version
        self._save_registry(registry)
        log.info("Set baseline model version to %s", version)

    def rollback(self) -> ModelVersionMeta:
        """Restore baseline as active. Returns meta of restored version."""
        model, meta = self.load_baseline()
        self.activate(meta.version)
        log.warning("Rolled back to baseline version %s", meta.version)
        return meta

    def list_versions(self) -> list[ModelVersionMeta]:
        """Return all versions sorted by trained_at descending."""
        registry = self._load_registry()
        metas = [ModelVersionMeta(**entry) for entry in registry.values()]
        return sorted(metas, key=lambda m: m.trained_at, reverse=True)

    def compare(self, version_a: str, version_b: str) -> dict:
        """Return metric deltas: {metric: (val_a, val_b, delta)}."""
        registry = self._load_registry()
        if version_a not in registry:
            raise ModelNotFoundError(f"Version '{version_a}' not found.")
        if version_b not in registry:
            raise ModelNotFoundError(f"Version '{version_b}' not found.")

        metrics_a = registry[version_a].get("metrics", {})
        metrics_b = registry[version_b].get("metrics", {})
        all_keys = set(metrics_a) | set(metrics_b)

        result = {}
        for key in all_keys:
            val_a = metrics_a.get(key, float("nan"))
            val_b = metrics_b.get(key, float("nan"))
            try:
                delta = float(val_b) - float(val_a)
            except (TypeError, ValueError):
                delta = float("nan")
            result[key] = (val_a, val_b, delta)
        return result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_registry(self) -> dict:
        try:
            with open(self._registry_path, "r") as fh:
                return json.load(fh)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_registry(self, data: dict) -> None:
        """Atomic write via temp file + rename."""
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=self.store_dir, prefix="registry_", suffix=".tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w") as fh:
                json.dump(data, fh, indent=2)
            os.replace(tmp_path, self._registry_path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    @staticmethod
    def _unpickle(artifact_path: str) -> Any:
        try:
            import cloudpickle as pickle_mod
        except ImportError:
            import pickle as pickle_mod  # type: ignore[no-redef]
        with open(artifact_path, "rb") as fh:
            return pickle_mod.load(fh)
