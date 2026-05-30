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
  console.log('');
  console.log('✅  Seed complete. Test your endpoints:');
  console.log('   GET /api/integrations/internal/radios');
  console.log('   GET /api/integrations
