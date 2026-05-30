// lib/integrations/soundcharts/routes.ts

export const soundchartsRoutes = {
  radio: {
    top: '/api/v2/top/radios', // discovery / A&R list [page:1]
    liveFeed: (slug: string) => `/api/v2/radio/${encodeURIComponent(slug)}/live-feed`, // [page:17]
    identifiers: (slug: string) => `/api/v2/radio/${encodeURIComponent(slug)}/identifiers`, // [page:18]
  },
  publisher: {
    metadata: (uuid: string) => `/api/v2/publisher/${encodeURIComponent(uuid)}`, // [page:19]
    byIpi: (ipi: string) => `/api/v2/publisher/by-ipi/${encodeURIComponent(ipi)}`, // [page:20]
    byPlatform: (platform: string, identifier: string) =>
      `/api/v2/publisher/by-platform/${encodeURIComponent(platform)}/${encodeURIComponent(
        identifier,
      )}`, // [page:21]
    identifiers: (uuid: string) => `/api/v2/publisher/${encodeURIComponent(uuid)}/identifiers`, // [page:22]
  },
  song: {
    chartEntries: (uuid: string, platform: string) =>
      `/api/v2/song/${encodeURIComponent(uuid)}/charts/ranks/${encodeURIComponent(platform)}`, // [page:23]
    playlistEntries: (uuid: string, platform: string) =>
      `/api/v2.20/song/${encodeURIComponent(uuid)}/playlist/current/${encodeURIComponent(
        platform,
      )}`, // [page:24]
    playlistReach: (uuid: string, platform: string) =>
      `/api/v2/song/${encodeURIComponent(uuid)}/playlist/reach/${encodeURIComponent(platform)}`, // [page:25]
    broadcasts: (uuid: string) => `/api/v2/song/${encodeURIComponent(uuid)}/broadcasts`, // [page:26]
    broadcastGroups: (uuid: string) =>
      `/api/v2/song/${encodeURIComponent(uuid)}/broadcast-groups`, // [page:27]
    audience: (uuid: string, platform: string) =>
      `/api/v2/song/${encodeURIComponent(uuid)}/audience/${encodeURIComponent(platform)}`, // [page:28]
    localStreaming: (uuid: string, platform: string) =>
      `/api/v2/song/${encodeURIComponent(uuid)}/streaming/${encodeURIComponent(platform)}`, // [page:29]
  },
  charts: {
    songChartListByPlatform: (platform: string) =>
      `/api/v2/chart/song/by-platform/${encodeURIComponent(platform)}`, // [page:30]
    tikTokMusicLinksRankingLatest: '/api/v2/chart/tiktok/music/weekly/ranking/latest', // [page:31]
  },
} as const;
