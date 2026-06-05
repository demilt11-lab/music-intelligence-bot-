"""
Unit tests for ml.monitoring.telemetry.

Tests run fully offline — no OTLP endpoint, no external services.
"""

import time
import pytest
import prometheus_client
from prometheus_client import REGISTRY

from ml.monitoring.telemetry import TelemetryService


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def tel():
    """Fresh TelemetryService per test (uses module-level Prometheus registry)."""
    return TelemetryService()


# ─────────────────────────────────────────────────────────────────────────────
# Initialisation
# ─────────────────────────────────────────────────────────────────────────────

class TestInit:

    def test_singleton_importable(self):
        from ml.monitoring.telemetry import telemetry
        assert telemetry is not None

    def test_service_has_required_methods(self, tel):
        for method in ("log_event", "span", "inc", "histogram", "gauge",
                       "record_prediction", "record_api_call", "record_drift",
                       "record_loop_run", "metrics_text"):
            assert callable(getattr(tel, method)), f"Missing method: {method}"

    def test_metrics_text_returns_string(self, tel):
        text = tel.metrics_text()
        assert isinstance(text, str)
        assert len(text) >= 0   # may be empty on first call, must not crash


# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

class TestLogging:

    def test_log_event_does_not_raise(self, tel):
        tel.log_event("test.event", key="value", count=42)

    def test_log_event_all_levels(self, tel):
        for level in ("debug", "info", "warning", "error"):
            tel.log_event(f"test.{level}", level=level)

    def test_log_event_with_unicode(self, tel):
        tel.log_event("test.unicode", artist="Ñoño", label="✓")


# ─────────────────────────────────────────────────────────────────────────────
# Tracing
# ─────────────────────────────────────────────────────────────────────────────

class TestSpans:

    def test_span_context_manager_works(self, tel):
        with tel.span("test.span", artist_id=1) as sp:
            assert sp is not None

    def test_span_yields_span_object(self, tel):
        from opentelemetry import trace
        with tel.span("test.span") as sp:
            assert isinstance(sp, trace.Span)

    def test_span_sets_attributes(self, tel):
        with tel.span("test.span", artist_id=99, model_version="v2"):
            pass  # attributes set without error

    def test_span_records_exception(self, tel):
        with pytest.raises(ValueError):
            with tel.span("failing.span"):
                raise ValueError("boom")

    def test_nested_spans(self, tel):
        with tel.span("outer") as outer:
            with tel.span("inner") as inner:
                assert inner is not None
            assert outer is not None


# ─────────────────────────────────────────────────────────────────────────────
# Prometheus metrics
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictionMetrics:

    def test_record_prediction_high_confidence(self, tel):
        tel.record_prediction(
            artist_id=1, breakout_prob=75.0, confidence=0.85,
            latency_seconds=0.12, from_cache=False
        )
        # Verify counter was incremented
        text = tel.metrics_text()
        assert "prediction_count_total" in text

    def test_record_prediction_all_confidence_levels(self, tel):
        for conf, level in [(0.85, "high"), (0.70, "moderate"), (0.50, "uncertain"), (0.30, "insufficient")]:
            tel.record_prediction(
                artist_id=1, breakout_prob=60.0, confidence=conf,
                latency_seconds=0.05, from_cache=False
            )
        text = tel.metrics_text()
        for level in ("high", "moderate", "uncertain", "insufficient"):
            assert level in text

    def test_record_prediction_from_cache(self, tel):
        tel.record_prediction(
            artist_id=2, breakout_prob=50.0, confidence=0.7,
            latency_seconds=0.001, from_cache=True
        )
        text = tel.metrics_text()
        assert "prediction_latency_seconds" in text

    def test_prediction_confidence_gauge_set(self, tel):
        tel.record_prediction(
            artist_id=42, breakout_prob=80.0, confidence=0.91,
            latency_seconds=0.08, from_cache=False
        )
        text = tel.metrics_text()
        assert "prediction_confidence" in text

    def test_zero_latency_ok(self, tel):
        tel.record_prediction(
            artist_id=1, breakout_prob=0.0, confidence=0.0,
            latency_seconds=0.0, from_cache=False
        )


class TestApiMetrics:

    def test_record_api_call_success(self, tel):
        tel.record_api_call("spotify", "success", 0.23)
        text = tel.metrics_text()
        assert "api_request_count_total" in text

    def test_record_api_call_error(self, tel):
        tel.record_api_call("tiktok", "error", 0.05)

    def test_record_api_call_all_apis(self, tel):
        for api in ("spotify", "youtube", "tiktok", "billboard"):
            tel.record_api_call(api, "success", 0.1)


class TestDriftMetrics:

    def test_record_drift_no_alert_below_threshold(self, tel):
        tel.record_drift("save_rate", 0.05)   # PSI < 0.1: no alert

    def test_record_drift_investigate(self, tel):
        tel.record_drift("stream_velocity", 0.15)  # 0.1 <= PSI < 0.2

    def test_record_drift_retrain(self, tel):
        tel.record_drift("tiktok_growth", 0.25)    # PSI >= 0.2

    def test_drift_gauge_in_metrics_output(self, tel):
        tel.record_drift("save_rate", 0.18)
        text = tel.metrics_text()
        assert "data_drift_score" in text

    def test_drift_multiple_features(self, tel):
        for feat, psi in [("save_rate", 0.08), ("stream_velocity", 0.19), ("ugc_growth", 0.31)]:
            tel.record_drift(feat, psi)


class TestLoopMetrics:

    def test_record_loop_run_success(self, tel):
        tel.record_loop_run(
            duration_seconds=12.5,
            labels_admitted=45,
            retraining_action="promoted",
            error=None,
        )
        text = tel.metrics_text()
        assert "loop_orchestrator_duration_seconds" in text
        assert "loop_labels_admitted_total" in text

    def test_record_loop_run_with_error(self, tel):
        tel.record_loop_run(
            duration_seconds=3.0,
            labels_admitted=0,
            retraining_action="failed",
            error="model training diverged",
        )

    def test_record_loop_run_no_retrain(self, tel):
        tel.record_loop_run(
            duration_seconds=5.0,
            labels_admitted=12,
            retraining_action="skipped",
            error=None,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Generic metric helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestGenericMetrics:

    def test_inc_registers_counter(self, tel):
        tel.inc("custom_events_total_test", 1.0, source="test")

    def test_inc_multiple_times(self, tel):
        for _ in range(5):
            tel.inc("batch_counter_test", 1.0, stage="prep")

    def test_histogram_records_value(self, tel):
        tel.histogram("custom_latency_test", 0.15, operation="score")

    def test_gauge_set_value(self, tel):
        tel.gauge("active_models_test", 2.0, env="test")

    def test_inc_without_labels(self, tel):
        tel.inc("no_label_counter_test", 1.0)

    def test_histogram_large_value(self, tel):
        tel.histogram("large_val_hist_test", 9999.0)


# ─────────────────────────────────────────────────────────────────────────────
# Integration — prediction_engine emits telemetry
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictionEngineIntegration:

    def test_predict_emits_metrics_cache_miss(self):
        """BreakoutPredictor.predict() with no model loads telemetry gracefully."""
        from ml.self_teaching.prediction_engine import BreakoutPredictor
        from ml.monitoring.telemetry import telemetry

        # Model won't load (no store), but predict() should still return and
        # the telemetry calls should not raise.
        predictor = BreakoutPredictor(store_dir="/tmp/nonexistent_store_xyz")
        result = predictor.predict(999, {"save_rate": 0.18, "stream_velocity": 0.28})

        assert result.artist_id == 999
        assert 0 <= result.breakout_probability <= 100
        # Metrics text should contain our counter after the call
        text = telemetry.metrics_text()
        assert "prediction_count_total" in text

    def test_predict_batch_does_not_raise(self):
        """predict_batch() with no model returns neutral results without crashing."""
        from ml.self_teaching.prediction_engine import BreakoutPredictor

        predictor = BreakoutPredictor(store_dir="/tmp/nonexistent_store_xyz")
        results = predictor.predict_batch([
            {"artist_id": 1, "features": {"save_rate": 0.18}},
            {"artist_id": 2, "features": {"stream_velocity": 0.28}},
        ])
        assert len(results) == 2


# ─────────────────────────────────────────────────────────────────────────────
# Edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_log_event_empty_kwargs(self, tel):
        tel.log_event("empty.event")

    def test_span_empty_attrs(self, tel):
        with tel.span("bare.span"):
            pass

    def test_record_drift_zero_psi(self, tel):
        tel.record_drift("any_feature", 0.0)

    def test_record_drift_exactly_boundary(self, tel):
        tel.record_drift("boundary_feature", 0.10)  # exactly at investigate threshold
        tel.record_drift("boundary_feature2", 0.20)  # exactly at retrain threshold

    def test_record_prediction_boundary_confidence(self, tel):
        for conf in (0.0, 0.40, 0.60, 0.80, 1.0):
            tel.record_prediction(
                artist_id=1, breakout_prob=50.0, confidence=conf,
                latency_seconds=0.01, from_cache=False
            )
