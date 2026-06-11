/**
 * Lightweight load test for the hot read paths. Not a substitute for full
 * k6 runs at scale, but catches latency regressions and N+1 blowups before
 * they ship: 25 concurrent workers per endpoint for a fixed duration,
 * reporting p50/p95/p99 and error rate. Exits 1 when p95 exceeds budget.
 *
 * Run: BASE_URL=http://localhost:3000 npm run loadtest
 */

const BASE_URL = process.env.LOADTEST_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
const DURATION_MS = Number(process.env.LOADTEST_DURATION_MS ?? 10_000);
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY ?? 25);
const P95_BUDGET_MS = Number(process.env.LOADTEST_P95_BUDGET_MS ?? 1_500);

const TARGETS = [
  { name: 'scout feed', path: '/api/talent-scout/daily?code2=GLOBAL&limit=50' },
  { name: 'breaking leaderboard', path: '/api/artists/breaking?limit=100' },
  { name: 'health', path: '/api/health' },
];

type Stats = { latencies: number[]; errors: number; requests: number };

let sessionCookie = '';

/** When auth is enabled, log in once so gated endpoints measure real work. */
async function maybeLogin(): Promise<void> {
  const email = process.env.LOADTEST_EMAIL;
  const password = process.env.LOADTEST_PASSWORD;
  if (!email || !password) return;
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`loadtest login failed (${res.status})`);
  sessionCookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function worker(path: string, deadline: number, stats: Stats) {
  while (Date.now() < deadline) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: sessionCookie ? { cookie: sessionCookie } : undefined,
      });
      await res.arrayBuffer();
      stats.requests++;
      if (!res.ok) stats.errors++;
      stats.latencies.push(performance.now() - start);
    } catch {
      stats.requests++;
      stats.errors++;
      stats.latencies.push(performance.now() - start);
    }
  }
}

async function main() {
  console.log(`\n⚡ Load test against ${BASE_URL}`);
  console.log(`   ${CONCURRENCY} workers/endpoint · ${DURATION_MS / 1000}s · p95 budget ${P95_BUDGET_MS}ms\n`);

  await maybeLogin();

  let failed = false;

  for (const target of TARGETS) {
    const stats: Stats = { latencies: [], errors: 0, requests: 0 };
    const deadline = Date.now() + DURATION_MS;

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker(target.path, deadline, stats)),
    );

    const sorted = [...stats.latencies].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const rps = stats.requests / (DURATION_MS / 1000);
    const errRate = stats.requests ? (stats.errors / stats.requests) * 100 : 100;

    const ok = p95 <= P95_BUDGET_MS && errRate < 1;
    if (!ok) failed = true;

    console.log(
      `  [${ok ? 'PASS' : 'FAIL'}] ${target.name.padEnd(22)} ` +
      `${rps.toFixed(0).padStart(5)} req/s · p50 ${p50.toFixed(0)}ms · ` +
      `p95 ${p95.toFixed(0)}ms · p99 ${p99.toFixed(0)}ms · errors ${errRate.toFixed(2)}%`,
    );
  }

  console.log('');
  if (failed) {
    console.error(`❌ Load test failed (p95 budget ${P95_BUDGET_MS}ms or error rate ≥1%)\n`);
    process.exit(1);
  }
  console.log('✅ Load test passed\n');
}

main().catch((e) => {
  console.error('💥 Load test crashed:', e);
  process.exit(1);
});
