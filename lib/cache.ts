// lib/cache.ts
// In-process LRU cache. Swap get/set/del for ioredis when you need distributed caching.

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

class LRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly max: number;
  private readonly defaultTtl: number;

  constructor(options: { max: number; ttlMs: number }) {
    this.max = options.max;
    this.defaultTtl = options.ttlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.max) {
      // evict oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtl),
    });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  delByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  flush(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Singleton — one cache shared across the process
const globalForCache = globalThis as unknown as { _appCache: LRUCache };

export const Cache =
  globalForCache._appCache ??
  (globalForCache._appCache = new LRUCache({
    max: 1000,
    ttlMs: 1000 * 60 * 5, // 5 min default
  }));

// ─── TTL constants (use these everywhere) ────────────────────────────────────
export const TTL = {
  SHORT:  1000 * 60 * 1,   //  1 min  — live feeds, spin counts
  MEDIUM: 1000 * 60 * 5,   //  5 min  — radio lists, track lists
  LONG:   1000 * 60 * 60,  // 60 min  — chart snapshots, artist metadata
} as const;

// ─── Cache key builders ───────────────────────────────────────────────────────
export const CacheKey = {
  radios:      (params: string) => `radios:${params}`,
  radioDetail: (slug: string)   => `radio:${slug}`,
  radioSpins:  (slug: string, params: string) => `radio:${slug}:spins:${params}`,
  tracks:      (params: string) => `tracks:${params}`,
  trackDetail: (id: string)     => `track:${id}`,
  artists:     (params: string) => `artists:${params}`,
  artistDetail:(id: string)     => `artist:${id}`,
  search:      (q: string)      => `search:${q}`,
  charts:      (params: string) => `charts:${params}`,
} as const;
