"""Tests for the A&R reasoning engine."""
import pytest
from ml.reasoning.engine import ARReasoningEngine
from ml.reasoning.types import BreakoutVerdict, SignalHealth, EvidenceType
from ml.reasoning.contradiction_detector import detect_contradictions
from ml.reasoning.assumption_tester import test_all_assumptions as run_assumption_tests
from ml.reasoning.hypothesis_engine import build_hypotheses, select_verdict
from ml.reasoning.subproblems import (
    evaluate_early_momentum, evaluate_organic_vs_artificial,
    evaluate_platform_momentum, evaluate_momentum_persistence,
    evaluate_infrastructure,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def breakout_signals():
    return {
        "stream_velocity": 0.65, "tiktok_growth": 0.78, "save_rate": 0.32,
        "follower_velocity": 0.28, "chart_momentum": 0.45, "playlist_signal": 0.35,
        "radio_spike": 0.20, "skip_rate": 0.22, "listener_follower_conversion": 0.08,
        "organic_score": 0.58, "pre_save_normalized": 0.15,
    }


@pytest.fixture
def plateau_signals():
    return {
        "stream_velocity": 0.15, "tiktok_growth": 0.72, "save_rate": 0.06,
        "follower_velocity": 0.08, "chart_momentum": 0.12, "playlist_signal": 0.05,
        "radio_spike": 0.02, "skip_rate": 0.45, "listener_follower_conversion": 0.01,
        "organic_score": 0.12,
    }


@pytest.fixture
def artificial_signals():
    return {
        "stream_velocity": 0.55, "tiktok_growth": 0.82, "save_rate": 0.04,
        "follower_velocity": 0.48, "chart_momentum": 0.71, "playlist_signal": 0.08,
        "radio_spike": 0.05, "skip_rate": 0.68, "listener_follower_conversion": 0.008,
        "organic_score": 0.08,
    }


@pytest.fixture
def sparse_signals():
    return {
        "stream_velocity": 0.30, "tiktok_growth": None, "save_rate": None,
        "follower_velocity": None, "chart_momentum": None,
    }


@pytest.fixture
def engine():
    return ARReasoningEngine()


# ---------------------------------------------------------------------------
# Verdict tests
# ---------------------------------------------------------------------------

def test_breakout_verdict(engine, breakout_signals):
    result = engine.reason(1, "Test Artist", breakout_signals)
    assert result.verdict == BreakoutVerdict.BREAKOUT
    assert result.confidence_pct >= 60


def test_plateau_verdict(engine, plateau_signals):
    result = engine.reason(2, "Plateau Artist", plateau_signals)
    assert result.verdict == BreakoutVerdict.PLATEAU


def test_artificial_verdict(engine, artificial_signals):
    result = engine.reason(3, "Fake Artist", artificial_signals)
    assert result.verdict == BreakoutVerdict.ARTIFICIAL


def test_sparse_data_returns_unknown(engine, sparse_signals):
    result = engine.reason(4, "Sparse Artist", sparse_signals)
    assert result.verdict in (BreakoutVerdict.UNKNOWN, BreakoutVerdict.EMERGING)
    assert result.confidence_pct <= 40


# ---------------------------------------------------------------------------
# Contradiction detection tests
# ---------------------------------------------------------------------------

def test_fake_viral_contradiction_detected(plateau_signals):
    contradictions = detect_contradictions(plateau_signals)
    types = [c.contradiction_type for c in contradictions]
    assert "fake_viral" in types


def test_algorithmic_push_detected(artificial_signals):
    contradictions = detect_contradictions(artificial_signals)
    types = [c.contradiction_type for c in contradictions]
    assert "algorithmic_push" in types


# ---------------------------------------------------------------------------
# Assumption tests
# ---------------------------------------------------------------------------

def test_assumption_tiktok_precedes_streaming(breakout_signals):
    tests = run_assumption_tests(breakout_signals)
    tiktok_test = next(
        t for t in tests if "TikTok" in t.assumption or "tiktok" in t.assumption.lower()
    )
    assert tiktok_test.result == "supported"


def test_assumption_save_rate_committed(breakout_signals):
    tests = run_assumption_tests(breakout_signals)
    save_test = next(t for t in tests if "Save rate" in t.assumption or "save" in t.assumption.lower())
    assert save_test.result == "supported"


def test_assumption_save_rate_violated(plateau_signals):
    tests = run_assumption_tests(plateau_signals)
    save_test = next(t for t in tests if "Save rate" in t.assumption or "save" in t.assumption.lower())
    assert save_test.result == "violated"


# ---------------------------------------------------------------------------
# Missing data tests
# ---------------------------------------------------------------------------

def test_missing_tiktok_flagged(engine, sparse_signals):
    result = engine.reason(5, "Sparse Artist", sparse_signals)
    # tiktok_growth is None in sparse_signals — must appear in missing_data
    all_missing_text = " ".join(result.missing_data)
    assert "tiktok_growth" in all_missing_text


# ---------------------------------------------------------------------------
# Decision path tests
# ---------------------------------------------------------------------------

def test_decision_path_is_ordered_list(engine, breakout_signals):
    result = engine.reason(6, "Breakout Artist", breakout_signals)
    assert isinstance(result.decision_path, list)
    assert len(result.decision_path) >= 5
    assert all(isinstance(s, str) and len(s) > 0 for s in result.decision_path)


# ---------------------------------------------------------------------------
# Evidence separation tests
# ---------------------------------------------------------------------------

def test_facts_vs_inferences_separation(engine, breakout_signals):
    result = engine.reason(7, "Breakout Artist", breakout_signals)
    fact_signals = {e.signal for e in result.facts}
    inference_signals = {e.signal for e in result.inferences}
    # No signal should appear in both buckets
    overlap = fact_signals & inference_signals
    assert len(overlap) == 0
    # All facts have evidence_type FACT
    for e in result.facts:
        assert e.evidence_type == EvidenceType.FACT
    # All inferences have evidence_type INFERENCE
    for e in result.inferences:
        assert e.evidence_type == EvidenceType.INFERENCE


# ---------------------------------------------------------------------------
# Hypothesis tests
# ---------------------------------------------------------------------------

def test_all_hypotheses_present(engine, breakout_signals):
    result = engine.reason(8, "Breakout Artist", breakout_signals)
    assert len(result.hypotheses) == 3
    labels = {h.label for h in result.hypotheses}
    assert labels == {"a", "b", "c"}


def test_posteriors_sum_to_one(engine, breakout_signals):
    result = engine.reason(9, "Breakout Artist", breakout_signals)
    total = sum(h.posterior for h in result.hypotheses)
    assert abs(total - 1.0) < 0.01


# ---------------------------------------------------------------------------
# No-hallucination tests
# ---------------------------------------------------------------------------

def test_no_hallucination_on_missing(engine, sparse_signals):
    result = engine.reason(10, "Sparse Artist", sparse_signals)
    # Facts should only contain signals with non-None values
    for fact in result.facts:
        assert fact.value is not None, (
            f"Fact for '{fact.signal}' has None value — hallucinated fact detected"
        )


# ---------------------------------------------------------------------------
# Signal health classification tests
# ---------------------------------------------------------------------------

def test_signal_health_classification(engine):
    signals = {
        "tiktok_growth": 0.60,
        "stream_velocity": 0.30,
    }
    # All other signals absent
    result = engine.reason(11, "Health Test Artist", signals)
    assert result.signal_health["save_rate"] == SignalHealth.MISSING
    assert result.signal_health["chart_momentum"] == SignalHealth.MISSING


def test_signal_health_stale(engine):
    signals = {"tiktok_growth": 0.55, "stream_velocity": 0.30}
    # tiktok TTL is 6 hours; supply age of 10 hours → STALE
    result = engine.reason(
        12, "Stale Signal Artist", signals,
        signal_ages_hours={"tiktok_growth": 10.0},
    )
    assert result.signal_health["tiktok_growth"] == SignalHealth.STALE


def test_signal_health_suspect(engine):
    signals = {"tiktok_growth": 0.55, "stream_velocity": 0.30}
    result = engine.reason(
        13, "Suspect Signal Artist", signals,
        signal_sources={"tiktok_growth": "tiktok_unofficial_scrape"},
    )
    assert result.signal_health["tiktok_growth"] == SignalHealth.SUSPECT


# ---------------------------------------------------------------------------
# High confidence requires data
# ---------------------------------------------------------------------------

def test_high_confidence_requires_data(engine, sparse_signals):
    result = engine.reason(14, "Sparse Artist", sparse_signals)
    assert result.confidence_pct <= 40
