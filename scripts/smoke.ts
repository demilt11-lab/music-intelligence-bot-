/**
 * End-to-end smoke test for the critical request paths.
 *
 * Requires:
 *  - DATABASE_URL pointing at a reachable Postgres with the schema pushed.
 *  - A running server at BASE_URL (default http://localhost:3000).
 *
 * Run: `npm run smoke` (after `next build && next start &`).
 *
 * It creates a throwaway fixture track (with BigInt stats), exercises the
 * endpoints that broke before this hardening pass, and cleans up after itself.
 */
import { db } from '@/lib/db';

const BASE_URL = process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`\n🔥 Smoke test against ${BASE_URL}\n`);

  // ── Fixture ────────────────────────────────────────────────────────────────
  const artist = await db.artist.create({ data: { name: 'Smoke Test Artist' } });
  const track = await db.track.create({
    data: {
      title: 'Smoke Test Track',
      isrc: `SMOKE${Date.now().toString().slice(-7)}`,
      trackArtists: { create: { artistId: artist.id, position: 0 } },
      statisticsLatest: {
        create: {
          totalStreams: 5_000_000n, // BigInt — exercises serialisation (P0-2)
          tiktokCreations: 120_000n,
          youtubeViews: 9_876_543n,
          spotifyPopularity: 73,
        },
      },
    },
  });

  try {
    // ── 1. Health ──────────────────────────────────────────────────────────
    const health = await getJson('/api/health');
    check('GET /api/health → 200 ok', health.status === 200 && health.body?.status === 'ok',
      `status=${health.status} body=${JSON.stringify(health.body)}`);

    // ── 2. Track detail (P0-1 param fix + P0-2 BigInt serialisation) ─────────
    const ok = await getJson(`/api/tracks/${track.id}`);
    check('GET /api/tracks/:id → 200', ok.status === 200, `status=${ok.status}`);
    check('  track payload has correct name', ok.body?.obj?.name === 'Smoke Test Track');
    check('  BigInt stream count serialised as string',
      ok.body?.obj?.statistics?.spotifyStreams === '5000000',
      `got ${JSON.stringify(ok.body?.obj?.statistics?.spotifyStreams)}`);

    // ── 3. Invalid id → 400 ─────────────────────────────────────────────────
    const bad = await getJson('/api/tracks/not-a-number');
    check('GET /api/tracks/not-a-number → 400', bad.status === 400, `status=${bad.status}`);

    // ── 4. Missing track → 404 ──────────────────────────────────────────────
    const missing = await getJson('/api/tracks/999999999');
    check('GET /api/tracks/999999999 → 404', missing.status === 404, `status=${missing.status}`);

    // ── 5. v1 API requires auth → 401 without x-api-key ─────────────────────
    const noauth = await getJson(`/api/v1/tracks/${track.id}`);
    check('GET /api/v1/tracks/:id without key → 401', noauth.status === 401, `status=${noauth.status}`);

    // ── 6. Cron endpoint fails closed without a valid secret ─────────────────
    const cron = await getJson('/api/cron/send-daily-digest');
    check('GET /api/cron/send-daily-digest unauthenticated → 401', cron.status === 401,
      `status=${cron.status}`);

    // ── 7. Talent scout daily — must answer 200 with provenance metadata ─────
    const scout = await getJson('/api/talent-scout/daily?code2=GLOBAL&limit=5');
    check('GET /api/talent-scout/daily → 200', scout.status === 200, `status=${scout.status}`);
    check('  scout meta exposes dataSource provenance',
      scout.body?.meta && 'dataSource' in scout.body.meta,
      `meta=${JSON.stringify(scout.body?.meta ?? null)}`);
    check('  scout response is an array', Array.isArray(scout.body?.obj));

    // ── 8. Breaking artists leaderboard — 200, deduped shape ─────────────────
    const breaking = await getJson('/api/artists/breaking?limit=10');
    check('GET /api/artists/breaking → 200', breaking.status === 200, `status=${breaking.status}`);
    if (breaking.status === 200) {
      const ids = (breaking.body?.obj ?? []).map((r: any) => r.artistId);
      check('  leaderboard has no duplicate artists', new Set(ids).size === ids.length,
        `ids=${ids.join(',')}`);
    }

    // ── 9. First-party watchlist CRUD (no API key — server-side tenant) ──────
    const add = await getJson('/api/ui/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: 'track', entityId: track.id }),
    });
    check('POST /api/ui/watchlist → 201', add.status === 201, `status=${add.status}`);

    const list = await getJson('/api/ui/watchlist');
    const entry = (list.body?.obj ?? []).find((i: any) => i.entityId === track.id);
    check('GET /api/ui/watchlist contains the added track', !!entry);
    check('  watchlist entry is enriched with the entity name',
      entry?.entityName === 'Smoke Test Track', `entityName=${entry?.entityName}`);

    const badAdd = await getJson('/api/ui/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: 'playlist', entityId: 1 }),
    });
    check('POST /api/ui/watchlist rejects invalid entityType → 400', badAdd.status === 400,
      `status=${badAdd.status}`);

    const exportRes = await fetch(`${BASE_URL}/api/ui/watchlist/export`);
    check('GET /api/ui/watchlist/export → 200 CSV', exportRes.status === 200 &&
      (exportRes.headers.get('content-type') ?? '').includes('text/csv'),
      `status=${exportRes.status} type=${exportRes.headers.get('content-type')}`);

    if (entry?.id) {
      const del = await getJson(`/api/ui/watchlist/${entry.id}`, { method: 'DELETE' });
      check('DELETE /api/ui/watchlist/:id → 200', del.status === 200, `status=${del.status}`);

      const after = await getJson('/api/ui/watchlist');
      check('  removed item no longer listed',
        !(after.body?.obj ?? []).some((i: any) => i.id === entry.id));
    }
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    await db.track.delete({ where: { id: track.id } }).catch(() => {});
    await db.artist.delete({ where: { id: artist.id } }).catch(() => {});
    await db.$disconnect();
  }

  console.log('');
  if (failures > 0) {
    console.error(`❌ Smoke test FAILED (${failures} check(s) failed)\n`);
    process.exit(1);
  }
  console.log('✅ Smoke test passed\n');
}

main().catch((e) => {
  console.error('💥 Smoke test crashed:', e);
  process.exit(1);
});
