interface Counter {
  name: string;
  help: string;
  value: number;
  labels: Record<string, string>;
}

interface Histogram {
  name: string;
  help: string;
  buckets: number[];       // upper bounds in ms: [10, 50, 100, 200, 500, 1000, 5000]
  counts: number[];        // count per bucket
  sum: number;
  count: number;
}

class MetricsRegistry {
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();

  // Pre-defined metrics
  readonly HTTP_REQUESTS_TOTAL = "http_requests_total";
  readonly HTTP_REQUEST_DURATION_MS = "http_request_duration_ms";
  readonly API_KEY_AUTH_FAILURES = "api_key_auth_failures_total";
  readonly TRAJECTORY_PREDICTIONS_TOTAL = "trajectory_predictions_total";
  readonly TRAJECTORY_CACHE_HITS = "trajectory_cache_hits_total";
  readonly DB_ERRORS_TOTAL = "db_errors_total";
  readonly RATE_LIMIT_HITS = "rate_limit_hits_total";

  inc(name: string, labels: Record<string, string> = {}, by: number = 1): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += by;
    } else {
      this.counters.set(key, { name, help: name, value: by, labels });
    }
  }

  observe(name: string, valueMs: number): void {
    let h = this.histograms.get(name);
    if (!h) {
      const buckets = [10, 50, 100, 200, 500, 1000, 5000];
      h = { name, help: name, buckets, counts: new Array(buckets.length).fill(0), sum: 0, count: 0 };
      this.histograms.set(name, h);
    }
    h.sum += valueMs;
    h.count++;
    for (let i = 0; i < h.buckets.length; i++) {
      if (valueMs <= h.buckets[i]) h.counts[i]++;
    }
  }

  toPrometheusText(): string {
    const lines: string[] = [];
    for (const [, c] of this.counters) {
      const labelStr = Object.entries(c.labels).map(([k,v]) => `${k}="${v}"`).join(",");
      lines.push(`${c.name}{${labelStr}} ${c.value}`);
    }
    for (const [, h] of this.histograms) {
      lines.push(`# HELP ${h.name} ${h.help}`);
      lines.push(`# TYPE ${h.name} histogram`);
      h.buckets.forEach((b, i) => lines.push(`${h.name}_bucket{le="${b}"} ${h.counts[i]}`));
      lines.push(`${h.name}_bucket{le="+Inf"} ${h.count}`);
      lines.push(`${h.name}_sum ${h.sum}`);
      lines.push(`${h.name}_count ${h.count}`);
    }
    return lines.join("\n");
  }

  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, c] of this.counters) out[k] = c.value;
    for (const [k, h] of this.histograms) {
      out[k] = { sum: h.sum, count: h.count, p50: this._percentile(h, 0.5), p99: this._percentile(h, 0.99) };
    }
    return out;
  }

  private _percentile(h: Histogram, p: number): number {
    const target = h.count * p;
    let cumulative = 0;
    for (let i = 0; i < h.buckets.length; i++) {
      cumulative += h.counts[i];
      if (cumulative >= target) return h.buckets[i];
    }
    return h.buckets[h.buckets.length - 1];
  }
}

export const metrics = new MetricsRegistry();
export default metrics;
