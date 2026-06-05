# Observability

## Architecture

This is a **Next.js (TypeScript) + Python ML** stack with two separate observability layers:

| Layer | Language | Instrumented |
|---|---|---|
| API / Ingestion | TypeScript (`lib/monitoring/`) | HTTP requests, ingestion pipeline, SLA breaches |
| ML inference + learning loop | Python (`ml/monitoring/telemetry.py`) | Predictions, drift, retraining |

---

## Dev mode (zero config)

No environment variables needed. On import, `telemetry` automatically:
- Logs structured JSON to **stdout**
- Exports OTel traces to **console** (one line per span)
- Exposes Prometheus metrics via `telemetry.metrics_text()`
- Flushes metrics to console every 60 s

```bash
# Run any Python script — telemetry activates automatically
python ml/scripts/inference.py --artist_id 42
```

Sample JSON log output:
```json
{"event": "prediction.served", "artist_id": 42, "breakout_prob": 73.5,
 "confidence": 0.84, "confidence_level": "high", "latency_ms": 47.2,
 "from_cache": false, "level": "info", "timestamp": "2026-06-05T14:32:11.201Z"}
```

---

## Prod mode (Grafana Cloud / any OTLP backend)

Set these environment variables:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instance_id:api_token)>
OTEL_SERVICE_NAME=music-ar-bot          # default
LOG_LEVEL=INFO                           # DEBUG | INFO | WARNING | ERROR
LOG_FORMAT=json                          # json | console
```

Traces and metrics are then exported via OTLP HTTP. No code changes required.

---

## Metrics reference

### Python ML layer (`prometheus_client`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `prediction_latency_seconds` | Histogram | `from_cache` | End-to-end predict() duration |
| `prediction_count_total` | Counter | `confidence_level` | Predictions served (high/moderate/uncertain/insufficient) |
| `prediction_confidence` | Gauge | `artist_id` | Last confidence score per artist |
| `api_request_count_total` | Counter | `api_name`, `status` | Outbound API calls (spotify/youtube/tiktok) |
| `data_drift_score` | Gauge | `feature` | PSI drift score per feature (>0.2 = retrain) |
| `loop_orchestrator_duration_seconds` | Histogram | — | LoopOrchestrator.run() wall time |
| `loop_labels_admitted_total` | Counter | — | Labels admitted by quality gate |
| `loop_retraining_total` | Counter | `action` | Retraining outcomes (promoted/rolled_back/skipped/failed) |

### TypeScript API layer (`lib/monitoring/metrics.ts`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | — | HTTP requests to Next.js API |
| `http_request_duration_ms` | Histogram | — | API route latency |
| `pipeline_artists_processed_total` | Counter | — | Artists processed per ingestion run |
| `pipeline_artists_failed_total` | Counter | — | Artists that failed after retries |
| `pipeline_duration_ms` | Histogram | — | Total ingestion run duration |
| `pipeline_sla_breach_total` | Counter | `signal`, `tier` | Freshness SLA violations |
| `pipeline_snapshots_written_total` | Counter | `source` | DB snapshots successfully written |
| `pipeline_validation_failures_total` | Counter | `source` | Records rejected by validator |

---

## Traces reference

| Span | Attributes | Emitted by |
|---|---|---|
| `loop_orchestrator.run` | — | `LoopOrchestrator.run()` |
| Any custom span | key=value passed to `telemetry.span(name, **attrs)` | Call sites |

---

## Drift alerting

PSI thresholds (logged + `data_drift_score` gauge updated):

| PSI range | Severity | Action |
|---|---|---|
| < 0.10 | OK | No action |
| 0.10 – 0.20 | `drift.investigate` (WARNING) | Monitor weekly |
| ≥ 0.20 | `drift.alert` (WARNING) | Trigger retraining |

---

## Exposing /metrics endpoint

### Standalone HTTP server (scripts / cron jobs)
```python
from ml.monitoring.telemetry import telemetry
telemetry.expose_metrics(port=9090)   # starts background thread
```

### Scrape current snapshot
```python
print(telemetry.metrics_text())   # Prometheus text format
```

---

## Debugging with correlation IDs

Every ingestion run generates a `correlationId` (format: `ingest-<timestamp>-<random>`).
It appears in all log lines for that run:

```bash
# Find all logs for a specific run
grep '"correlationId":"ingest-1748891234-abc123"' /var/log/app.log
```

Fields to filter on:
- TypeScript: `correlationId`, `jobId`
- Python predictions: `artist_id`, `model_version`
- Python loop: `retraining_action`, `drift_action`

---

## Adding new instrumentation

### Python — record a timed operation
```python
from ml.monitoring.telemetry import telemetry

with telemetry.span("my_operation", artist_id=42):
    result = do_work()
    telemetry.log_event("my_operation.complete", result=result)
```

### Python — record a metric
```python
telemetry.inc("my_counter_total", source="cron")
telemetry.histogram("my_latency_seconds", 0.35)
telemetry.gauge("queue_depth", 12)
```

### TypeScript — record a metric
```typescript
import metrics from "@/lib/monitoring/metrics";
import { logger } from "@/lib/monitoring/logger";

metrics.inc("my_counter_total", { source: "api" });
logger.info("my.event", { artistId, durationMs });
```

---

## Runbook

### Pipeline failure
1. Check `pipeline_artists_failed_total` counter — if high, check DLQ (`IngestionJob` where `jobType="dlq"`)
2. Search logs for `correlationId` of the failed run
3. Check `pipeline_sla_breach_total` — identifies which signal tier was affected

### Data drift alert
1. `data_drift_score{feature="X"} > 0.2` → check raw signal distribution for feature X
2. If sustained (2+ consecutive days), trigger manual retraining: `LoopOrchestrator.run()`
3. After retraining, `loop_retraining_total{action="promoted"}` should increment

### Prediction accuracy degradation
1. Check `prediction_count_total{confidence_level="insufficient"}` — rising = data completeness problem
2. Check `loop_orchestrator_duration_seconds` — slow loop = DB or model issues
3. Check model version via `prediction_confidence` gauge labels
