// lib/writersProducers/service.ts
import { db } from '@/lib/db';
import {
  WriterProducerResult,
  Collaboration,
  PlaylistAppearance,
  ChartPosition,
  RisingTalentEntry,
  ALL_CREATOR_ROLES,
  WRITER_ROLES,
  PRODUCER_ROLES,
  CreatorType,
  WriterProducerRole,
} from './types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function inferCreatorType(roles: WriterProducerRole[]): CreatorType {
  const hasWriter = roles.some((r) => (WRITER_ROLES as string[]).includes(r));
  const hasProducer = roles.some((r) => (PRODUCER_ROLES as string[]).includes(r));
  if (hasWriter && hasProducer) return 'both';
  if (hasProducer) return 'producer';
  return 'writer';
}

function bigintToStr(v: bigint | null | undefined): string | null {
  return v == null ? null : String(v);
}

// ─── playlist & chart hydration ──────────────────────────────────────────────

async function getPlaylistsForTrack(trackId: number): Promise<PlaylistAppearance[]> {
  const rows = await db.playlistTrack.findMany({
    where: { trackId },
    include: {
      playlist: {
        select: {
          id: true,
          name: true,
          platform: true,
          followerCount: true,
          isOfficial: true,
        },
      },
    },
    orderBy: { addedAt: 'desc' },
    take: 10,
  });

  return rows.map((r) => ({
    playlistId: r.playlist.id,
    playlistName: r.playlist.name,
    platform: r.playlist.platform,
    followerCount: bigintToStr(r.playlist.followerCount),
    isOfficial: r.playlist.isOfficial,
    trackPosition: r.position,
    addedAt: r.addedAt?.toISOString() ?? null,
  }));
}

async function getChartPositionsForTrack(trackId: number): Promise<ChartPosition[]> {
  const rows = await db.chartRow.findMany({
    where: { trackId },
    include: { snapshot: { select: { chartName: true, platform: true, snapshotDate: true } } },
    orderBy: { snapshot: { snapshotDate: 'desc' } },
    take: 10,
  });

  return rows.map((r) => ({
    chartType: r.snapshot.chartName,
    platform: r.snapshot.platform ?? 'unknown',
    rank: r.rank,
    peakRank: r.peakRank,
    date: r.snapshot.snapshotDate.toISOString().split('T')[0],
  }));
}

async function buildCollaborations(
  songwriterId: number,
  limit: number,
): Promise<Collaboration[]> {
  const links = await db.songwriterTrack.findMany({
    where: { songwriterId },
    include: {
      track: {
        include: {
          trackArtists: {
            include: { artist: { select: { id: true, name: true } } },
          },
          statisticsLatest: true,
        },
      },
    },
    take: limit,
    orderBy: { track: { popularity: 'desc' } },
  });

  const collabs: Collaboration[] = [];

  for (const link of links) {
    const t = link.track;

    const coCreators = t.trackArtists
      .filter((ta) => ta.artistId !== songwriterId)
      .map((ta) => ({
        id: ta.artist.id,
        name: ta.artist.name,
        role: ta.role,
      }));

    const [playlists, chartPositions] = await Promise.all([
      getPlaylistsForTrack(t.id),
      getChartPositionsForTrack(t.id),
    ]);

    collabs.push({
      trackId: t.id,
      trackTitle: t.title,
      isrc: t.isrc,
      releaseDate: t.releaseDate?.toISOString().split('T')[0] ?? null,
      coCreators,
      playlists,
      chartPositions,
      totalStreams: bigintToStr(t.statisticsLatest?.totalStreams ?? null),
      tiktokViews: bigintToStr(t.statisticsLatest?.tiktokCreations ?? null),
      youtubeViews: bigintToStr(t.statisticsLatest?.youtubeViews ?? null),
    });
  }

  return collabs;
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function searchWritersProducers(opts: {
  q: string;
  type: 'writer' | 'producer' | 'both' | 'all';
  limit: number;
  offset: number;
}): Promise<WriterProducerResult[]> {
  const { q, type, limit, offset } = opts;

  const roleFilter =
    type === 'writer'
      ? WRITER_ROLES
      : type === 'producer'
        ? PRODUCER_ROLES
        : ALL_CREATOR_ROLES;

  // Query songwriters table
  const rows = await db.songwriter.findMany({
    where: {
      name: { contains: q.trim(), mode: 'insensitive' },
    },
    include: {
      tracks: {
        include: {
          track: {
            include: {
              trackArtists: {
                where: {
                  role: { in: roleFilter as string[] },
                },
                include: { artist: { select: { id: true, name: true } } },
              },
            },
          },
        },
        take: 5,
      },
      risingScores: {
        orderBy: { date: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
    take: limit,
    skip: offset,
  });

  // Also query artists tagged as producers (not in songwriter table)
  const producerArtists =
    type === 'writer'
      ? []
      : await db.artist.findMany({
          where: {
            name: { contains: q.trim(), mode: 'insensitive' },
            trackArtists: {
              some: { role: { in: PRODUCER_ROLES as string[] } },
            },
          },
          include: {
            trackArtists: {
              where: { role: { in: PRODUCER_ROLES as string[] } },
              include: {
                track: {
                  select: { id: true, title: true },
                },
              },
              take: 5,
            },
          },
          take: limit,
          skip: offset,
        });

  const results: WriterProducerResult[] = [];

  for (const sw of rows) {
    const rolesRaw = Array.from(
      new Set(sw.tracks.flatMap((st) => (st.role ? [st.role] : []))),
    ) as WriterProducerRole[];
    const roles: WriterProducerRole[] = rolesRaw.length ? rolesRaw : ['songwriter'];
    const latest = sw.risingScores[0];

    results.push({
      id: sw.id,
      name: sw.name,
      slug: sw.slug,
      ipi: sw.ipi,
      roles,
      creatorType: inferCreatorType(roles),
      trackCount: sw.tracks.length,
      recentCollaborations: [],
      risingScore: latest?.risingScore ?? null,
      isSigned: latest?.isSigned ?? false,
      signedLabel: latest?.signedLabel ?? null,
      region: latest?.region ?? null,
      source: 'database',
    });
  }

  for (const artist of producerArtists) {
    const alreadyIncluded = results.some(
      (r) => r.name.toLowerCase() === artist.name.toLowerCase(),
    );
    if (alreadyIncluded) continue;

    results.push({
      id: artist.id,
      name: artist.name,
      slug: artist.slug,
      ipi: null,
      roles: ['producer'],
      creatorType: 'producer',
      trackCount: artist.trackArtists.length,
      recentCollaborations: [],
      risingScore: null,
      isSigned: false,
      signedLabel: null,
      region: null,
      source: 'database',
    });
  }

  return results;
}

export async function getWriterProducerCollaborations(opts: {
  id: number;
  limit: number;
  offset: number;
}): Promise<{ id: number; name: string; collaborations: Collaboration[] }> {
  const sw = await db.songwriter.findUnique({
    where: { id: opts.id },
    select: { id: true, name: true },
  });

  if (!sw) {
    const err = new Error('Writer/producer not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }

  const collaborations = await buildCollaborations(opts.id, opts.limit);

  return { id: sw.id, name: sw.name, collaborations };
}

export async function getRisingWritersProducers(opts: {
  type: 'writer' | 'producer' | 'both' | 'all';
  region: string;
  unsignedOnly: boolean;
  limit: number;
  offset: number;
}): Promise<RisingTalentEntry[]> {
  const { type, region, unsignedOnly, limit, offset } = opts;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const scores = await db.writerProducerRisingScore.findMany({
    where: {
      date: { gte: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) },
      ...(region !== 'GLOBAL' ? { region } : {}),
      ...(unsignedOnly ? { isSigned: false } : {}),
    },
    orderBy: { risingScore: 'desc' },
    take: limit,
    skip: offset,
    include: {
      songwriter: {
        include: {
          tracks: {
            include: {
              track: {
                include: {
                  trackArtists: {
                    include: { artist: { select: { id: true, name: true } } },
                    orderBy: { position: 'asc' },
                  },
                  statisticsLatest: true,
                  playlistTracks: {
                    include: { playlist: { select: { name: true, isOfficial: true } } },
                    orderBy: {
                      playlist: { followerCount: 'desc' },
                    },
                    take: 1,
                  },
                  chartRows: {
                    orderBy: { rank: 'asc' },
                    take: 1,
                    select: { rank: true },
                  },
                },
              },
            },
            orderBy: { track: { popularity: 'desc' } },
            take: 3,
          },
        },
      },
    },
  });

  return scores.map((s) => {
    const sw = s.songwriter;
    const rolesRaw = Array.from(
      new Set(sw.tracks.flatMap((st) => (st.role ? [st.role] : []))),
    ) as WriterProducerRole[];
    const roles: WriterProducerRole[] = rolesRaw.length ? rolesRaw : ['songwriter'];
    const creatorType = inferCreatorType(roles);

    if (type !== 'all' && type !== 'both') {
      if (type === 'writer' && creatorType === 'producer') return null;
      if (type === 'producer' && creatorType === 'writer') return null;
    }

    const topTracks = sw.tracks.map((st) => {
      const t = st.track;
      return {
        trackId: t.id,
        title: t.title,
        artists: t.trackArtists.map((ta) => ta.artist.name),
        topPlaylist: t.playlistTracks[0]?.playlist.name ?? null,
        chartRank: t.chartRows[0]?.rank ?? null,
        streams7d: bigintToStr(t.statisticsLatest?.totalStreams ?? null),
      };
    });

    const notableCollaborators = Array.from(
      new Set(
        sw.tracks.flatMap((st) =>
          st.track.trackArtists
            .filter((ta) => ta.artistId !== sw.id)
            .map((ta) => ta.artist.name),
        ),
      ),
    ).slice(0, 5);

    return {
      songwriterId: s.songwriterId,
      name: sw.name,
      slug: sw.slug,
      creatorType,
      risingScore: s.risingScore,
      streamVelocity: s.streamVelocity,
      playlistMomentum: s.playlistMomentum,
      collaborationScore: s.collaborationScore,
      ugcMomentum: s.ugcMomentum,
      isSigned: s.isSigned,
      signedLabel: s.signedLabel,
      region: s.region ?? 'GLOBAL',
      topTracks,
      notableCollaborators,
    } satisfies RisingTalentEntry;
  }).filter(Boolean) as RisingTalentEntry[];
}
