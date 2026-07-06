/**
 * Tests for the robots.txt parser + matcher (lib/crawler/robots.ts). These
 * lock down the crawl-gating decision the ingestion layer now enforces: we do
 * not fetch a path a site disallows for our user-agent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathAllowed, patternMatches, selectGroup, parseRobotsTxt } from '@/lib/crawler/robots';

const UA = 'MusicIntelligenceBot/1.0';

test('disallow blocks a matching path, allows others', () => {
  const robots = 'User-agent: *\nDisallow: /private';
  assert.equal(isPathAllowed(robots, UA, '/private/data'), false);
  assert.equal(isPathAllowed(robots, UA, '/public/data'), true);
});

test('empty robots or no rules → allowed', () => {
  assert.equal(isPathAllowed('', UA, '/anything'), true);
  assert.equal(isPathAllowed('User-agent: *\nDisallow:', UA, '/anything'), true);
});

test('Allow overrides a broader Disallow via longest-match', () => {
  const robots = 'User-agent: *\nDisallow: /charts\nAllow: /charts/public';
  assert.equal(isPathAllowed(robots, UA, '/charts/private'), false);
  assert.equal(isPathAllowed(robots, UA, '/charts/public/top'), true);
});

test('a group targeting our UA takes precedence over *', () => {
  const robots =
    'User-agent: *\nDisallow: /\n\nUser-agent: MusicIntelligenceBot\nDisallow: /admin\nAllow: /';
  // The * group blocks everything, but our named group is selected instead.
  assert.equal(isPathAllowed(robots, UA, '/charts'), true);
  assert.equal(isPathAllowed(robots, UA, '/admin/panel'), false);
});

test('wildcards and end-anchors are honored', () => {
  assert.equal(patternMatches('/*.pdf$', '/files/report.pdf'), true);
  assert.equal(patternMatches('/*.pdf$', '/files/report.pdf?x=1'), false);
  assert.equal(patternMatches('/a/*/c', '/a/b/c'), true);
  assert.equal(isPathAllowed('User-agent: *\nDisallow: /*.json$', UA, '/data/x.json'), false);
});

test('consecutive User-agent lines share the rule block', () => {
  const groups = parseRobotsTxt('User-agent: A\nUser-agent: B\nDisallow: /x');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].agents, ['a', 'b']);
  assert.ok(selectGroup(groups, 'SomeBot-A/1.0'));
});

test('a disallow-all block stops the crawl', () => {
  assert.equal(isPathAllowed('User-agent: *\nDisallow: /', UA, '/anything'), false);
});
