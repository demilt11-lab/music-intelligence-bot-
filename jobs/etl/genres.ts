// jobs/etl/genres.ts

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

export async function runGenreEtl(referenceDate?: string) {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setUTCDate(date.getUTCDate() - 7);
  const prevSevenDaysAgo = new Date(sevenDaysAgo);
  prevSevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  await aggregateUgcGenre(date, sevenDaysAgo, prevSevenDaysAgo);
  await aggregatePlaylistGenre(date, sevenDaysAgo, prevSevenDaysAgo);
  await aggregateAirplayGenre(date, sevenDaysAgo, prevSevenDaysAgo);
}

/**
 * Aggregate UGC into UgcGenreMetrics from UgcTrackMetrics + track genres.
 */
async function aggregateUgcGenre(
  date: Date,
  sevenDaysAgo: Date,
  prevSevenDaysAgo: Date,
) {
  // Join UgcTrackMetrics with track genres
  const ugc = await db.ugcTrackMetrics.findMany({
    where: {
      date,
    },
    include: {
      track: true, // assumes relation UgcTrackMetrics.track -> tracks
    },
  });

  const byGenreKey = new Map<
    string,
    { videos: number; views: bigint; code2: string; leadCountry?: string }
  >();

  ugc.forEach((row) => {
    const genre = row.track.primary_genre ?? 'Unknown';
    const key = `${genre}:${row.code2}`;
    const existing = byGenreKey.get(key) ?? {
      videos: 0,
      views: 0n,
      code2: row.code2,
      leadCountry: row.code2,
    };
    existing.videos += row.videos7d;
    existing.views += row.views7d;
    byGenreKey.set(key, existing);
  });

  // For growth, you can re-run aggregate for previous window or store previous UgcGenreMetrics

  for (const [key, agg] of byGenreKey.entries()) {
    const [genre, code2] = key.split(':');
    // Fetch previous metric for growth
    const prev = await db.ugcGenreMetrics.findFirst({
      where: {
        genre,
        code2,
        date: sevenDaysAgo,
      },
    });

    const videosPrev = prev?.videos7d ?? 0;
    const viewsPrev = prev?.views7d ?? 0n;

    const videosGrowth =
      videosPrev > 0 ? ((agg.videos - videosPrev) / videosPrev) * 100 : 0;
    const viewsGrowth =
      Number(viewsPrev) > 0
        ? ((Number(agg.views - viewsPrev) / Number(viewsPrev)) * 100)
        : 0;

    await db.ugcGenreMetrics.upsert({
      where: {
        genre_code2_date: {
          genre,
          code2,
          date,
        },
      },
      update: {
        videos7d: agg.videos,
        videos7dGrowth: videosGrowth,
        views7d: agg.views,
        views7dGrowth: viewsGrowth,
        leadCountry: agg.leadCountry,
      },
      create: {
        genre,
        code2,
        date,
        videos7d: agg.videos,
        videos7dGrowth: videosGrowth,
        views7d: agg.views,
        views7dGrowth: viewsGrowth,
        leadCountry: agg.leadCountry,
      },
    });
  }
}

/**
 * Aggregate playlist/streaming into GenrePlaylistMetrics.
 * Assumes track_platform_stats_daily + track.genre metadata.
 */
async function aggregatePlaylistGenre(
  date: Date,
  sevenDaysAgo: Date,
  prevSevenDaysAgo: Date,
) {
  const daily = await db.track_platform_stats_daily.findMany({
    where: {
      date: {
        gte: sevenDaysAgo,
        lt: date,
      },
      platform: 'spotify',
    },
    include: {
      track: true,
    },
  });

  const byKey = new Map<
    string,
    { streams: bigint; adds: number; genre: string; country: string; playlistType: string }
  >();

  daily.forEach((row) => {
    const genre = row.track.primary_genre ?? 'Unknown';
    const country = row.code2 ?? 'GLOBAL';
    const playlistType = row.playlist_type ?? 'unknown';
    const key = `${genre}:${country}:${playlistType}`;
    const existing = byKey.get(key) ?? {
      streams: 0n,
      adds: 0,
      genre,
      country,
      playlistType,
    };
    existing.streams += BigInt(row.streams ?? 0n);
    existing.adds += row.playlist_adds ?? 0;
    byKey.set(key, existing);
  });

  for (const [key, agg] of byKey.entries()) {
    const [genre, country, playlistType] = key.split(':');

    const prev = await db.genrePlaylistMetrics.findFirst({
      where: {
        genre,
        country,
        playlistType,
        date: sevenDaysAgo,
      },
    });

    const prevStreams = prev?.streams7d ?? 0n;

    const streamsGrowth =
      Number(prevStreams) > 0
        ? ((Number(agg.streams - prevStreams) / Number(prevStreams)) * 100)
        : 0;

    await db.genrePlaylistMetrics.upsert({
      where: {
        genre_country_date_playlistType: {
          genre,
          country,
          date,
          playlistType,
        },
      },
      update: {
        streams7d: agg.streams,
        streams7dGrowth: streamsGrowth,
        adds7d: agg.adds,
      },
      create: {
        genre,
        country,
        date,
        playlistType,
        streams7d: agg.streams,
        streams7dGrowth: streamsGrowth,
        adds7d: agg.adds,
      },
    });
  }
}

/**
 * Aggregate Luminate airplay into GenreAirplayMetrics.
 */
async function aggregateAirplayGenre(
  date: Date,
  sevenDaysAgo: Date,
  prevSevenDaysAgo: Date,
) {
  const airplay = await db.luminateAirplay.findMany({
    where: {
      date: {
        gte: sevenDaysAgo,
        lt: date,
      },
      locationId: 'US',
    },
    include: {
      track: true,
    },
  });

  const byKey = new Map<
    string,
    { genre: string; country: string; formatId: string | null; spins: number; audience: bigint }
  >();

  airplay.forEach((row) => {
    const genre = row.track.primary_genre ?? 'Unknown';
    const country = 'US';
    const formatId = row.formatId ?? 'ALL';
    const key = `${genre}:${country}:${formatId}`;
    const existing = byKey.get(key) ?? {
      genre,
      country,
      formatId,
      spins: 0,
      audience: 0n,
    };
    existing.spins += Number(row.spins ?? 0);
    existing.audience += BigInt(row.audience ?? 0n);
    byKey.set(key, existing);
  });

  for (const [key, agg] of byKey.entries()) {
    const [genre, country, formatId] = key.split(':');

    const prev = await db.genreAirplayMetrics.findFirst({
      where: {
        genre,
        country,
        formatId: formatId === 'ALL' ? null : formatId,
        date: sevenDaysAgo,
      },
    });

    const prevSpins = prev?.spins7d ?? 0;

    const spinsGrowth =
      prevSpins > 0 ? ((agg.spins - prevSpins) / prevSpins) * 100 : 0;

    await db.genreAirplayMetrics.upsert({
      where: {
        genre_country_date_formatId: {
          genre,
          country,
          date,
          formatId: formatId === 'ALL' ? null : formatId,
        },
      },
      update: {
        spins7d: agg.spins,
        spins7dGrowth: spinsGrowth,
        audience7d: agg.audience,
      },
      create: {
        genre,
        country,
        date,
        formatId: formatId === 'ALL' ? null : formatId,
        spins7d: agg.spins,
        spins7dGrowth: spinsGrowth,
        audience7d: agg.audience,
      },
    });
  }
}
