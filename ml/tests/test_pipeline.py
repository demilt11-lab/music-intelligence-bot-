"""Tests for ML training pipeline components."""
import json
import pickle
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest
import torch
import torch.nn as nn


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_trajectory_df(n: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(0)
    return pd.DataFrame(
        {
            "id": np.arange(n),
            "entity_type": ["track"] * n,
            "entity_id": rng.integers(1, 99999, n),
            "stream_velocity": rng.uniform(0, 1, n),
            "tiktok_growth": rng.uniform(0, 1, n),
            "chart_momentum": rng.uniform(0, 1, n),
            "playlist_signal": rng.uniform(0, 1, n),
            "radio_spike": rng.uniform(0, 1, n),
            "momentum": rng.uniform(0, 1, n),
            "breakout_prob": rng.uniform(0, 1, n),
            "virality_score": rng.uniform(0, 1, n),
            "peak_score_estimate": rng.uniform(0, 100, n),
            "confidence": rng.uniform(0, 1, n),
            "computed_at": ["2024-03-15T12:00:00"] * n,
        }
    )


# ---------------------------------------------------------------------------
# FeatureEngineer tests
# ---------------------------------------------------------------------------


def test_feature_engineer_adds_columns():
    from ml.pipeline.data_prep import FeatureEngineer

    df = _make_trajectory_df(50)
    out = FeatureEngineer().fit_transform(df)

    expected = [
        "is_viral",
        "high_momentum",
        "score_product",
        "confidence_weighted_score",
        "breakout_momentum_ratio",
        "dow_sin",
        "dow_cos",
        "month_sin",
        "month_cos",
    ]
    for col in expected:
        assert col in out.columns, f"Missing column: {col}"


def test_feature_engineer_cyclic_encoding():
    """sin²(θ) + cos²(θ) should equal 1 for all rows."""
    from ml.pipeline.data_prep import FeatureEngineer

    df = _make_trajectory_df(100)
    out = FeatureEngineer().fit_transform(df)

    np.testing.assert_allclose(
        out["dow_sin"] ** 2 + out["dow_cos"] ** 2,
        np.ones(len(out)),
        atol=1e-6,
        err_msg="dow cyclic encoding does not satisfy sin²+cos²=1",
    )
    np.testing.assert_allclose(
        out["month_sin"] ** 2 + out["month_cos"] ** 2,
        np.ones(len(out)),
        atol=1e-6,
        err_msg="month cyclic encoding does not satisfy sin²+cos²=1",
    )


# ---------------------------------------------------------------------------
# DataValidator tests
# ---------------------------------------------------------------------------


def _make_mock_cfg(min_rows: int = 100) -> MagicMock:
    cfg = MagicMock()
    cfg.data.validation.min_rows = min_rows
    cfg.data.validation.required_columns = ["momentum", "breakout_prob", "virality_score", "confidence"]
    return cfg


def test_data_validator_min_rows():
    from ml.pipeline.data_prep import DataValidator

    df = _make_trajectory_df(10)  # too small
    cfg = _make_mock_cfg(min_rows=100)
    result = DataValidator().validate(df, cfg)

    assert not result.valid
    assert any("rows" in e for e in result.errors)


def test_data_validator_required_columns():
    from ml.pipeline.data_prep import DataValidator

    df = _make_trajectory_df(200).drop(columns=["momentum"])
    cfg = _make_mock_cfg(min_rows=100)
    result = DataValidator().validate(df, cfg)

    assert not result.valid
    assert any("momentum" in e for e in result.errors)


# ---------------------------------------------------------------------------
# Synthetic data test
# ---------------------------------------------------------------------------


def test_synthetic_data_generation():
    from ml.pipeline.data_prep import generate_synthetic_data

    df = generate_synthetic_data(n_rows=2000, seed=42)

    assert len(df) == 2000
    required = [
        "id", "entity_type", "entity_id", "momentum",
        "breakout_prob", "virality_score", "confidence", "computed_at",
    ]
    for col in required:
        assert col in df.columns, f"Missing column: {col}"


# ---------------------------------------------------------------------------
# ModelFactory tests
# ---------------------------------------------------------------------------


def _make_model_cfg(model_type: str) -> MagicMock:
    cfg = MagicMock()
    cfg.model.type = model_type
    cfg.model.get = lambda key, default=None: {
        "n_estimators": 100,
        "max_depth": 4,
        "learning_rate": 0.1,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 1,
        "gamma": 0.0,
        "reg_alpha": 0.0,
        "reg_lambda": 1.0,
        "scale_pos_weight": 1.0,
        "early_stopping_rounds": 10,
        "hidden_dims": [64, 32],
        "dropout": 0.1,
        "batch_norm": False,
    }.get(key, default)
    return cfg


def test_model_factory_xgboost():
    pytest.importorskip("xgboost")
    from ml.pipeline.train import ModelFactory
    from xgboost import XGBClassifier

    cfg = _make_model_cfg("xgboost")
    model = ModelFactory.create(cfg)
    assert isinstance(model, XGBClassifier)


def test_model_factory_neural_net():
    from ml.pipeline.train import ModelFactory, _MLPFactory

    cfg = _make_model_cfg("neural_net")
    factory = ModelFactory.create(cfg)
    assert isinstance(factory, _MLPFactory)
    mlp = factory.build(input_dim=10)
    assert isinstance(mlp, nn.Module)


# ---------------------------------------------------------------------------
# InferenceWrapper tests
# ---------------------------------------------------------------------------


def _make_mock_sklearn_model(n_features: int = 5) -> MagicMock:
    model = MagicMock()
    model.predict_proba = MagicMock(
        return_value=np.array([[0.3, 0.7]])
    )
    model.n_features_in_ = n_features
    return model


def test_inference_wrapper_predict(tmp_path: Path):
    """InferenceWrapper.predict should return a valid PredictionResult."""
    import cloudpickle
    from ml.pipeline.export import InferenceWrapper

    # Write a mock model as cloudpickle
    model = _make_mock_sklearn_model(n_features=3)
    model_path = tmp_path / "model.pkl"
    with open(model_path, "wb") as f:
        cloudpickle.dump(model, f)

    # Write a mock preprocessor
    preprocessor_path = tmp_path / "preprocessor.pkl"
    preprocessor = {"scaler": None, "imputer": None, "encoders": {}}
    with open(preprocessor_path, "wb") as f:
        pickle.dump(preprocessor, f)

    wrapper = InferenceWrapper(str(model_path), str(preprocessor_path))
    result = wrapper.predict(
        {"entity_id": 42, "momentum": 0.5, "breakout_prob": 0.3, "virality_score": 0.6}
    )

    assert result.entity_id == 42
    assert 0.0 <= result.viral_probability <= 1.0
    assert isinstance(result.is_viral, bool)
    assert result.latency_ms >= 0.0


# ---------------------------------------------------------------------------
# PredictionResult validation
# ---------------------------------------------------------------------------


def test_prediction_result_validation():
    """Pydantic should reject probability values outside [0, 1]."""
    from ml.pipeline.export import PredictionResult

    # Valid
    r = PredictionResult(
        entity_id=1,
        is_viral=True,
        viral_probability=0.85,
        confidence=0.9,
        model_version="v1",
        latency_ms=2.5,
    )
    assert r.viral_probability == 0.85

    # Values outside [0, 1] are clamped by the validator
    r2 = PredictionResult(
        entity_id=2,
        is_viral=False,
        viral_probability=1.5,  # will be clamped to 1.0
        confidence=-0.1,  # will be clamped to 0.0
        model_version="v1",
        latency_ms=1.0,
    )
    assert r2.viral_probability == 1.0
    assert r2.confidence == 0.0


# ---------------------------------------------------------------------------
# Export metadata test
# ---------------------------------------------------------------------------


def test_export_metadata(tmp_path: Path):
    from ml.pipeline.export import ModelExporter

    model = MagicMock()
    meta = {
        "name": "test-model",
        "version": "1.0.0",
        "metrics": {"auroc": 0.87},
        "feature_names": ["momentum", "breakout_prob"],
    }
    out_path = str(tmp_path / "card.json")
    ModelExporter().export_metadata(model, out_path, meta)

    assert Path(out_path).exists()
    with open(out_path) as f:
        card = json.load(f)

    required_fields = ["name", "version", "created_at", "metrics", "feature_names", "input_schema", "output_schema"]
    for field in required_fields:
        assert field in card, f"Missing field in metadata: {field}"


# ---------------------------------------------------------------------------
# Latency test
# ---------------------------------------------------------------------------


def test_latency_under_200ms(tmp_path: Path):
    """Mock model inference p99 should be well under 200 ms."""
    import cloudpickle
    from ml.pipeline.export import ModelExporter

    # Simple sklearn-compatible model
    from sklearn.dummy import DummyClassifier

    model = DummyClassifier(strategy="prior")
    X = np.random.rand(10, 5)
    y = np.array([0, 1] * 5)
    model.fit(X, y)

    model_path = str(tmp_path / "dummy.pkl")
    with open(model_path, "wb") as f:
        cloudpickle.dump(model, f)

    latency = ModelExporter().test_inference(model_path, n_samples=100)

    assert latency.p99_ms < 200.0, f"p99 latency {latency.p99_ms:.2f}ms exceeds 200ms threshold"
    assert latency.n_samples == 100
