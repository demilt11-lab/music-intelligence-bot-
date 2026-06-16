// jobs/etl/genres.ts
//
// Aggregates per-genre momentum metrics for the genre breakout detector:
//   UgcGenreMetrics      <- UgcTrackMetrics (TikTok UGC)
//   GenrePlaylistMetrics <- ChartRow/ChartSnapshot, Spotify per-market charts
//                           (playlistType='chart' — see aggregateChartGenre)
//                        <- TrackPlatformStatsDaily Spotify streams/adds
//                           (playlistType='all' — see BUG-005: dormant today,
//                           since no ingest job writes platform='spotify' rows
//                           to that table; left in place so it activates on
//                           its own if real per-track streaming volume ever
//                           starts flowing there)
//   GenreAirplayMetrics  <- LuminateAirplay (US radio)
//
// A track's genre comes from real associations only: TrackTag(category=genre)
// first, then TrackTrendLabel.genre. Tracks without either are grouped under
// 'Unknown' so totals remain traceable instead of silently dropped.
import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';

const GLOBAL = 'GLOBAL';
const ALL_FORMATS = 'ALL';
const SEP = '::';

// Search-based chart ingestion (jobs/ingest/spotify.ts) never sets
// ChartRow.streamsToday, so true stream volume isn't available from charts —
// presence and rank are. CHART_DEPTH caps the inverse-rank weight so a rank-1
// finish on a top-50 chart scores 50 and a rank-50 finish scores 1.
const CHART_DEPTH = 50;

export function chartRankWeight(rank: number, depth: number = CHART_DEPTH): number {
  return Math.max(0, depth + 1 - rank);
}

export function normalizeChartCountry(code: string | null): string {
  return (code ?? GLOBAL).toUpperCase();
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function pctGrowthNum(curr: number, prev: number): number {
  if (prev <= 0) return 0;
  return ((curr - prev) / prev) * 100;
}

function pctGrowthBig(curr: bigint, prev: bigint): number {
  if (prev <= 0n) return 0;
  return Number(((curr - prev) * 10_000n) / prev) / 100;
}

/** Map trackId -> genre using TrackTag(category='genre'), then TrackTrendLabel. */
async function loadTrackGenres(trackIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!trackIds.length) return out;

  const tagged = await db.trackTag.findMany({
    where: {
      trackId: { in: trackIds },
      tag: { category: 'genre' },
    },
    include: { tag: true },
  });
  for (const t of tagged) {
    if (!out.has(t.trackId)) out.set(t.trackId, t.tag.name);
  }

  const remaining = trackIds.filter((id) => !out.has(id));
  if (remaining.length) {
    const labels = await db.trackTrendLabel.findMany({
      where: { trackId: { in: remaining }, genre: { not: null } },
      select: { trackId: true, genre: true },
    });
    for (const l of labels) {
      if (l.genre && !out.has(l.trackId)) out.set(l.trackId, l.genre);
    }
  }

  return out;
}

export async function runGenreEtl(referenceDate?: string) {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error(`Invalid reference date: ${referenceDate}`);
  }
  const date = utcDateOnly(today);
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setUTCDate(date.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(sevenDaysAgo);
  fourteenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  await aggregateUgcGenre(date);
  await aggregatePlaylistGenre(date, sevenDaysAgo, fourteenDaysAgo);
  await aggregateChartGenre(date, sevenDaysAgo, fourteenDaysAgo);
  await aggregateAirplayGenre(date, sevenDaysAgo, fourteenDaysAgo);
}

/** UGC: roll UgcTrackMetrics (already 7d windows) up to genre level. */
async function aggregateUgcGenre(date: Date) {
  const ugc = await db.ugcTrackMetrics.findMany({ where: { date } });
  if (!ugc.length) {
    console.log('[genre-etl] no UgcTrackMetrics for date - skipping UGC rollup');
    return;
  }

  const genreByTrack = await loadTrackGenres(ugc.map((u) => u.trackId));

  const byKey = new Map<
    string,
    { genre: string; code2: string; videos: number; views: bigint }
  >();

  for (const row of ugc) {
    const genre = genreByTrack.get(row.trackId) ?? 'Unknown';
    const key = `${genre}${SEP}${row.code2}`;
    const agg = byKey.get(key) ?? { genre, code2: row.code2, videos: 0, views: 0n };
    agg.videos += row.videos7d;
    agg.views += row.views7d;
    byKey.set(key, agg);
  }

  const prevDate = new Date(date);
  prevDate.setUTCDate(prevDate.getUTCDate() - 7);

  for (const agg of byKey.values()) {
    const prev = await db.ugcGenreMetrics.findFirst({
      where: { genre: agg.genre, code2: agg.code2, date: prevDate },
    });

    const data = {
      videos7d: agg.videos,
      videos7dGrowth: pctGrowthNum(agg.videos, prev?.videos7d ?? 0),
      views7d: agg.views,
      views7dGrowth: pctGrowthBig(agg.views, prev?.views7d ?? 0n),
      leadCountry: agg.code2 === GLOBAL ? null : agg.code2,
    };

    await db.ugcGenreMetrics.upsert({
      where: {
        genre_code2_date: { genre: agg.genre, code2: agg.code2, date },
      },
      update: data,
      create: { genre: agg.genre, code2: agg.code2, date, ...data },
    });
  }

  console.log(`[genre-etl] UGC rollup wrote ${byKey.size} genre rows`);
}

/** Spotify streams + playlist adds per genre over the trailing 7 days. */
async function aggregatePlaylistGenre(
  date: Date,
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
) {
  const window = async (gte: Date, lt: Date) =>
    db.trackPlatformStatsDaily.groupBy({
      by: ['trackId'],
      where: { platform: 'spotify', date: { gte, lt } },
      _sum: { streams: true, playlistAdds: true },
    });

  const [current, previous] = await Promise.all([
    window(sevenDaysAgo, date),
    window(fourteenDaysAgo, sevenDaysAgo),
  ]);

  if (!current.length) {
    console.log('[genre-etl] no spotify daily stats in window - skipping playlist rollup');
    return;
  }

  const genreByTrack = await loadTrackGenres(current.map((r) => r.trackId));

  type Agg = { streams: bigint; adds: number };
  const sumByGenre = (rows: typeof current): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const genre = genreByTrack.get(r.trackId) ?? 'Unknown';
      const agg = m.get(genre) ?? { streams: 0n, adds: 0 };
      agg.streams += r._sum.streams ?? 0n;
      agg.adds += Number(r._sum.playlistAdds ?? 0n);
      m.set(genre, agg);
    }
    return m;
  };

  const currByGenre = sumByGenre(current);
  const prevByGenre = sumByGenre(previous);

  // TrackPlatformStatsDaily has no per-country split - aggregate as GLOBAL.
  for (const [genre, agg] of currByGenre.entries()) {
    const prev = prevByGenre.get(genre);

    const data = {
      streams7d: agg.streams,
      streams7dGrowth: pctGrowthBig(agg.streams, prev?.streams ?? 0n),
      adds7d: agg.adds,
    };

    await db.genrePlaylistMetrics.upsert({
      where: {
        genre_country_date_playlistType: {
          genre,
          country: GLOBAL,
          date,
          playlistType: 'all',
        },
      },
      update: data,
      create: { genre, country: GLOBAL, date, playlistType: 'all', ...data },
    });
  }

  console.log(`[genre-etl] playlist rollup wrote ${currByGenre.size} genre rows`);
}

/**
 * Spotify per-market chart presence, rolled up to genre level. This is the
 * Spotify-derived source that actually has data flowing today (BUG-005):
 * jobs/ingest/spotify.ts's ingestTopCharts() writes ChartSnapshot/ChartRow
 * per market via search-based ingestion, independent of the dormant
 * TrackPlatformStatsDaily(platform='spotify') path above.
 */
async function aggregateChartGenre(
  date: Date,
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
) {
  const loadWindow = (gte: Date, lt: Date) =>
    db.chartRow.findMany({
      where: { snapshot: { platform: 'spotify', snapshotDate: { gte, lt } } },
      select: {
        trackId: true,
        rank: true,
        snapshot: { select: { countryCode: true } },
      },
    });

  const [current, previous] = await Promise.all([
    loadWindow(sevenDaysAgo, date),
    loadWindow(fourteenDaysAgo, sevenDaysAgo),
  ]);

  if (!current.length) {
    console.log('[genre-etl] no Spotify chart rows in window - skipping chart rollup');
    return;
  }

  const genreByTrack = await loadTrackGenres(
    Array.from(new Set(current.map((r) => r.trackId))),
  );

  type Agg = { genre: string; country: string; tracks: Set<number>; weight: number };
  const sumRows = (rows: typeof current): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const genre = genreByTrack.get(r.trackId) ?? 'Unknown';
      const country = normalizeChartCountry(r.snapshot.countryCode);
      const key = `${genre}${SEP}${country}`;
      const agg = m.get(key) ?? { genre, country, tracks: new Set<number>(), weight: 0 };
      agg.tracks.add(r.trackId);
      agg.weight += chartRankWeight(r.rank);
      m.set(key, agg);
    }
    return m;
  };

  const currByKey = sumRows(current);
  const prevByKey = sumRows(previous);

  for (const [key, agg] of currByKey.entries()) {
    const prev = prevByKey.get(key);

    const data = {
      streams7d: BigInt(Math.round(agg.weight)),
      streams7dGrowth: pctGrowthNum(agg.weight, prev?.weight ?? 0),
      adds7d: agg.tracks.size,
    };

    await db.genrePlaylistMetrics.upsert({
      where: {
        genre_country_date_playlistType: {
          genre: agg.genre,
          country: agg.country,
          date,
          playlistType: 'chart',
        },
      },
      update: data,
      create: { genre: agg.genre, country: agg.country, date, playlistType: 'chart', ...data },
    });
  }

  console.log(`[genre-etl] chart rollup wrote ${currByKey.size} genre rows`);
}

/** US radio spins/audience per genre from Luminate airplay facts. */
async function aggregateAirplayGenre(
  date: Date,
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
) {
  const loadWindow = (gte: Date, lt: Date) =>
    db.luminateAirplay.findMany({
      where: {
        entityType: 'track',
        date: { gte, lt },
        locationId: 'US',
      },
      select: { entityId: true, spins: true, audience: true, formatId: true },
    });

  const [current, previous] = await Promise.all([
    loadWindow(sevenDaysAgo, date),
    loadWindow(fourteenDaysAgo, sevenDaysAgo),
  ]);

  if (!current.length) {
    console.log('[genre-etl] no Luminate airplay in window - skipping airplay rollup');
    return;
  }

  const genreByTrack = await loadTrackGenres(
    Array.from(new Set(current.map((r) => r.entityId))),
  );

  type Agg = { genre: string; formatId: string; spins: number; audience: bigint };
  const sumRows = (rows: typeof current): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const genre = genreByTrack.get(r.entityId) ?? 'Unknown';
      const formatId = r.formatId ?? ALL_FORMATS;
      const key = `${genre}${SEP}${formatId}`;
      const agg = m.get(key) ?? { genre, formatId, spins: 0, audience: 0n };
      agg.spins += Number(r.spins ?? 0);
      agg.audience += BigInt(Math.round(Number(r.audience ?? 0)));
      m.set(key, agg);
    }
    return m;
  };

  const currByKey = sumRows(current);
  const prevByKey = sumRows(previous);

  for (const [key, agg] of currByKey.entries()) {
    const prev = prevByKey.get(key);

    const data = {
      spins7d: agg.spins,
      spins7dGrowth: pctGrowthNum(agg.spins, prev?.spins ?? 0),
      audience7d: agg.audience,
    };

    await db.genreAirplayMetrics.upsert({
      where: {
        genre_country_date_formatId: {
          genre: agg.genre,
          country: 'US',
          date,
          formatId: agg.formatId,
        },
      },
      update: data,
      create: { genre: agg.genre, country: 'US', date, formatId: agg.formatId, ...data },
    });
  }

  console.log(`[genre-etl] airplay rollup wrote ${currByKey.size} genre rows`);
}

if (require.main === module) {
  runTrackedJob('etl:genres', () => runGenreEtl(process.argv[2]))
    .then(() => {
      console.log('Genre ETL complete');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
