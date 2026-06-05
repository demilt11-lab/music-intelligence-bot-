"""Tests for deep learning models: LSTM, TabularNN, ensemble, focal loss, dataset."""

import numpy as np
import pytest
import torch


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def batch_size() -> int:
    return 4


@pytest.fixture
def seq_len() -> int:
    return 20


@pytest.fixture
def small_records():
    """Generate a small set of SongRecords for testing."""
    from ml.data.tiktok_dataset import ViralDataSynthesizer
    synth = ViralDataSynthesizer(seed=0)
    return synth.generate(n=200, viral_rate=0.08)


# ---------------------------------------------------------------------------
# LSTM model
# ---------------------------------------------------------------------------

def test_lstm_forward_shape(batch_size, seq_len):
    from ml.models.lstm_model import LSTMConfig, LSTMViralModel
    cfg = LSTMConfig(input_dim=8, hidden_dim=32, num_layers=1, bidirectional=False)
    model = LSTMViralModel(cfg)
    x = torch.randn(batch_size, seq_len, 8)
    out = model(x)
    assert out.viral_prob.shape == (batch_size, 1), f"Expected ({batch_size}, 1), got {out.viral_prob.shape}"


def test_lstm_bidirectional(batch_size, seq_len):
    """Hidden state dim should double when bidirectional=True."""
    from ml.models.lstm_model import LSTMConfig, LSTMViralModel
    uni_cfg = LSTMConfig(hidden_dim=32, num_layers=1, bidirectional=False)
    bi_cfg = LSTMConfig(hidden_dim=32, num_layers=1, bidirectional=True)
    x = torch.randn(batch_size, seq_len, 8)
    out_uni = LSTMViralModel(uni_cfg)(x)
    out_bi = LSTMViralModel(bi_cfg)(x)
    assert out_bi.hidden.shape[-1] == 2 * out_uni.hidden.shape[-1]


def test_temporal_attention_weights_sum_to_one(batch_size, seq_len):
    """Attention weights must sum to 1 along time dimension."""
    from ml.models.lstm_model import LSTMConfig, LSTMViralModel
    cfg = LSTMConfig(hidden_dim=32, num_layers=1, use_attention=True, bidirectional=False)
    model = LSTMViralModel(cfg)
    x = torch.randn(batch_size, seq_len, 8)
    out = model(x)
    sums = out.attn_weights.sum(dim=-1)
    assert torch.allclose(sums, torch.ones(batch_size), atol=1e-5), \
        f"Attention weights do not sum to 1: {sums}"


# ---------------------------------------------------------------------------
# TabularNN
# ---------------------------------------------------------------------------

def test_tabular_nn_forward(batch_size):
    from ml.models.tabular_nn import TabularConfig, TabularNN
    cfg = TabularConfig(input_dim=64, hidden_dims=(64, 32), dropout=0.0)
    model = TabularNN(cfg)
    x = torch.randn(batch_size, 64)
    out = model(x)
    assert out.viral_prob.shape == (batch_size, 1)


def test_residual_block_identity(batch_size):
    """ResidualBlock output should differ from input (non-linear transformation)."""
    from ml.models.tabular_nn import ResidualBlock
    block = ResidualBlock(in_dim=32, out_dim=32, dropout=0.0)
    x = torch.randn(batch_size, 32)
    y = block(x)
    assert not torch.allclose(x, y), "ResidualBlock should be non-linear"


# ---------------------------------------------------------------------------
# XGBoost
# ---------------------------------------------------------------------------

def test_xgboost_fit_predict(small_records):
    try:
        from xgboost import XGBClassifier
    except ImportError:
        pytest.skip("xgboost not installed")

    from ml.models.xgboost_model import ViralXGBoost, XGBoostConfig
    from ml.training.cross_validation import CrossValidator

    records = small_records[:200]
    X = CrossValidator._extract_features(records)
    y = np.array([float(r.is_viral) for r in records])
    y_days = np.array([r.days_to_viral or 0.0 for r in records])
    y_peak = np.array([r.peak_viral_score for r in records])

    cfg = XGBoostConfig(n_estimators=10, max_depth=3)
    model = ViralXGBoost(cfg)
    model.fit(X, y, y_days, y_peak)
    pred = model.predict(X)
    assert pred.viral_prob.shape == (200,)
    assert ((pred.viral_prob >= 0) & (pred.viral_prob <= 1)).all()


# ---------------------------------------------------------------------------
# Focal loss
# ---------------------------------------------------------------------------

def test_focal_loss_gamma_zero_equals_bce():
    """FocalLoss with gamma=0, alpha=0.5 is exactly 0.5 * BCEWithLogitsLoss (alpha scales uniformly)."""
    from ml.training.focal_loss import FocalLoss
    focal = FocalLoss(alpha=0.5, gamma=0.0)
    bce = torch.nn.BCEWithLogitsLoss()
    logits = torch.randn(64)
    targets = (torch.rand(64) > 0.5).float()
    fl_val = focal(logits, targets)
    bce_val = bce(logits, targets)
    # alpha=0.5 scales all terms by 0.5, so FL == 0.5 * BCE when gamma=0
    assert abs(fl_val.item() - 0.5 * bce_val.item()) < 0.01, \
        f"FocalLoss(gamma=0) should be 0.5*BCE: {fl_val.item():.4f} vs 0.5*{bce_val.item():.4f}={0.5*bce_val.item():.4f}"


def test_asymmetric_focal_loss_forward():
    from ml.training.focal_loss import AsymmetricFocalLoss
    loss_fn = AsymmetricFocalLoss()
    logits = torch.randn(32)
    targets = (torch.rand(32) > 0.5).float()
    loss = loss_fn(logits, targets)
    assert not torch.isnan(loss), "AsymmetricFocalLoss produced NaN"
    assert loss.shape == torch.Size([])


def test_multitask_focal_loss():
    from ml.training.focal_loss import MultiTaskFocalLoss
    loss_fn = MultiTaskFocalLoss()
    B = 16
    preds = {
        "viral_logit": torch.randn(B),
        "days": torch.rand(B) * 30,
        "peak": torch.rand(B) * 100,
    }
    targets = {
        "viral": (torch.rand(B) > 0.5).float(),
        "days": torch.rand(B) * 30,
        "peak": torch.rand(B) * 100,
    }
    result = loss_fn(preds, targets)
    assert torch.isfinite(result["total"]), "MultiTaskFocalLoss total is not finite"
    assert result["total"].shape == torch.Size([])


# ---------------------------------------------------------------------------
# TikTok Dataset
# ---------------------------------------------------------------------------

def test_tiktok_dataset_item_shapes(small_records):
    from ml.data.tiktok_dataset import TikTokViralDataset
    ds = TikTokViralDataset(small_records[:10], seq_len=90, augment=False)
    item = ds[0]
    assert item["timeseries"].shape == (90, 10),  f"timeseries: {item['timeseries'].shape}"
    assert item["audio"].shape == (64,),          f"audio: {item['audio'].shape}"
    assert item["metadata"].shape == (32,),       f"metadata: {item['metadata'].shape}"
    assert item["text_tokens"].shape == (32,),    f"text_tokens: {item['text_tokens'].shape}"
    assert item["label_viral"].dtype == torch.float32
    assert item["label_days"].dtype == torch.float32
    assert item["label_peak"].dtype == torch.float32


def test_viral_synthesizer_rate():
    """Generated viral_rate should be within ±2% of target."""
    from ml.data.tiktok_dataset import ViralDataSynthesizer
    synth = ViralDataSynthesizer(seed=1)
    records = synth.generate(n=5000, viral_rate=0.08)
    actual_rate = sum(r.is_viral for r in records) / len(records)
    assert abs(actual_rate - 0.08) < 0.02, f"Viral rate {actual_rate:.3f} too far from 0.08"


def test_stratified_sampler_balance():
    """After sampling, viral fraction should be well above 0.08 baseline."""
    from ml.data.tiktok_dataset import ViralDataSynthesizer, StratifiedWeightedSampler
    synth = ViralDataSynthesizer(seed=2)
    records = synth.generate(n=1000, viral_rate=0.08)
    labels = np.array([int(r.is_viral) for r in records])
    sampler = StratifiedWeightedSampler(labels, oversample_factor=10.0)
    ws = sampler.get_sampler()
    # sample some indices
    gen = torch.Generator()
    gen.manual_seed(0)
    sampled_idx = list(torch.multinomial(
        ws.weights.float(), num_samples=500, replacement=True, generator=gen
    ).numpy())
    sampled_labels = labels[sampled_idx]
    viral_fraction = sampled_labels.mean()
    assert viral_fraction > 0.3, f"Sampled viral fraction {viral_fraction:.2f} too low"


# ---------------------------------------------------------------------------
# Ensemble
# ---------------------------------------------------------------------------

def test_ensemble_weighted_average():
    """Weighted average output should be in [0, 1]."""
    from ml.models.ensemble import EnsemblePredictor
    model_names = ["lstm", "tabular", "xgboost"]
    predictor = EnsemblePredictor(model_names)
    B = 8
    preds = {n: torch.rand(B) for n in model_names}
    avg = predictor.weighted_average(preds)
    assert avg.shape == (B,)
    assert (avg >= 0).all() and (avg <= 1).all(), "Weighted average outside [0, 1]"


# ---------------------------------------------------------------------------
# Cross-validation
# ---------------------------------------------------------------------------

def test_cv_fold_count(small_records):
    from ml.data.tiktok_dataset import TikTokViralDataset
    from ml.training.cross_validation import CrossValidator, CVConfig

    ds = TikTokViralDataset(small_records, seq_len=90)
    cfg = CVConfig(n_folds=3, models=["xgboost"])
    validator = CrossValidator(cfg)

    try:
        from xgboost import XGBClassifier
    except ImportError:
        cfg.models = ["tabular"]  # fallback to logistic proxy

    results = validator.run(ds, model_configs={})
    n_models = len(cfg.models)
    assert len(results.fold_results) == cfg.n_folds * n_models, \
        f"Expected {cfg.n_folds * n_models} FoldResults, got {len(results.fold_results)}"


# ---------------------------------------------------------------------------
# Feature importance
# ---------------------------------------------------------------------------

def test_feature_importance_sorted(small_records):
    """Importance scores in FeatureImportanceResult should be sorted descending."""
    try:
        from xgboost import XGBClassifier
    except ImportError:
        pytest.skip("xgboost not installed")

    from ml.models.xgboost_model import ViralXGBoost, XGBoostConfig
    from ml.training.cross_validation import CrossValidator
    from ml.evaluation.feature_importance import FeatureImportanceAnalyzer

    records = small_records[:200]
    X = CrossValidator._extract_features(records)
    y = np.array([float(r.is_viral) for r in records])
    y_days = np.array([r.days_to_viral or 0.0 for r in records])
    y_peak = np.array([r.peak_viral_score for r in records])

    cfg = XGBoostConfig(n_estimators=10, max_depth=3)
    model = ViralXGBoost(cfg)
    model.fit(X, y, y_days, y_peak)

    analyzer = FeatureImportanceAnalyzer()
    result = analyzer.xgboost_importance(model)
    scores = result.importance_scores
    assert (np.diff(scores) <= 1e-9).all(), "Importance scores not sorted descending"
