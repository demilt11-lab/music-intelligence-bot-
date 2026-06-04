/**
 * Lightweight MLflow tracking client for logging model metadata and metrics.
 * Calls the MLflow REST API when MLFLOW_TRACKING_URI is set.
 * Falls back to no-op if not configured (development).
 */

const MLFLOW_URI = process.env.MLFLOW_TRACKING_URI;
const EXPERIMENT_NAME = process.env.MLFLOW_EXPERIMENT_NAME ?? "music-viral-prediction";

interface MLflowMetric {
  key: string;
  value: number;
  timestamp: number;
  step: number;
}

interface MLflowParam {
  key: string;
  value: string;
}

async function mlflowFetch(path: string, body: unknown): Promise<void> {
  if (!MLFLOW_URI) return;
  try {
    await fetch(`${MLFLOW_URI}/api/2.0/mlflow/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — MLflow unavailability must never break the serving path
  }
}

export async function logModelMetrics(
  runId: string,
  metrics: MLflowMetric[]
): Promise<void> {
  await mlflowFetch("runs/log-batch", { run_id: runId, metrics });
}

export async function logModelParams(
  runId: string,
  params: MLflowParam[]
): Promise<void> {
  await mlflowFetch("runs/log-batch", { run_id: runId, params });
}

export async function createRun(
  experimentId: string,
  tags: Record<string, string> = {}
): Promise<string | null> {
  if (!MLFLOW_URI) return null;
  try {
    const res = await fetch(`${MLFLOW_URI}/api/2.0/mlflow/runs/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experiment_id: experimentId,
        tags: Object.entries(tags).map(([k, v]) => ({ key: k, value: v })),
      }),
    });
    const data = await res.json() as { run?: { info?: { run_id?: string } } };
    return data.run?.info?.run_id ?? null;
  } catch {
    return null;
  }
}

export const mlflow = { logModelMetrics, logModelParams, createRun };
export default mlflow;
