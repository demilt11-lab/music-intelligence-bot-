/**
 * TikTok crawl4ai ingestion — parsing logic.
 *
 * Imports the real production module (lib/tiktok/crawler.ts) and exercises
 * every pure parsing path with realistic payload fixtures: the in-page
 * rank_list API (both current and legacy field spellings), the song-detail
 * link fallback, the sink-JSON extraction, and creator follower-count parsing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRankListPayload,
  parseSongDetailLinks,
  extractSinkJson,
  parseCompactCount,
  parseFollowersFromMarkdown,
} from '../../lib/tiktok/crawler';

// ─── rank_list payload parsing ────────────────────────────────────────────────

test('parseRankListPayload maps the documented sound_list shape', () => {
  const payload = {
    code: 0,
    data: {
      sound_list: [
        { clip_id: '71234', title: 'Night Drive', author: 'Neon Artist', duration: 30 },
        { clip_id: '75678', title: 'Slow Burn', author: 'Ember', duration: 45 },
      ],
    },
  };
  const out = parseRankListPayload(payload, 'popular');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    soundId: '71234',
    title: 'Night Drive',
    author: 'Neon Artist',
    rank: 1,
    chart: 'popular',
  });
  assert.equal(out[1].rank, 2);
});

test('parseRankListPayload tolerates legacy field spellings', () => {
  const payload = {
    data: {
      music_list: [
        { song_id: 99, song_name: 'Alt Fields', artist_name: 'Legacy Writer' },
      ],
    },
  };
  const out = parseRankListPayload(payload, 'surging');
  assert.equal(out.length, 1);
  assert.equal(out[0].soundId, '99');
  assert.equal(out[0].title, 'Alt Fields');
  assert.equal(out[0].author, 'Legacy Writer');
  assert.equal(out[0].chart, 'surging');
});

test('parseRankListPayload skips unusable rows and error payloads', () => {
  assert.deepEqual(parseRankListPayload({ miCrawlError: '403 blocked' }, 'popular'), []);
  assert.deepEqual(parseRankListPayload(null, 'popular'), []);
  assert.deepEqual(parseRankListPayload({ data: { sound_list: 'nope' } }, 'popular'), []);
  const out = parseRankListPayload(
    { data: { sound_list: [{ clip_id: '', title: 'No id' }, { clip_id: '1', title: '' }] } },
    'popular',
  );
  assert.deepEqual(out, []);
});

test('parseRankListPayload defaults a missing author to Unknown', () => {
  const out = parseRankListPayload(
    { data: { sound_list: [{ clip_id: '5', title: 'Anon Sound' }] } },
    'popular',
  );
  assert.equal(out[0].author, 'Unknown');
});

// ─── song-detail link fallback ────────────────────────────────────────────────

test('parseSongDetailLinks extracts songs from song-detail hrefs only', () => {
  const links = [
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail/pc/en?music_id=7123456&region=US', text: 'Midnight Motion' },
    { href: 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en', text: 'Hashtags' },
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail/pc/en?music_id=7999999', text: 'Golden Hour Anthem' },
    { href: 'https://ads.tiktok.com/about-us', text: 'About us' },
  ];
  const out = parseSongDetailLinks(links, 'popular');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    soundId: '7123456',
    title: 'Midnight Motion',
    author: 'Unknown',
    rank: 1,
    chart: 'popular',
  });
  assert.equal(out[1].soundId, '7999999');
});

test('parseSongDetailLinks dedupes by sound id and requires id + text', () => {
  const links = [
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail?music_id=1', text: 'Song A' },
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail?music_id=1&period=7', text: 'Song A (dup)' },
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail?music_id=2', text: '' },
    { href: 'https://ads.tiktok.com/business/creativecenter/song/detail', text: 'No id param' },
  ];
  const out = parseSongDetailLinks(links, 'surging');
  assert.equal(out.length, 1);
  assert.equal(out[0].soundId, '1');
  assert.equal(out[0].chart, 'surging');
});

test('parseSongDetailLinks handles empty/missing input', () => {
  assert.deepEqual(parseSongDetailLinks(undefined, 'popular'), []);
  assert.deepEqual(parseSongDetailLinks([], 'popular'), []);
});

// ─── sink extraction ──────────────────────────────────────────────────────────

test('extractSinkJson parses the JSON the in-page fetch wrote', () => {
  const extracted = [{ json: '{"data":{"sound_list":[]}}' }];
  assert.deepEqual(extractSinkJson(extracted), { data: { sound_list: [] } });
  assert.equal(extractSinkJson([{ json: 'not json' }]), null);
  assert.equal(extractSinkJson([]), null);
  assert.equal(extractSinkJson(undefined), null);
});

// ─── creator profile parsing ──────────────────────────────────────────────────

test('parseCompactCount handles K/M/B suffixes and plain numbers', () => {
  assert.equal(parseCompactCount('1.2M'), 1_200_000n);
  assert.equal(parseCompactCount('834.5K'), 834_500n);
  assert.equal(parseCompactCount('2B'), 2_000_000_000n);
  assert.equal(parseCompactCount('12,345'), 12_345n);
  assert.equal(parseCompactCount('junk'), null);
});

test('parseFollowersFromMarkdown finds the follower figure', () => {
  const md = 'Some Creator\n**155.4M** Followers **12.3B** Likes\nVideos';
  assert.equal(parseFollowersFromMarkdown(md), 155_400_000n);
  assert.equal(parseFollowersFromMarkdown('no counts here'), null);
});
