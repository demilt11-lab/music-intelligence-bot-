// lib/integrations/soundcharts/schema-notes.ts

export const soundchartsSchemaSuggestions = {
  radios: ['slug', 'name', 'country_code', 'market', 'genre', 'raw_payload'],
  radio_identifiers: ['radio_slug', 'platform_code', 'external_id', 'external_url', 'raw_payload'],
  radio_feed_events: ['radio_slug', 'event_timestamp', 'song_title', 'artist_name', 'raw_payload'],

  publishers: ['publisher_uuid', 'name', 'ipi', 'country', 'website', 'raw_payload'],
  publisher_identities: ['publisher_uuid', 'identity_type', 'platform_code', 'identity_value'],
  publisher_identifiers: ['publisher_uuid', 'platform_code', 'external_id', 'external_url', 'raw_payload'],

  song_chart_entries: [
    'song_uuid',
    'platform_code',
    'chart_id',
    'position',
    'old_position',
    'entry_date',
    'rank_date',
  ],
  song_playlist_entries: [
    'song_uuid',
    'platform_code',
    'playlist_uuid',
    'playlist_type',
    'country_code',
    'position',
  ],
  song_playlist_reach_timeseries: [
    'song_uuid',
    'platform_code',
    'playlist_type',
    'metric_date',
    'playlist_count',
    'playlist_reach',
  ],

  song_radio_broadcasts: [
    'song_uuid',
    'radio_slug',
    'aired_at_utc',
    'country_code',
    'raw_payload',
  ],
  song_radio_spin_groups: [
    'song_uuid',
    'radio_slug',
    'period_start',
    'period_end',
    'spin_count',
    'raw_payload',
  ],

  song_audience_timeseries: [
    'song_uuid',
    'platform_code',
    'platform_identifier',
    'metric_name',
    'metric_date',
    'metric_value',
  ],
  song_local_streaming_timeseries: [
    'song_uuid',
    'platform_code',
    'metric_name',
    'metric_date',
    'metric_value',
  ],

  chart_definitions: [
    'chart_id',
    'platform_code',
    'country_code',
    'chart_name',
    'chart_type',
    'raw_payload',
  ],
  chart_snapshot_entries: [
    'chart_key',
    'snapshot_date',
    'position',
    'metric_value',
    'doc',
    'woc',
    'raw_payload',
  ],
} as const;

export const soundchartsNotes = {
  baseUrl: 'https://customer.api.soundcharts.com',
  authHeaders: ['X-App-Id', 'X-API-Key'],
  patterns: [
    'resolver -> canonical entity id -> related collection',
    'entity path + time window + pagination',
    'separate event-grain and aggregate-grain endpoints',
    'separate chart registry, chart snapshots, and entity chart history',
  ],
};
