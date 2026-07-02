// lib/integrations/soundcharts/connector.ts

import {
  SoundchartsClient,
  ApiEnvelope,
  PaginatedParams,
  DateWindowParams,
} from './client';
import { soundchartsRoutes } from './routes';

export class SoundchartsConnector {
  constructor(private readonly client: SoundchartsClient) {}

  // RADIO ----------------------------------------------------------------

  // POST /api/v2/top/radios [page:1]
  async getRadios(body: {
    offset?: number;
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    filters?: Record<string, unknown>;
  } = {}) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.radio.top, {
      method: 'POST',
      body,
    });
  }

  // GET /api/v2/radio/{slug}/live-feed [page:17]
  async getRadioLiveFeed(slug: string, params: DateWindowParams & PaginatedParams = {}) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.radio.liveFeed(slug), {
      query: {
        startDate: params.startDate,
        endDate: params.endDate,
        offset: params.offset ?? 0,
        limit: params.limit ?? 100,
      },
    });
  }

  // GET /api/v2/radio/{slug}/identifiers [page:18]
  async getRadioIdentifiers(
    slug: string,
    params: PaginatedParams & { platform?: string } = {},
  ) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.radio.identifiers(slug), {
      query: {
        platform: params.platform,
        offset: params.offset ?? 0,
        limit: params.limit ?? 100,
      },
    });
  }

  // PUBLISHERS -----------------------------------------------------------

  // GET /api/v2/publisher/{uuid} [page:19]
  async getPublisherMetadata(uuid: string) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.publisher.metadata(uuid));
  }

  // GET /api/v2/publisher/by-ipi/{ipi} [page:20]
  async getPublisherByIpi(ipi: string) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.publisher.byIpi(ipi));
  }

  // GET /api/v2/publisher/by-platform/{platform}/{identifier} [page:21]
  async getPublisherByPlatformId(platform: string, identifier: string) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.publisher.byPlatform(platform, identifier),
    );
  }

  // GET /api/v2/publisher/{uuid}/identifiers [page:22]
  async getPublisherIdentifiers(
    uuid: string,
    params: PaginatedParams & { platform?: string } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.publisher.identifiers(uuid),
      {
        query: {
          platform: params.platform,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // ARTISTS ----------------------------------------------------------------

  // GET /api/v2/artist/by-platform/{platform}/{identifier}
  // Resolves a platform-native artist ID (e.g. a Spotify artist ID) to the
  // Soundcharts artist object (incl. its UUID).
  async getArtistByPlatformId(platform: string, identifier: string) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.artist.byPlatform(platform, identifier),
    );
  }

  // GET /api/v2/artist/{uuid}/audience/{platform}
  // Social/streaming audience time series (e.g. followers) per platform.
  async getArtistAudience(
    uuid: string,
    platform: string,
    params: DateWindowParams & PaginatedParams = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.artist.audience(uuid, platform),
      {
        query: {
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // GET /api/v2/artist/{uuid}/streaming/{platform}
  // Streaming listening time series — for platform='spotify' this is the
  // monthly-listeners series (the artist-level analogue of
  // getSongLocalStreamingAudience below).
  async getArtistLocalStreamingAudience(
    uuid: string,
    platform: string,
    params: DateWindowParams & PaginatedParams = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.artist.localStreaming(uuid, platform),
      {
        query: {
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // SONG: LOOKUP -----------------------------------------------------------

  // GET /api/v2/song/by-isrc/{isrc}
  // Resolves an ISRC to the Soundcharts song object (incl. its UUID).
  async getSongByIsrc(isrc: string) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.song.byIsrc(isrc));
  }

  // SONG: CHARTS ---------------------------------------------------------

  // GET /api/v2/song/{uuid}/charts/ranks/{platform} [page:23]
  async getSongChartEntries(
    uuid: string,
    platform: string,
    params: PaginatedParams & {
      currentOnly?: 0 | 1;
      sortBy?: 'position' | 'rankDate';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.chartEntries(uuid, platform),
      {
        query: {
          currentOnly: params.currentOnly ?? 1,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
          sortBy: params.sortBy ?? 'position',
          sortOrder: params.sortOrder ?? 'asc',
        },
      },
    );
  }

  // SONG: PLAYLISTS ------------------------------------------------------

  // GET /api/v2.20/song/{uuid}/playlist/current/{platform} [page:24]
  async getSongPlaylistEntries(
    uuid: string,
    platform: string,
    params: PaginatedParams & {
      type?:
        | 'all'
        | 'editorial'
        | 'algorithmic'
        | 'algotorial'
        | 'major'
        | 'charts'
        | 'curators_listeners'
        | 'radios'
        | 'this_is';
      currentOnly?: 0 | 1;
      countryCode?: string;
      playlistUuids?: string[];
      sortBy?: 'position' | 'positionDate' | 'entryDate' | 'subscriberCount';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.playlistEntries(uuid, platform),
      {
        query: {
          type: params.type ?? 'all',
          currentOnly: params.currentOnly ?? 1,
          countryCode: params.countryCode,
          playlistUuids: params.playlistUuids?.join(','),
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
          sortBy: params.sortBy ?? 'entryDate',
          sortOrder: params.sortOrder ?? 'desc',
        },
      },
    );
  }

  // GET /api/v2/song/{uuid}/playlist/reach/{platform} [page:25]
  async getSongPlaylistReach(
    uuid: string,
    platform: string,
    params: DateWindowParams &
      PaginatedParams & {
        type?: 'all' | 'editorial' | 'user' | 'algorithmic';
      } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.playlistReach(uuid, platform),
      {
        query: {
          type: params.type ?? 'all',
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // SONG: RADIO ----------------------------------------------------------

  // GET /api/v2/song/{uuid}/broadcasts [page:26]
  async getSongRadioBroadcasts(
    uuid: string,
    params: PaginatedParams & {
      radioSlugs?: string[];
      countryCode?: string;
      startDate?: string; // ATOM timestamp [page:26]
      endDate?: string; // ATOM timestamp
    } = {},
  ) {
    return this.client.request<ApiEnvelope>(soundchartsRoutes.song.broadcasts(uuid), {
      query: {
        radioSlugs: params.radioSlugs?.join(','),
        countryCode: params.countryCode,
        startDate: params.startDate,
        endDate: params.endDate,
        offset: params.offset ?? 0,
        limit: params.limit ?? 100,
      },
    });
  }

  // GET /api/v2/song/{uuid}/broadcast-groups [page:27]
  async getSongRadioSpinCount(
    uuid: string,
    params: PaginatedParams & {
      radioSlugs?: string[];
      countryCode?: string;
      startDate?: string; // YYYY-MM-DD [page:27]
      endDate?: string; // YYYY-MM-DD
    } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.broadcastGroups(uuid),
      {
        query: {
          radioSlugs: params.radioSlugs?.join(','),
          countryCode: params.countryCode,
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // SONG: AUDIENCE + LOCAL STREAMING ------------------------------------

  // GET /api/v2/song/{uuid}/audience/{platform} [page:28]
  async getSongAudience(
    uuid: string,
    platform: string,
    params: DateWindowParams & PaginatedParams & { identifier?: string } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.audience(uuid, platform),
      {
        query: {
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
          identifier: params.identifier,
        },
      },
    );
  }

  // GET /api/v2/song/{uuid}/streaming/{platform} [page:29]
  async getSongLocalStreamingAudience(
    uuid: string,
    platform: string,
    params: DateWindowParams & PaginatedParams = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.song.localStreaming(uuid, platform),
      {
        query: {
          startDate: params.startDate,
          endDate: params.endDate,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // CHARTS ---------------------------------------------------------------

  // GET /api/v2/chart/song/by-platform/{platform} [page:30]
  async getSongChartListByPlatform(
    platform: string,
    params: PaginatedParams & { countryCode?: string } = {},
  ) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.charts.songChartListByPlatform(platform),
      {
        query: {
          countryCode: params.countryCode,
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }

  // GET /api/v2/chart/tiktok/music/weekly/ranking/latest [page:31]
  async getTikTokMusicLinksRankingLatest(params: PaginatedParams = {}) {
    return this.client.request<ApiEnvelope>(
      soundchartsRoutes.charts.tikTokMusicLinksRankingLatest,
      {
        query: {
          offset: params.offset ?? 0,
          limit: params.limit ?? 100,
        },
      },
    );
  }
}
