// prisma/seed.ts

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('🌱  Seeding Radio + RadioSpin data...');

  // ── 1. Upsert Radios ──────────────────────────────────────────────────────
  const radios = await Promise.all([
    db.radio.upsert({
      where:  { slug: 'hot-97' },
      update: {},
      create: {
        slug:        'hot-97',
        name:        'HOT 97',
        countryCode: 'US',
        market:      'New York',
        genre:       'Hip-Hop',
      },
    }),
    db.radio.upsert({
      where:  { slug: 'power-106' },
      update: {},
      create: {
        slug:        'power-106',
        name:        'Power 106',
        countryCode: 'US',
        market:      'Los Angeles',
        genre:       'Hip-Hop',
      },
    }),
    db.radio.upsert({
      where:  { slug: 'radio-1' },
      update: {},
      create: {
        slug:        'radio-1',
        name:        'BBC Radio 1',
        countryCode: 'GB',
        market:      'UK National',
        genre:       'Pop',
      },
    }),
    db.radio.upsert({
      where:  { slug: 'kiss-fm-uk' },
      update: {},
      create: {
        slug:        'kiss-fm-uk',
        name:        'KISS FM UK',
        countryCode: 'GB',
        market:      'UK National',
        genre:       'R&B',
      },
    }),
    db.radio.upsert({
      where:  { slug: 'nova-nation' },
      update: {},
      create: {
        slug:        'nova-nation',
        name:        'Nova Nation',
        countryCode: 'AU',
        market:      'Australia',
        genre:       'Pop',
      },
    }),
  ]);

  console.log(`  ✓  ${radios.length} radios upserted`);

  // ── 2. Seed RadioSpins ─────────────────────────────────────────────────────
  //      Use placeholder song UUIDs — swap these for real Track IDs once you
  //      have ingested track data.

  const now = new Date();

  const spins = [
    // HOT 97
    {
      radioId:    radios[0].id,
      songUuid:   'song-uuid-001',
      airedAtUtc: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1h ago
      countryCode: 'US',
    },
    {
      radioId:    radios[0].id,
      songUuid:   'song-uuid-002',
      airedAtUtc: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
      countryCode: 'US',
    },
    {
      radioId:    radios[0].id,
      songUuid:   'song-uuid-003',
      airedAtUtc: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3h ago
      countryCode: 'US',
    },
    // Power 106
    {
      radioId:    radios[1].id,
      songUuid:   'song-uuid-001',
      airedAtUtc: new Date(now.getTime() - 30 * 60 * 1000), // 30min ago
      countryCode: 'US',
    },
    {
      radioId:    radios[1].id,
      songUuid:   'song-uuid-004',
      airedAtUtc: new Date(now.getTime() - 90 * 60 * 1000), // 90min ago
      countryCode: 'US',
    },
    // BBC Radio 1
    {
      radioId:    radios[2].id,
      songUuid:   'song-uuid-005',
      airedAtUtc: new Date(now.getTime() - 45 * 60 * 1000),
      countryCode: 'GB',
    },
    {
      radioId:    radios[2].id,
      songUuid:   'song-uuid-002',
      airedAtUtc: new Date(now.getTime() - 2.5 * 60 * 60 * 1000),
      countryCode: 'GB',
    },
    // KISS FM UK
    {
      radioId:    radios[3].id,
      songUuid:   'song-uuid-003',
      airedAtUtc: new Date(now.getTime() - 20 * 60 * 1000),
      countryCode: 'GB',
    },
    // Nova Nation
    {
      radioId:    radios[4].id,
      songUuid:   'song-uuid-005',
      airedAtUtc: new Date(now.getTime() - 1.5 * 60 * 60 * 1000),
      countryCode: 'AU',
    },
  ];

  // createMany with skipDuplicates so re-runs don't error
  const spinResult = await db.radioSpin.createMany({
    data:           spins,
    skipDuplicates: true,
  });

  console.log(`  ✓  ${spinResult.count} radio spins inserted`);

  await seedScoutDemoData();

  console.log('');
  console.log('✅  Seed complete. Test your endpoints:');
  console.log('   GET /api/integrations/internal/radios');
  console.log('   GET /api/talent-scout/daily?code2=GLOBAL');
  console.log('   GET /api/artists/breaking?status=GROWING');
}

// ── Demo scout pipeline data ──────────────────────────────────────────────────
// Seeds a small artist/track catalog with UGC metrics, viral scores, daily
// stats, and trajectory snapshots so every core product flow (talent scout,
// breaking artists, artist detail, watchlist) renders real signal-backed data
// from a clean database. Idempotent: keyed upserts throughout.
async function seedScoutDemoData() {
  console.log('🌱  Seeding scout demo pipeline data...');

  const utcToday = () => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  };
  const daysAgo = (n: number) => {
    const d = utcToday();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  };

  // `compounding: true` gives viral-style exponential stream growth — the
  // only honest way an artist exceeds +100% window-over-window momentum.
  const seedArtists = [
    { slug: 'seed-nova-rae',     name: 'Nova Rae',     country: 'US', momentum: 2.4, compounding: true },
    { slug: 'seed-jay-meridian', name: 'Jay Meridian', country: 'GB', momentum: 1.6, compounding: false },
    { slug: 'seed-luz-del-mar',  name: 'Luz del Mar',  country: 'BR', momentum: 1.2, compounding: false },
    { slug: 'seed-kilo-west',    name: 'Kilo West',    country: 'US', momentum: 0.7, compounding: false },
    { slug: 'seed-aya-tone',     name: 'Aya Tone',     country: 'KR', momentum: 0.4, compounding: false },
  ];

  const seeded: {
    i: number
    artistId: number
    trackId: number
    momentum: number
    country: string
  }[] = []

  for (const [i, a] of seedArtists.entries()) {
    const artist = await db.artist.upsert({
      where:  { slug: a.slug },
      update: {},
      create: { slug: a.slug, name: a.name, country: a.country },
    });

    const isrc = `SEED00${i + 1}DEMO`;
    let track = await db.track.findUnique({ where: { isrc } });
    if (!track) {
      track = await db.track.create({
        data: {
          isrc,
          title: `${a.name} — Lead Single`,
          releaseDate: daysAgo(45),
          trackArtists: { create: { artistId: artist.id, position: 0 } },
        },
      });
    }

    // 70 days of daily stats with momentum-scaled growth (enough history
    // for fully-covered 28d-over-28d baselines in the trajectory ETL)
    for (let d = 70; d >= 1; d--) {
      const base = 5_000 + i * 2_000;
      const growth = a.compounding
        ? Math.pow(1.028, 70 - d) // ~2.8%/day compounding ≈ 2x month-over-month
        : 1 + (a.momentum * (70 - d)) / 70;
      const streams = BigInt(Math.round(base * growth));

      await db.artistDailyStats.upsert({
        where: { artistId_date: { artistId: BigInt(artist.id), date: daysAgo(d) } },
        update: { totalStreams: streams },
        create: {
          artistId: BigInt(artist.id),
          date: daysAgo(d),
          totalStreams: streams,
          totalFollowers: BigInt(20_000 + i * 5_000 + Math.round(200 * (70 - d) * a.momentum)),
          playlistCount: 4 + Math.round(((70 - d) / 10) * a.momentum),
          genres: ['pop'],
          primaryCode2: a.country,
        },
      });

      await db.trackPlatformStatsDaily.upsert({
        where: {
          trackId_platform_date: { trackId: track.id, platform: 'tiktok', date: daysAgo(d) },
        },
        update: {},
        create: {
          trackId: track.id,
          platform: 'tiktok',
          date: daysAgo(d),
          videoViews: BigInt(Math.round(40_000 * growth)),
          streams: BigInt(Math.round(base * growth)),
        },
      });
    }

    // Latest UGC window + viral score for the scout feed (Tier 1 + ML hydrate)
    const views7d = BigInt(Math.round(350_000 * (1 + a.momentum)));
    await db.ugcTrackMetrics.upsert({
      where: { trackId_code2_date: { trackId: track.id, code2: 'GLOBAL', date: utcToday() } },
      update: { views7d, views7dGrowth: a.momentum * 60 },
      create: {
        trackId: track.id,
        code2: 'GLOBAL',
        date: utcToday(),
        videos7d: 120 + i * 40,
        videos7dGrowth: a.momentum * 45,
        views7d,
        views7dGrowth: a.momentum * 60,
        rankDelta7d: 0,
      },
    });

    await db.talentScoutScore.upsert({
      where: { trackId_code2_date: { trackId: track.id, code2: 'GLOBAL', date: utcToday() } },
      update: { viralScore: Math.min(0.95, 0.35 + a.momentum * 0.25) },
      create: {
        trackId: track.id,
        code2: 'GLOBAL',
        date: utcToday(),
        viralScore: Math.min(0.95, 0.35 + a.momentum * 0.25),
        rightsComplexityScore: i === 3 ? 0.6 : 0.1,
      },
    });

    seeded.push({ i, artistId: artist.id, trackId: track.id, momentum: a.momentum, country: a.country });
  }

  console.log(`  ✓  ${seedArtists.length} demo artists with stats, UGC, and scores`);
  console.log('  ↪  run `npx tsx jobs/etl/artist_trajectory_snapshots.ts` to build trajectories');

  // Light up the rest of the product surface from the same catalog so Search,
  // Playlists, Songwriters, Genres and non-US markets all return real data.
  await seedExternalIds(seeded);
  await seedMarketSignals(seeded);
  await seedPlaylistsAndCurators(seeded);
  await seedSongwriters(seeded);
  await seedGenreMetrics();

  await seedAdminUser();
}

const utcTodayDate = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

const pad3 = (n: number) => String(n).padStart(3, '0');

// ── External IDs ──────────────────────────────────────────────────────────────
// Spotify/YouTube IDs for tracks + artists so pasting a link into Search
// resolves (URL lookups all go through the external_ids table).
async function seedExternalIds(
  seeded: { i: number; artistId: number; trackId: number }[],
) {
  for (const s of seeded) {
    const idsuffix = pad3(s.i + 1);
    const trackExt: [string, string][] = [
      ['spotify', `seedtrk${idsuffix}`],
      ['youtube', `seedytv${idsuffix}`],
    ];
    for (const [platform, externalId] of trackExt) {
      await db.externalId.upsert({
        where: {
          entityType_entityId_platform: {
            entityType: 'track',
            entityId: s.trackId,
            platform,
          },
        },
        update: { externalId },
        create: { entityType: 'track', entityId: s.trackId, platform, externalId },
      });
    }
    await db.externalId.upsert({
      where: {
        entityType_entityId_platform: {
          entityType: 'artist',
          entityId: s.artistId,
          platform: 'spotify',
        },
      },
      update: { externalId: `seedart${idsuffix}` },
      create: {
        entityType: 'artist',
        entityId: s.artistId,
        platform: 'spotify',
        externalId: `seedart${idsuffix}`,
      },
    });
  }
  console.log(`  ✓  external IDs for ${seeded.length} tracks + artists (search-by-URL)`);
}

// ── Per-market signals ────────────────────────────────────────────────────────
// UGC + viral scores + a chart snapshot for US and GB so market selection
// returns market-specific results (and the chart fallback has data to serve).
async function seedMarketSignals(
  seeded: { i: number; trackId: number; momentum: number }[],
) {
  const markets = ['US', 'GB'];
  for (const code2 of markets) {
    const mult = code2 === 'US' ? 1 : 0.7;
    for (const s of seeded) {
      await db.ugcTrackMetrics.upsert({
        where: { trackId_code2_date: { trackId: s.trackId, code2, date: utcTodayDate() } },
        update: {},
        create: {
          trackId: s.trackId,
          code2,
          date: utcTodayDate(),
          videos7d: Math.round((120 + s.i * 40) * mult),
          videos7dGrowth: s.momentum * 45 * mult,
          views7d: BigInt(Math.round(350_000 * (1 + s.momentum) * mult)),
          views7dGrowth: s.momentum * 60 * mult,
          rankDelta7d: 0,
        },
      });
      await db.talentScoutScore.upsert({
        where: { trackId_code2_date: { trackId: s.trackId, code2, date: utcTodayDate() } },
        update: {},
        create: {
          trackId: s.trackId,
          code2,
          date: utcTodayDate(),
          viralScore: Math.min(0.95, (0.35 + s.momentum * 0.25) * mult),
          rightsComplexityScore: 0.1,
        },
      });
    }

    const snapshot =
      (await db.chartSnapshot.findFirst({
        where: { chartName: 'Seed Top 50', platform: 'spotify', countryCode: code2 },
      })) ??
      (await db.chartSnapshot.create({
        data: {
          chartName: 'Seed Top 50',
          platform: 'spotify',
          countryCode: code2,
          snapshotDate: utcTodayDate(),
        },
      }));

    await db.chartRow.createMany({
      data: seeded.map((s, idx) => ({
        snapshotId: snapshot.id,
        trackId: s.trackId,
        rank: idx + 1,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  ✓  per-market UGC + scores + charts (${markets.join(', ')})`);
}

// ── Playlists + curators ──────────────────────────────────────────────────────
async function seedPlaylistsAndCurators(seeded: { trackId: number }[]) {
  const playlists = [
    { name: 'Fresh Finds Pop', platform: 'spotify', externalId: 'seedpl001', followers: 1_250_000, country: 'US', curator: { name: 'Spotify Editorial', slug: 'seed-spotify-editorial', platform: 'spotify' } },
    { name: 'UK Rising', platform: 'spotify', externalId: 'seedpl002', followers: 480_000, country: 'GB', curator: { name: 'NME Picks', slug: 'seed-nme-picks', platform: 'spotify' } },
    { name: 'Viral Hits', platform: 'youtube', externalId: 'seedpl003', followers: 2_100_000, country: 'US', curator: { name: 'YouTube Music', slug: 'seed-youtube-music', platform: 'youtube' } },
    { name: 'New Music Daily', platform: 'apple', externalId: 'seedpl004', followers: 3_400_000, country: 'US', curator: { name: 'Apple Music', slug: 'seed-apple-music', platform: 'apple' } },
  ];

  for (const p of playlists) {
    const curator = await db.curator.upsert({
      where: { slug: p.curator.slug },
      update: {},
      create: {
        name: p.curator.name,
        slug: p.curator.slug,
        platform: p.curator.platform,
        followerCount: BigInt(p.followers),
        isVerified: true,
      },
    });

    const playlist =
      (await db.playlist.findFirst({ where: { name: p.name, platform: p.platform } })) ??
      (await db.playlist.create({
        data: {
          name: p.name,
          platform: p.platform,
          externalId: p.externalId,
          followerCount: BigInt(p.followers),
          trackCount: seeded.length,
          countryCode: p.country,
          isOfficial: true,
        },
      }));

    await db.playlistCuratorLink.upsert({
      where: { playlistId_curatorId: { playlistId: playlist.id, curatorId: curator.id } },
      update: {},
      create: { playlistId: playlist.id, curatorId: curator.id },
    });

    // External ID so pasting the playlist link resolves.
    await db.externalId.upsert({
      where: {
        entityType_entityId_platform: {
          entityType: 'playlist',
          entityId: playlist.id,
          platform: p.platform,
        },
      },
      update: { externalId: p.externalId },
      create: {
        entityType: 'playlist',
        entityId: playlist.id,
        platform: p.platform,
        externalId: p.externalId,
      },
    });

    await db.playlistTrack.createMany({
      data: seeded.slice(0, 3).map((s, idx) => ({
        playlistId: playlist.id,
        trackId: s.trackId,
        position: idx,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  ✓  ${playlists.length} playlists + curators (search + URL)`);
}

// ── Songwriters ───────────────────────────────────────────────────────────────
async function seedSongwriters(seeded: { trackId: number }[]) {
  const writers = [
    { name: 'Max Martin', slug: 'seed-max-martin' },
    { name: 'Amy Allen', slug: 'seed-amy-allen' },
    { name: 'Finneas O’Connell', slug: 'seed-finneas' },
    { name: 'Nija Charles', slug: 'seed-nija-charles' },
  ];

  for (const [idx, w] of writers.entries()) {
    const writer = await db.songwriter.upsert({
      where: { slug: w.slug },
      update: {},
      create: { name: w.name, slug: w.slug },
    });

    // Each writer is credited on a rotating couple of the seed tracks.
    const credits = seeded
      .filter((_, i) => (i + idx) % 2 === 0)
      .slice(0, 3)
      .map((s) => ({ songwriterId: writer.id, trackId: s.trackId, role: 'writer' }));

    if (credits.length) {
      await db.songwriterTrack.createMany({ data: credits, skipDuplicates: true });
    }
  }
  console.log(`  ✓  ${writers.length} songwriters with catalog credits`);
}

// ── Genre metrics ─────────────────────────────────────────────────────────────
// Multi-country UGC / playlist / airplay metrics so the Genre Breakout Radar
// shows data and its region dropdown offers more than one market.
async function seedGenreMetrics() {
  const genres = ['Pop', 'Hip-Hop', 'Afrobeats', 'K-Pop', 'Latin'];
  const countries = ['US', 'GB', 'BR', 'KR'];

  for (const [gi, genre] of genres.entries()) {
    await db.ugcGenreMetrics.upsert({
      where: { genre_code2_date: { genre, code2: 'GLOBAL', date: utcTodayDate() } },
      update: {},
      create: {
        genre,
        code2: 'GLOBAL',
        date: utcTodayDate(),
        videos7d: 5_000 + gi * 1_500,
        videos7dGrowth: 30 + gi * 12,
        views7d: BigInt((8_000_000 + gi * 2_000_000)),
        views7dGrowth: 40 + gi * 10,
        leadCountry: countries[gi % countries.length],
      },
    });

    for (const [ci, country] of countries.entries()) {
      await db.genrePlaylistMetrics.upsert({
        where: {
          genre_country_date_playlistType: {
            genre,
            country,
            date: utcTodayDate(),
            playlistType: 'editorial',
          },
        },
        update: {},
        create: {
          genre,
          country,
          date: utcTodayDate(),
          playlistType: 'editorial',
          streams7d: BigInt((2_000_000 + gi * 500_000) * (ci + 1)),
          streams7dGrowth: 15 + gi * 8 - ci * 3,
          adds7d: 40 + gi * 10,
        },
      });
    }

    // US + GB radio airplay so the "home market" airplay column has data.
    for (const country of ['US', 'GB']) {
      await db.genreAirplayMetrics.upsert({
        where: {
          genre_country_date_formatId: {
            genre,
            country,
            date: utcTodayDate(),
            formatId: 'CHR',
          },
        },
        update: {},
        create: {
          genre,
          country,
          date: utcTodayDate(),
          formatId: 'CHR',
          spins7d: 1_200 + gi * 200,
          spins7dGrowth: 10 + gi * 5,
          audience7d: BigInt((5_000_000 + gi * 1_000_000)),
        },
      });
    }
  }
  console.log(`  ✓  genre metrics for ${genres.length} genres × ${countries.length} markets`);
}

// Provision the workspace admin so a clean database is immediately usable
// behind auth. Password comes from SEED_ADMIN_PASSWORD; without it, no user
// is created (and a note is printed) so no known-default credential ever
// ships to production.
async function seedAdminUser() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@workspace.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    console.log('  ⚠  SEED_ADMIN_PASSWORD not set — skipping admin user. Create one with:');
    console.log('     npx tsx scripts/create-user.ts you@company.com <password> ADMIN');
    return;
  }

  const { hashPassword } = await import('@/lib/auth/password');
  const slug = process.env.UI_TENANT_SLUG ?? 'workspace';

  const tenant = await db.tenant.upsert({
    where: { slug },
    update: {},
    create: { name: 'Workspace', slug, environment: 'PROD' },
  });

  await db.tenantUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: { passwordHash: hashPassword(password), role: 'ADMIN' },
    create: {
      tenantId: tenant.id,
      email,
      role: 'ADMIN',
      passwordHash: hashPassword(password),
    },
  });

  console.log(`  ✓  Admin user ready: ${email}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
