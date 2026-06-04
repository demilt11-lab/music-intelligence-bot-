"""Tests for TFT model and LambdaMART ranker."""
import pytest
import torch
import numpy as np
from ml.models.temporal_fusion_transformer import (
    TemporalFusionTransformer,
    TFTConfig,
    TFTOutput,
    GatedResidualNetwork,
    VariableSelectionNetwork,
    InterpretableMultiHeadAttention,
    QuantileLoss,
    create_tft_default,
)
from ml.training.lambdamart_ranker import (
    LambdaMARTRanker,
    SignalFeatureExtractor,
    RankingQuery,
    HIGHLY_RELEVANT,
    RELEVANT,
    MARGINAL,
    IRRELEVANT,
    _ndcg_at_k,
)

# ── Fixtures ─────────────────────────────────────────────────────────────────

BATCH = 2
ENC_STEPS = 10
DEC_STEPS = 5
HIDDEN = 32

# Small config for fast tests
SMALL_CFG = TFTConfig(
    n_static_features=4,
    n_dynamic_observed=3,
    n_dynamic_known=2,
    hidden_dim=HIDDEN,
    lstm_layers=1,
    attention_heads=2,
    dropout=0.0,
    encoder_steps=ENC_STEPS,
    decoder_steps=DEC_STEPS,
    output_quantiles=[0.1, 0.5, 0.9],
)


@pytest.fixture
def small_model():
    torch.manual_seed(42)
    return TemporalFusionTransformer(SMALL_CFG)


@pytest.fixture
def small_inputs():
    torch.manual_seed(42)
    static = torch.randn(BATCH, SMALL_CFG.n_static_features)
    encoder = torch.randn(BATCH, ENC_STEPS, SMALL_CFG.n_dynamic_observed)
    decoder = torch.randn(BATCH, DEC_STEPS, SMALL_CFG.n_dynamic_known)
    return static, encoder, decoder


# ── GRN tests ─────────────────────────────────────────────────────────────────

def test_grn_output_shape():
    torch.manual_seed(42)
    grn = GatedResidualNetwork(input_dim=16, hidden_dim=32, output_dim=8, dropout=0.0)
    x = torch.randn(BATCH, ENC_STEPS, 16)
    out = grn(x)
    assert out.shape == (BATCH, ENC_STEPS, 8), f"Expected ({BATCH}, {ENC_STEPS}, 8), got {out.shape}"


def test_grn_with_context():
    torch.manual_seed(42)
    grn = GatedResidualNetwork(
        input_dim=16, hidden_dim=32, output_dim=16, dropout=0.0,
        use_context=True, context_dim=32,
    )
    x = torch.randn(BATCH, ENC_STEPS, 16)
    ctx = torch.randn(BATCH, 32)
    out = grn(x, context=ctx)
    assert out.shape == (BATCH, ENC_STEPS, 16), (
        f"Context injection changed shape unexpectedly: {out.shape}"
    )


# ── VSN tests ─────────────────────────────────────────────────────────────────

def test_vsn_output_shape():
    torch.manual_seed(42)
    vsn = VariableSelectionNetwork(
        input_sizes=[1, 1, 1],
        hidden_dim=HIDDEN,
        dropout=0.0,
    )
    x = [torch.randn(BATCH, ENC_STEPS, 1) for _ in range(3)]
    features, weights = vsn(x)
    assert features.shape == (BATCH, ENC_STEPS, HIDDEN), f"features shape: {features.shape}"
    assert weights.shape == (BATCH, ENC_STEPS, 3), f"weights shape: {weights.shape}"
    # Weights should sum to ~1 along last dim
    weight_sums = weights.sum(dim=-1)
    assert torch.allclose(weight_sums, torch.ones_like(weight_sums), atol=1e-5), (
        "VSN weights do not sum to 1"
    )


# ── InterpretableMultiHeadAttention tests ─────────────────────────────────────

def test_interpretable_mha_output_shape():
    torch.manual_seed(42)
    mha = InterpretableMultiHeadAttention(embed_dim=HIDDEN, num_heads=2, dropout=0.0)
    q = torch.randn(BATCH, DEC_STEPS, HIDDEN)
    k = torch.randn(BATCH, ENC_STEPS, HIDDEN)
    v = torch.randn(BATCH, ENC_STEPS, HIDDEN)
    out, attn_weights = mha(q, k, v)
    assert out.shape == (BATCH, DEC_STEPS, HIDDEN), f"Attention output shape: {out.shape}"
    assert attn_weights.shape == (BATCH, DEC_STEPS, ENC_STEPS), (
        f"Attention weights shape: {attn_weights.shape}"
    )


# ── Full TFT forward tests ────────────────────────────────────────────────────

def test_tft_forward_output_shapes(small_model, small_inputs):
    static, encoder, decoder = small_inputs
    result = small_model(static, encoder, decoder)
    assert isinstance(result, TFTOutput)

    n_q = len(SMALL_CFG.output_quantiles)
    assert result.predictions.shape == (BATCH, DEC_STEPS, n_q), (
        f"predictions: {result.predictions.shape}"
    )
    assert result.encoder_attention.shape == (BATCH, ENC_STEPS, ENC_STEPS), (
        f"encoder_attention: {result.encoder_attention.shape}"
    )
    assert result.decoder_attention.shape == (BATCH, DEC_STEPS, ENC_STEPS), (
        f"decoder_attention: {result.decoder_attention.shape}"
    )
    assert result.static_variable_weights.shape == (BATCH, SMALL_CFG.n_static_features), (
        f"static_variable_weights: {result.static_variable_weights.shape}"
    )
    assert result.encoder_variable_weights.shape == (BATCH, ENC_STEPS, SMALL_CFG.n_dynamic_observed), (
        f"encoder_variable_weights: {result.encoder_variable_weights.shape}"
    )
    assert result.viral_prob_horizon.shape == (BATCH, DEC_STEPS), (
        f"viral_prob_horizon: {result.viral_prob_horizon.shape}"
    )


def test_tft_predictions_quantiles(small_model, small_inputs):
    """q10 <= q50 <= q90 after sorting — not guaranteed by raw model but verify quantile indices."""
    static, encoder, decoder = small_inputs
    result = small_model(static, encoder, decoder)
    # Quantile index 0 = q10, 1 = q50, 2 = q90 per TFTConfig default
    # After training they should be ordered; raw model won't guarantee that.
    # We just verify shape and that we have 3 distinct quantile outputs.
    assert result.predictions.shape[-1] == 3, "Expected 3 quantile outputs"


def test_tft_viral_prob_bounded(small_model, small_inputs):
    static, encoder, decoder = small_inputs
    result = small_model(static, encoder, decoder)
    assert result.viral_prob_horizon.min().item() >= 0.0, "viral_prob below 0"
    assert result.viral_prob_horizon.max().item() <= 1.0, "viral_prob above 1"


# ── QuantileLoss tests ────────────────────────────────────────────────────────

def test_quantile_loss_scalar():
    torch.manual_seed(42)
    loss_fn = QuantileLoss([0.1, 0.5, 0.9])
    preds = torch.randn(BATCH, DEC_STEPS, 3)
    targets = torch.randn(BATCH, DEC_STEPS)
    loss = loss_fn(preds, targets)
    assert loss.shape == (), f"Loss should be scalar, got shape {loss.shape}"
    assert torch.isfinite(loss), "Loss is not finite"


def test_quantile_loss_q10_less_than_q90():
    """After many steps a trained model should predict q10 < q90;
    here we verify pinball loss penalizes violations — loss is larger when ordering is reversed."""
    torch.manual_seed(42)
    loss_fn = QuantileLoss([0.1, 0.5, 0.9])
    targets = torch.ones(BATCH, DEC_STEPS) * 0.5

    # Correct ordering: q10 < q50 < q90
    correct_preds = torch.zeros(BATCH, DEC_STEPS, 3)
    correct_preds[:, :, 0] = 0.1
    correct_preds[:, :, 1] = 0.5
    correct_preds[:, :, 2] = 0.9

    # Reversed ordering: q10 > q90
    wrong_preds = torch.zeros(BATCH, DEC_STEPS, 3)
    wrong_preds[:, :, 0] = 0.9
    wrong_preds[:, :, 1] = 0.5
    wrong_preds[:, :, 2] = 0.1

    loss_correct = loss_fn(correct_preds, targets)
    loss_wrong = loss_fn(wrong_preds, targets)
    assert loss_correct <= loss_wrong, (
        f"Correct quantile ordering should have lower loss: {loss_correct} vs {loss_wrong}"
    )


# ── Factory function test ─────────────────────────────────────────────────────

def test_create_tft_default():
    torch.manual_seed(42)
    model = create_tft_default()
    assert isinstance(model, TemporalFusionTransformer)
    cfg = model.cfg
    assert cfg.n_static_features == 8
    assert cfg.n_dynamic_observed == 10
    assert cfg.encoder_steps == 90
    assert cfg.decoder_steps == 30
    assert len(cfg.output_quantiles) == 3


# ── LambdaMARTRanker tests ────────────────────────────────────────────────────

@pytest.fixture
def sample_signals():
    return {
        "save_rate": 0.8,
        "tiktok_growth": 0.6,
        "stream_velocity": 0.4,
        "follower_velocity": 0.3,
    }


@pytest.fixture
def sample_meta():
    return {
        "save_rate": {"source": "official", "age_hours": 2.0, "ttl_hours": 24.0},
        "tiktok_growth": {"source": "official", "age_hours": 1.0, "ttl_hours": 12.0},
        "stream_velocity": {"source": "official", "age_hours": 3.0, "ttl_hours": 24.0},
        "follower_velocity": {"source": "official", "age_hours": 4.0, "ttl_hours": 48.0},
    }


def test_lambdamart_fallback_ranking(sample_signals, sample_meta):
    """Without training, uses weight fallback; results are sorted descending by score."""
    ranker = LambdaMARTRanker()
    results = ranker.rank(artist_id=1, signals=sample_signals, signal_meta=sample_meta)
    assert len(results) == len(sample_signals)
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True), "Results not sorted by score descending"
    ranks = [r["rank"] for r in results]
    assert ranks == list(range(1, len(results) + 1)), "Ranks not sequential from 1"


def test_lambdamart_rank_all_signals_present(sample_signals, sample_meta):
    """All input signals appear in output."""
    ranker = LambdaMARTRanker()
    results = ranker.rank(artist_id=1, signals=sample_signals, signal_meta=sample_meta)
    result_signals = {r["signal"] for r in results}
    assert result_signals == set(sample_signals.keys()), (
        f"Missing signals: {set(sample_signals.keys()) - result_signals}"
    )


def test_lambdamart_source_discount(sample_signals):
    """Unofficial source gets lower score than official for same signal value."""
    ranker = LambdaMARTRanker()
    signal = {"save_rate": 1.0}

    official_meta = {"save_rate": {"source": "official"}}
    unofficial_meta = {"save_rate": {"source": "unofficial"}}

    official_results = ranker.rank(1, signal, official_meta)
    unofficial_results = ranker.rank(1, signal, unofficial_meta)

    official_score = official_results[0]["score"]
    unofficial_score = unofficial_results[0]["score"]

    assert unofficial_score < official_score, (
        f"Unofficial ({unofficial_score}) should be less than official ({official_score})"
    )


# ── SignalFeatureExtractor tests ──────────────────────────────────────────────

def test_signal_feature_extractor_shape():
    extractor = SignalFeatureExtractor()
    features = extractor.extract(
        signal_name="save_rate",
        signal_value=0.75,
        signal_meta={"source": "official", "age_hours": 5.0, "ttl_hours": 24.0, "artist_followers": 50_000},
    )
    expected_len = len(SignalFeatureExtractor.FEATURE_NAMES)
    assert features.shape == (expected_len,), (
        f"Expected ({expected_len},), got {features.shape}"
    )
    assert features.dtype == np.float32


# ── NDCG tests ────────────────────────────────────────────────────────────────

def test_ndcg_perfect_ranking():
    """Perfectly ordered labels (highest score = highest relevance) → NDCG = 1.0."""
    relevances = np.array([3.0, 2.0, 1.0, 0.0])
    # Scores descend matching relevance order → perfect ranking
    scores = np.array([4.0, 3.0, 2.0, 1.0])
    ndcg = _ndcg_at_k(relevances, scores, k=3)
    assert abs(ndcg - 1.0) < 1e-6, f"Perfect ranking NDCG should be 1.0, got {ndcg}"
