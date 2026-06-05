"""
Production observability for the ML pipeline.

Usage
-----
    from ml.monitoring.telemetry import telemetry

    # Structured log event
    telemetry.log_event("prediction.complete", artist_id=42, prob=0.73)

    # Timed span (context manager)
    with telemetry.span("predict", artist_id=42):
        result = predictor.predict(42, features)

    # Metrics
    telemetry.inc("prediction_count", confidence_level="high")
    telemetry.histogram("prediction_latency_ms", 120.0)
    telemetry.gauge("prediction_confidence", 0.82)

Configuration (environment variables)
--------------------------------------
    OTEL_EXPORTER_OTLP_ENDPOINT   e.g. https://otlp-gateway-prod-us-central-0.grafana.net/otlp
    OTEL_EXPORTER_OTLP_HEADERS    e.g. Authorization=Basic <base64>
    OTEL_SERVICE_NAME              default: music-ar-bot
    LOG_LEVEL                      default: INFO
    LOG_FORMAT                     json (default) | console

Dev mode (no env vars set): JSON logs to stdout, in-memory metrics, no OTLP export.
Prod mode (OTEL_EXPORTER_OTLP_ENDPOINT set): adds OTLP trace/metric export.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import sys
import time
from contextlib import contextmanager
from typing import Any, Iterator

import structlog
from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    ConsoleMetricExporter,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor,
)
import prometheus_client as prom

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SERVICE_NAME = os.environ.get("OTEL_SERVICE_NAME", "music-ar-bot")
_OTLP_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
_LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
_LOG_FORMAT = os.environ.get("LOG_FORMAT", "json").lower()
_DEV_MODE = not _OTLP_ENDPOINT


# ---------------------------------------------------------------------------
# Structlog setup
# ---------------------------------------------------------------------------

def _configure_structlog() -> None:
    level = getattr(logging, _LOG_LEVEL, logging.INFO)
    logging.basicConfig(stream=sys.stdout, level=level, format="%(message)s")

    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if _LOG_FORMAT == "console":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configure_structlog()
_log = structlog.get_logger(_SERVICE_NAME)


# ---------------------------------------------------------------------------
# OpenTelemetry setup
# ---------------------------------------------------------------------------

def _build_resource() -> Resource:
    return Resource.create({"service.name": _SERVICE_NAME})


def _build_tracer_provider() -> TracerProvider:
    provider = TracerProvider(resource=_build_resource())

    if _DEV_MODE:
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    else:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            headers: dict[str, str] = {}
            raw = os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "")
            for pair in raw.split(","):
                if "=" in pair:
                    k, _, v = pair.partition("=")
                    headers[k.strip()] = v.strip()
            exporter = OTLPSpanExporter(endpoint=_OTLP_ENDPOINT, headers=headers)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except ImportError:
            # opentelemetry-exporter-otlp not installed — fall back to console
            provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))

    otel_trace.set_tracer_provider(provider)
    return provider


def _build_meter_provider() -> MeterProvider:
    if _DEV_MODE:
        reader = PeriodicExportingMetricReader(
            ConsoleMetricExporter(),
            export_interval_millis=60_000,
        )
    else:
        try:
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            exporter = OTLPMetricExporter(endpoint=_OTLP_ENDPOINT)
            reader = PeriodicExportingMetricReader(exporter, export_interval_millis=30_000)
        except ImportError:
            reader = PeriodicExportingMetricReader(
                ConsoleMetricExporter(), export_interval_millis=60_000
            )

    provider = MeterProvider(resource=_build_resource(), metric_readers=[reader])
    otel_metrics.set_meter_provider(provider)
    return provider


# ---------------------------------------------------------------------------
# Prometheus metrics (always available, no config needed)
# ---------------------------------------------------------------------------

_PROM_PREDICTION_LATENCY = prom.Histogram(
    "prediction_latency_seconds",
    "Time spent in BreakoutPredictor.predict()",
    ["from_cache"],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)
_PROM_PREDICTION_COUNT = prom.Counter(
    "prediction_count_total",
    "Total predictions served",
    ["confidence_level"],
)
_PROM_PREDICTION_CONFIDENCE = prom.Gauge(
    "prediction_confidence",
    "Last prediction confidence score",
    ["artist_id"],
)
_PROM_API_REQUEST_COUNT = prom.Counter(
    "api_request_count_total",
    "Outbound API requests by API name",
    ["api_name", "status"],
)
_PROM_HTTP_DURATION = prom.Histogram(
    "http_request_duration_seconds",
    "HTTP request duration (TypeScript ingestion pipeline reports here)",
    ["method", "path", "status_code"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)
_PROM_DATA_DRIFT_SCORE = prom.Gauge(
    "data_drift_score",
    "PSI drift score for a feature",
    ["feature"],
)
_PROM_LOOP_DURATION = prom.Histogram(
    "loop_orchestrator_duration_seconds",
    "Time for one full LoopOrchestrator.run() cycle",
    buckets=[1, 5, 15, 30, 60, 120, 300],
)
_PROM_LOOP_LABELS_ADMITTED = prom.Counter(
    "loop_labels_admitted_total",
    "Labels admitted by the quality gate",
)
_PROM_LOOP_RETRAIN_TOTAL = prom.Counter(
    "loop_retraining_total",
    "Retraining runs triggered",
    ["action"],
)

# Generic in-memory fallback counters / histograms for spans that aren't
# covered by named Prometheus metrics.
_generic_counters: dict[str, prom.Counter] = {}
_generic_histograms: dict[str, prom.Histogram] = {}
_generic_gauges: dict[str, prom.Gauge] = {}


# ---------------------------------------------------------------------------
# TelemetryService — singleton
# ---------------------------------------------------------------------------

class TelemetryService:
    """Singleton observability service: traces, metrics, structured logs."""

    def __init__(self) -> None:
        self._tracer_provider = _build_tracer_provider()
        self._meter_provider = _build_meter_provider()
        self._tracer = otel_trace.get_tracer(_SERVICE_NAME)
        self._log = _log

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def log_event(self, event: str, level: str = "info", **kwargs: Any) -> None:
        """Emit a structured log event.

        telemetry.log_event("prediction.complete", artist_id=42, prob=0.73)
        """
        logger = getattr(self._log, level, self._log.info)
        logger(event, **kwargs)

    # ------------------------------------------------------------------
    # Tracing
    # ------------------------------------------------------------------

    @contextmanager
    def span(self, name: str, **attrs: Any) -> Iterator[otel_trace.Span]:
        """Context manager that creates an OTel span and sets attributes.

        with telemetry.span("predict", artist_id=42) as sp:
            ...
            sp.set_attribute("result.prob", 0.73)
        """
        with self._tracer.start_as_current_span(name) as sp:
            for k, v in attrs.items():
                with contextlib.suppress(Exception):
                    sp.set_attribute(k, str(v))
            try:
                yield sp
            except Exception as exc:
                sp.record_exception(exc)
                sp.set_status(otel_trace.StatusCode.ERROR, str(exc))
                raise

    # ------------------------------------------------------------------
    # Metrics helpers (Prometheus-backed)
    # ------------------------------------------------------------------

    def inc(self, name: str, by: float = 1.0, **labels: str) -> None:
        """Increment a named counter."""
        key = name
        if key not in _generic_counters:
            label_names = list(labels.keys())
            _generic_counters[key] = prom.Counter(
                name, f"Auto-registered counter: {name}", label_names
            )
        try:
            _generic_counters[key].labels(**labels).inc(by)
        except Exception:
            pass

    def histogram(self, name: str, value: float, **labels: str) -> None:
        """Record a histogram observation."""
        key = name
        if key not in _generic_histograms:
            label_names = list(labels.keys())
            _generic_histograms[key] = prom.Histogram(
                name, f"Auto-registered histogram: {name}", label_names
            )
        try:
            _generic_histograms[key].labels(**labels).observe(value)
        except Exception:
            pass

    def gauge(self, name: str, value: float, **labels: str) -> None:
        """Set a gauge value."""
        key = name
        if key not in _generic_gauges:
            label_names = list(labels.keys())
            _generic_gauges[key] = prom.Gauge(
                name, f"Auto-registered gauge: {name}", label_names
            )
        try:
            _generic_gauges[key].labels(**labels).set(value)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Named metric shortcuts (matches requested metric list)
    # ------------------------------------------------------------------

    def record_prediction(
        self,
        *,
        artist_id: int,
        breakout_prob: float,
        confidence: float,
        latency_seconds: float,
        from_cache: bool,
    ) -> None:
        """Record all metrics for a single prediction."""
        if confidence >= 0.80:
            level = "high"
        elif confidence >= 0.60:
            level = "moderate"
        elif confidence >= 0.40:
            level = "uncertain"
        else:
            level = "insufficient"

        _PROM_PREDICTION_LATENCY.labels(from_cache=str(from_cache)).observe(latency_seconds)
        _PROM_PREDICTION_COUNT.labels(confidence_level=level).inc()
        _PROM_PREDICTION_CONFIDENCE.labels(artist_id=str(artist_id)).set(confidence)

        self._log.info(
            "prediction.served",
            artist_id=artist_id,
            breakout_prob=round(breakout_prob, 2),
            confidence=round(confidence, 4),
            confidence_level=level,
            latency_ms=round(latency_seconds * 1000, 1),
            from_cache=from_cache,
        )

    def record_api_call(
        self, api_name: str, status: str, latency_seconds: float
    ) -> None:
        """Record outbound API call (Spotify, YouTube, TikTok)."""
        _PROM_API_REQUEST_COUNT.labels(api_name=api_name, status=status).inc()
        self._log.info(
            "api.call",
            api_name=api_name,
            status=status,
            latency_ms=round(latency_seconds * 1000, 1),
        )

    def record_drift(self, feature: str, psi: float) -> None:
        """Update the PSI drift score gauge for a feature."""
        _PROM_DATA_DRIFT_SCORE.labels(feature=feature).set(psi)
        if psi >= 0.2:
            self._log.warning("drift.alert", feature=feature, psi=round(psi, 4), severity="retrain")
        elif psi >= 0.1:
            self._log.warning("drift.investigate", feature=feature, psi=round(psi, 4), severity="investigate")

    def record_loop_run(
        self,
        *,
        duration_seconds: float,
        labels_admitted: int,
        retraining_action: str,
        error: str | None,
    ) -> None:
        """Record metrics for one LoopOrchestrator.run() cycle."""
        _PROM_LOOP_DURATION.observe(duration_seconds)
        _PROM_LOOP_LABELS_ADMITTED.inc(labels_admitted)
        _PROM_LOOP_RETRAIN_TOTAL.labels(action=retraining_action).inc()
        log_fn = self._log.error if error else self._log.info
        log_fn(
            "loop.complete",
            duration_s=round(duration_seconds, 2),
            labels_admitted=labels_admitted,
            retraining_action=retraining_action,
            error=error,
        )

    # ------------------------------------------------------------------
    # Prometheus /metrics endpoint helper
    # ------------------------------------------------------------------

    def metrics_text(self) -> str:
        """Return Prometheus text-format metrics (expose via /metrics route)."""
        return prom.generate_latest().decode()

    def expose_metrics(self, port: int = 9090) -> None:
        """Start a standalone Prometheus HTTP server on `port`."""
        prom.start_http_server(port)
        self._log.info("prometheus.server.started", port=port)


# Singleton
telemetry = TelemetryService()
