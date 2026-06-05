export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryIf?: (err: unknown) => boolean;
}

const isTransientError = (err: unknown): boolean => {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("503") ||
    msg.includes("429") ||
    // Prisma connection pool exhaustion
    msg.includes("p1001") ||
    msg.includes("p1002") ||
    msg.includes("p1008")
  );
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const retryIf = opts.retryIf ?? isTransientError;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.attempts || !retryIf(err)) throw err;
      // Exponential backoff with ±50ms jitter
      const base = opts.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * 100 - 50;
      const delay = Math.min(base + jitter, opts.maxDelayMs);
      await new Promise((r) => setTimeout(r, Math.max(delay, 0)));
    }
  }

  throw lastErr;
}
