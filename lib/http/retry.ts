// lib/http/retry.ts
//
// fetch with timeout + exponential backoff for external provider calls.
// Retries network failures, 429s (honoring Retry-After), and 5xx responses;
// 4xx client errors return immediately — retrying a bad request only burns
// quota. Every retry is logged with the provider label so flaky upstreams
// are visible in job logs.

export type RetryOptions = {
  retries?: number;        // attempts AFTER the first (default 3)
  baseDelayMs?: number;    // first backoff (default 500ms; grows 2x + jitter)
  timeoutMs?: number;      // per-attempt timeout (default 15s)
  label?: string;          // provider tag for logs, e.g. "spotify"
  retryOn?: (res: Response) => boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = 15_000,
    label = 'http',
    retryOn,
  } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      const shouldRetry =
        res.status === 429 || res.status >= 500 || (retryOn ? retryOn(res) : false);

      if (!shouldRetry || attempt === retries) {
        return res;
      }

      // Honor Retry-After when the provider tells us how long to wait.
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60_000)
        : baseDelayMs * 2 ** attempt + Math.random() * 250;

      console.warn(
        `[${label}] HTTP ${res.status} — retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`,
      );
      // Drain the body so the connection can be reused.
      await res.text().catch(() => {});
      await sleep(delay);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      if (attempt === retries) break;

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 250;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${label}] ${reason} — retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`,
      );
      await sleep(delay);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[${label}] request failed after ${retries + 1} attempts: ${url}`);
}
