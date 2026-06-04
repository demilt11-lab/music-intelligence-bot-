// In-memory sliding window rate limiter

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly timestamps: Map<string, number[]>;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.timestamps = new Map();
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing timestamps, prune entries older than windowMs
    const existing = (this.timestamps.get(key) ?? []).filter((t) => t > windowStart);

    const allowed = existing.length < this.maxRequests;

    if (allowed) {
      existing.push(now);
    }

    this.timestamps.set(key, existing);

    const remaining = Math.max(0, this.maxRequests - existing.length);
    // Reset window: oldest timestamp + windowMs, or now + windowMs if no entries
    const oldestInWindow = existing.length > 0 ? existing[0] : now;
    const resetAt = new Date(oldestInWindow + this.windowMs);

    return { allowed, remaining, resetAt };
  }
}

export const globalRateLimiter = new SlidingWindowRateLimiter(60_000, 100);

export function rateLimit(
  keyId: string,
  limiter: SlidingWindowRateLimiter = globalRateLimiter,
): RateLimitResult {
  return limiter.check(keyId);
}
