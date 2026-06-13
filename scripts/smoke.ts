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
import { hashPassword } from '@/lib/auth/password';

const BASE_URL = process.env.SMOKE_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';
const AUTH_ON = !!process.env.AUTH_SECRET;
const SMOKE_EMAIL = 'smoke-user@test.local';
const SMOKE_PASSWORD = 'smoke-test-password-1';

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
  console.log(`\n🔥 Smoke test against ${BASE_URL} (auth ${AUTH_ON ? 'ENABLED' : 'disabled'})\n`);

  // ── Auth fixture + session ──────────────────────────────────────────────────
  let cookie = '';
  if (AUTH_ON) {
    const tenant = await db.tenant.upsert({
      where: { slug: process.env.UI_TENANT_SLUG ?? 'workspace' },
      update: {},
      create: { name: 'Workspace', slug: process.env.UI_TENANT_SLUG ?? 'workspace', environment: 'PROD' },
    });
    await db.tenantUser.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: SMOKE_EMAIL } },
      update: { passwordHash: hashPassword(SMOKE_PASSWORD), role: 'ADMIN' },
      create: {
        tenantId: tenant.id,
        email: SMOKE_EMAIL,
        role: 'ADMIN',
        passwordHash: hashPassword(SMOKE_PASSWORD),
      },
    });

    // Unauthenticated checks first
    const unauthApi = await getJson('/api/ui/watchlist');
    check('GET /api/ui/watchlist without session → 401', unauthApi.status === 401,
      `status=${unauthApi.status}`);

    const unauthPage = await fetch(`${BASE_URL}/artists`, { redirect: 'manual' });
    check('GET /artists without session → redirect to /login',
      unauthPage.status >= 300 && unauthPage.status < 400 &&
      (unauthPage.headers.get('location') ?? '').includes('/login'),
      `status=${unauthPage.status} location=${unauthPage.headers.get('location')}`);

    const badLogin = await getJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: 'wrong-password' }),
    });
    check('POST /api/auth/login with bad password → 401', badLogin.status === 401,
      `status=${badLogin.status}`);

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
    });
    check('POST /api/auth/login with valid credentials → 200', loginRes.status === 200,
      `status=${loginRes.status}`);
    cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0];
    check('  login sets the session cookie', cookie.startsWith('nv8_session='));

    const me = await getJson('/api/auth/me', { headers: { cookie } });
    check('GET /api/auth/me with session → 200 + role',
      me.status === 200 && me.body?.obj?.role === 'ADMIN',
      `status=${me.status} body=${JSON.stringify(me.body)}`);
  }

  const authHeaders = cookie ? { cookie } : undefined;

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
    const ok = await getJson(`/api/tracks/${track.id}`, { headers: authHeaders });
    check('GET /api/tracks/:id → 200', ok.status === 200, `status=${ok.status}`);
    check('  track payload has correct name', ok.body?.obj?.name === 'Smoke Test Track');
    check('  BigInt stream count serialised as string',
      ok.body?.obj?.statistics?.spotifyStreams === '5000000',
      `got ${JSON.stringify(ok.body?.obj?.statistics?.spotifyStreams)}`);

    // ── 3. Invalid id → 400 ─────────────────────────────────────────────────
    const bad = await getJson('/api/tracks/not-a-number', { headers: authHeaders });
    check('GET /api/tracks/not-a-number → 400', bad.status === 400, `status=${bad.status}`);

    // ── 4. Missing track → 404 ──────────────────────────────────────────────
    const missing = await getJson('/api/tracks/999999999', { headers: authHeaders });
    check('GET /api/tracks/999999999 → 404', missing.status === 404, `status=${missing.status}`);

    // ── 5. v1 API requires auth → 401 without x-api-key ─────────────────────
    const noauth = await getJson(`/api/v1/tracks/${track.id}`);
    check('GET /api/v1/tracks/:id without key → 401', noauth.status === 401, `status=${noauth.status}`);

    // ── 6. Cron endpoint fails closed without a valid secret ─────────────────
    const cron = await getJson('/api/cron/send-daily-digest');
    check('GET /api/cron/send-daily-digest unauthenticated → 401', cron.status === 401,
      `status=${cron.status}`);

    // ── 7. Talent scout daily — must answer 200 with provenance metadata ─────
    const scout = await getJson('/api/talent-scout/daily?code2=GLOBAL&limit=5', { headers: authHeaders });
    check('GET /api/talent-scout/daily → 200', scout.status === 200, `status=${scout.status}`);
    check('  scout meta exposes dataSource provenance',
      scout.body?.meta && 'dataSource' in scout.body.meta,
      `meta=${JSON.stringify(scout.body?.meta ?? null)}`);
    check('  scout response is an array', Array.isArray(scout.body?.obj));

    // ── 8. Breaking artists leaderboard — 200, deduped shape ─────────────────
    const breaking = await getJson('/api/artists/breaking?limit=10', { headers: authHeaders });
    check('GET /api/artists/breaking → 200', breaking.status === 200, `status=${breaking.status}`);
    if (breaking.status === 200) {
      const ids = (breaking.body?.obj ?? []).map((r: any) => r.artistId);
      check('  leaderboard has no duplicate artists', new Set(ids).size === ids.length,
        `ids=${ids.join(',')}`);
    }

    // ── 9. First-party watchlist CRUD (no API key — server-side tenant) ──────
    const add = await getJson('/api/ui/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeaders ?? {}) },
      body: JSON.stringify({ entityType: 'track', entityId: track.id }),
    });
    check('POST /api/ui/watchlist → 201', add.status === 201, `status=${add.status}`);

    const list = await getJson('/api/ui/watchlist', { headers: authHeaders });
    const entry = (list.body?.obj ?? []).find((i: any) => i.entityId === track.id);
    check('GET /api/ui/watchlist contains the added track', !!entry);
    check('  watchlist entry is enriched with the entity name',
      entry?.entityName === 'Smoke Test Track', `entityName=${entry?.entityName}`);

    const badAdd = await getJson('/api/ui/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeaders ?? {}) },
      body: JSON.stringify({ entityType: 'playlist', entityId: 1 }),
    });
    check('POST /api/ui/watchlist rejects invalid entityType → 400', badAdd.status === 400,
      `status=${badAdd.status}`);

    const exportRes = await fetch(`${BASE_URL}/api/ui/watchlist/export`, {
      headers: authHeaders,
    });
    check('GET /api/ui/watchlist/export → 200 CSV', exportRes.status === 200 &&
      (exportRes.headers.get('content-type') ?? '').includes('text/csv'),
      `status=${exportRes.status} type=${exportRes.headers.get('content-type')}`);

    if (entry?.id) {
      const del = await getJson(`/api/ui/watchlist/${entry.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      check('DELETE /api/ui/watchlist/:id → 200', del.status === 200, `status=${del.status}`);

      const after = await getJson('/api/ui/watchlist', { headers: authHeaders });
      check('  removed item no longer listed',
        !(after.body?.obj ?? []).some((i: any) => i.id === entry.id));
    }
    // ── 10. API key CRUD (ADMIN-only) ──────────────────────────────────────
    if (AUTH_ON && cookie) {
      const createKey = await getJson('/api/ui/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ label: 'Smoke Test Key' }),
      });
      check('POST /api/ui/api-keys → 201', createKey.status === 201, `status=${createKey.status}`);
      const rawKey: string | undefined = createKey.body?.obj?.key;
      const keyId: number | undefined = createKey.body?.obj?.id;
      check('  API key response includes raw key', typeof rawKey === 'string' && rawKey.startsWith('mi_'));

      const listKeys = await getJson('/api/ui/api-keys', { headers: { cookie } });
      check('GET /api/ui/api-keys → 200', listKeys.status === 200, `status=${listKeys.status}`);
      check('  new key appears in list', (listKeys.body?.obj ?? []).some((k: any) => k.id === keyId));

      if (keyId) {
        const delKey = await getJson(`/api/ui/api-keys/${keyId}`, {
          method: 'DELETE',
          headers: { cookie },
        });
        check('DELETE /api/ui/api-keys/:id → 204', delKey.status === 204, `status=${delKey.status}`);
      }
    }

    // ── 11. MCP initialize handshake ────────────────────────────────────────
    const mcpRes = await getJson('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeaders ?? {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'smoke-test', version: '1.0' },
        },
      }),
    });
    if (AUTH_ON) {
      check('POST /api/mcp initialize → 200', mcpRes.status === 200, `status=${mcpRes.status}`);
      check('  MCP initialize returns serverInfo',
        mcpRes.body?.result?.serverInfo?.name != null,
        `body=${JSON.stringify(mcpRes.body)}`);
    } else {
      check('POST /api/mcp without auth → 401', mcpRes.status === 401, `status=${mcpRes.status}`);
    }
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    await db.track.delete({ where: { id: track.id } }).catch(() => {});
    await db.artist.delete({ where: { id: artist.id } }).catch(() => {});
    if (AUTH_ON) {
      const u = await db.tenantUser.findFirst({ where: { email: SMOKE_EMAIL } });
      if (u) {
        await db.session.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await db.tenantUser.delete({ where: { id: u.id } }).catch(() => {});
      }
    }
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
