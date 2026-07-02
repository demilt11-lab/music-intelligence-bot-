// jobs/etl/genres.ts
//
// Aggregates per-genre momentum metrics for the genre breakout detector:
//   UgcGenreMetrics      <- UgcTrackMetrics (TikTok UGC)
//   GenrePlaylistMetrics <- TrackPlatformStatsDaily (Spotify streams/adds,
//                           with YouTube views-gained as the volume fallback
//                           via lib/features/streaming-volume)
//   GenreAirplayMetrics  <- LuminateAirplay (US radio)
//
// A track's genre comes from real associations only: TrackTag(category=genre)
// first, then TrackTrendLabel.genre. Tracks without either are grouped under
// 'Unknown' so totals remain traceable instead of silently dropped.
import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';
import { loadStreamingVolumeByTrack } from '@/lib/features/streaming-volume';

const GLOBAL = 'GLOBAL';
const ALL_FORMATS = 'ALL';
const SEP = '::';

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

export async function runGenreEtl(referenceDate?: string): Promise<{ rowsWritten: number }> {
  const today = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(today.getTime())) {
    throw new Error(`Invalid reference date: ${referenceDate}`);
  }
  const date = utcDateOnly(today);
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setUTCDate(date.getUTCDate() - 7);
  const fourteenDaysAgo = new Date(sevenDaysAgo);
  fourteenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const ugcRows = await aggregateUgcGenre(date);
  const playlistRows = await aggregatePlaylistGenre(date, sevenDaysAgo, fourteenDaysAgo);
  const airplayRows = await aggregateAirplayGenre(date, sevenDaysAgo, fourteenDaysAgo);

  return { rowsWritten: ugcRows + playlistRows + airplayRows };
}

/** UGC: roll UgcTrackMetrics (already 7d windows) up to genre level. */
async function aggregateUgcGenre(date: Date): Promise<number> {
  const ugc = await db.ugcTrackMetrics.findMany({ where: { date } });
  if (!ugc.length) {
    console.log('[genre-etl] no UgcTrackMetrics for date - skipping UGC rollup');
    return 0;
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
  return byKey.size;
}

/** Spotify streams + playlist adds per genre over the trailing 7 days. */
async function aggregatePlaylistGenre(
  date: Date,
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
): Promise<number> {
  // Streaming volume per track (Spotify streams preferred, YouTube
  // views-gained fallback) so the rollup works from live sources.
  const [currentVolume, previousVolume] = await Promise.all([
    loadStreamingVolumeByTrack(sevenDaysAgo, date),
    loadStreamingVolumeByTrack(fourteenDaysAgo, sevenDaysAgo),
  ]);

  // Playlist adds remain Spotify-only (no other source reports them).
  const addsWindow = async (gte: Date, lt: Date) =>
    db.trackPlatformStatsDaily.groupBy({
      by: ['trackId'],
      where: { platform: 'spotify', date: { gte, lt } },
      _sum: { playlistAdds: true },
    });
  const [currentAdds, previousAdds] = await Promise.all([
    addsWindow(sevenDaysAgo, date),
    addsWindow(fourteenDaysAgo, sevenDaysAgo),
  ]);
  const addsByTrackCurr = new Map(currentAdds.map((r) => [r.trackId, Number(r._sum.playlistAdds ?? 0n)]));
  const addsByTrackPrev = new Map(previousAdds.map((r) => [r.trackId, Number(r._sum.playlistAdds ?? 0n)]));

  if (currentVolume.size === 0) {
    console.log('[genre-etl] no spotify/youtube daily stats in window - skipping playlist rollup');
    return 0;
  }

  const genreByTrack = await loadTrackGenres([...currentVolume.keys()]);

  type Agg = { streams: bigint; adds: number };
  const sumByGenre = (
    volume: Map<number, number>,
    adds: Map<number, number>,
  ): Map<string, Agg> => {
    const m = new Map<string, Agg>();
    for (const [trackId, vol] of volume) {
      const genre = genreByTrack.get(trackId) ?? 'Unknown';
      const agg = m.get(genre) ?? { streams: 0n, adds: 0 };
      agg.streams += BigInt(Math.round(vol));
      agg.adds += adds.get(trackId) ?? 0;
      m.set(genre, agg);
    }
    return m;
  };

  const currByGenre = sumByGenre(currentVolume, addsByTrackCurr);
  const prevByGenre = sumByGenre(previousVolume, addsByTrackPrev);

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
  return currByGenre.size;
}

/** US radio spins/audience per genre from Luminate airplay facts. */
async function aggregateAirplayGenre(
  date: Date,
  sevenDaysAgo: Date,
  fourteenDaysAgo: Date,
): Promise<number> {
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
    return 0;
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
  return currByKey.size;
}

if (require.main === module) {
  runTrackedJob('etl:genres', () => runGenreEtl(process.argv[2]))
    .then(({ rowsWritten }) => {
      console.log(`Genre ETL complete (${rowsWritten} rows)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
