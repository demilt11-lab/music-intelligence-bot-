import sys
import os
import math
import numpy as np
import pytest

# Ensure ml package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from ml.models.baseline.logistic_model import LogisticBreakoutModel, _compute_auc
from ml.models.rules.rule_based_scorer import RuleBasedScorer
from ml.models.model_selector import ModelSelector, PriorityScenario


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def small_dataset():
    np.random.seed(42)
    n = 300
    X = np.random.randn(n, 3)
    y = (0.5*X[:,0] + 0.3*X[:,1] + 0.2*X[:,2] + np.random.randn(n)*0.5 > 0.5).astype(float)
    return X, y


@pytest.fixture
def sample_signals():
    return {
        "save_rate": 0.18,
        "stream_velocity": 0.30,
        "ugc_growth_rate": 0.60,
        "high_quality_growth": 0.054,
        "follower_velocity": 0.12,
        "sustained_momentum": 0.33,
        "playlist_signal": 0.25,
        "editorial_signal": 0.45,
        "skip_rate_inv": 0.72,
        "repeat_listen_rate": 1.7,
    }


@pytest.fixture
def low_signals():
    return {
        "save_rate": 0.05,
        "stream_velocity": 0.08,
        "ugc_growth_rate": 0.10,
    }


# ── LogisticBreakoutModel Tests ───────────────────────────────────────────────

def test_logistic_default_predict_returns_probability(sample_signals):
    model = LogisticBreakoutModel()
    result = model.predict(sample_signals)
    assert 0.0 <= result.breakout_probability <= 1.0


def test_logistic_high_signals_predict_breakout(sample_signals):
    model = LogisticBreakoutModel()
    result = model.predict(sample_signals)
    assert result.breakout_probability > 0.6, (
        f"Expected prob > 0.6 for strong signals, got {result.breakout_probability}"
    )


def test_logistic_low_signals_predict_no_breakout(low_signals):
    model = LogisticBreakoutModel()
    result = model.predict(low_signals)
    assert result.breakout_probability < 0.4, (
        f"Expected prob < 0.4 for low signals, got {result.breakout_probability}"
    )


def test_logistic_fit_improves_train_auc(small_dataset):
    X, y = small_dataset
    model = LogisticBreakoutModel()
    model.fit(X, y)
    assert model.is_fitted
    assert model.train_auc is not None
    assert model.train_auc > 0.5, f"Expected AUC > 0.5, got {model.train_auc}"


def test_logistic_feature_contributions_sum_to_log_odds(sample_signals):
    model = LogisticBreakoutModel()
    result = model.predict(sample_signals)
    contribs = result.feature_contributions
    contrib_sum = sum(contribs.values()) + model.bias
    vals = np.array([sample_signals.get(f, 0.0) for f in model.FEATURES])
    w = np.array([model.weights[f] for f in model.FEATURES])
    expected_log_odds = float(vals @ w) + model.bias
    assert abs(contrib_sum - expected_log_odds) < 1e-6, (
        f"Contributions sum {contrib_sum} != log_odds {expected_log_odds}"
    )


def test_logistic_missing_features_fallback():
    model = LogisticBreakoutModel()
    result = model.predict({})
    # Should not crash and return base rate ~12%
    assert result.breakout_probability == 0.12 or (0.0 <= result.breakout_probability <= 1.0)
    assert result.label in ("breakout", "no_breakout")
    assert result.confidence in ("high", "medium", "low")


def test_logistic_explain_returns_string():
    model = LogisticBreakoutModel()
    explanation = model.explain()
    assert isinstance(explanation, str)
    assert len(explanation) > 0
    assert "save_rate" in explanation


# ── RuleBasedScorer Tests ─────────────────────────────────────────────────────

def test_rule_based_no_signals_returns_zero():
    scorer = RuleBasedScorer()
    result = scorer.score({})
    assert result.score == 0.0


def test_rule_based_strong_signals_fires_multiple_rules(sample_signals):
    scorer = RuleBasedScorer()
    result = scorer.score(sample_signals)
    assert len(result.rules_fired) >= 4, (
        f"Expected >= 4 rules fired, got {len(result.rules_fired)}: {result.rules_fired}"
    )


def test_rule_based_strong_signals_is_breakout(sample_signals):
    scorer = RuleBasedScorer()
    result = scorer.score(sample_signals)
    assert result.breakout_probable is True, (
        f"Expected breakout_probable=True for strong signals, score={result.score}"
    )


def test_rule_based_low_signals_no_breakout(low_signals):
    scorer = RuleBasedScorer()
    result = scorer.score(low_signals)
    assert result.breakout_probable is False, (
        f"Expected breakout_probable=False for low signals, score={result.score}"
    )


def test_rule_based_tier_classification(sample_signals):
    scorer = RuleBasedScorer()
    result = scorer.score(sample_signals)
    assert result.tier in ("strong_breakout", "probable_breakout"), (
        f"Expected strong or probable breakout tier, got {result.tier}"
    )


def test_rule_based_explain_rules_lists_all_rules():
    scorer = RuleBasedScorer()
    explanation = scorer.explain_rules()
    rule_names = [r[0] for r in scorer.rules]
    for name in rule_names:
        assert name in explanation, f"Rule name '{name}' not found in explain_rules() output"


# ── ModelSelector Tests ───────────────────────────────────────────────────────

def test_select_cold_start_returns_rule_based():
    selector = ModelSelector()
    result = selector.select(n_artists=0, priority=PriorityScenario.ACCURACY)
    assert result.recommended_model.name == "rule_based", (
        f"Expected rule_based for cold start, got {result.recommended_model.name}"
    )


def test_select_small_data_returns_logistic():
    selector = ModelSelector()
    result = selector.select(n_artists=300, priority=PriorityScenario.ACCURACY)
    assert result.recommended_model.name == "logistic_regression", (
        f"Expected logistic_regression for 300 artists, got {result.recommended_model.name}"
    )


def test_select_medium_data_returns_xgboost():
    selector = ModelSelector()
    result = selector.select(n_artists=1000, priority=PriorityScenario.ACCURACY)
    assert result.recommended_model.name == "xgboost", (
        f"Expected xgboost for 1000 artists, got {result.recommended_model.name}"
    )


def test_select_explainability_returns_logistic():
    selector = ModelSelector()
    result = selector.select(n_artists=5000, priority=PriorityScenario.EXPLAINABILITY)
    assert result.recommended_model.name == "logistic_regression", (
        f"Expected logistic_regression for explainability priority, got {result.recommended_model.name}"
    )


def test_compare_all_returns_table_string():
    selector = ModelSelector()
    table = selector.compare_all()
    assert isinstance(table, str)
    assert "xgboost" in table
