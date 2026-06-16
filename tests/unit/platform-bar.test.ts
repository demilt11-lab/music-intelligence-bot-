import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, platformDisplay } from '@/components/ui/PlatformBar';

// Guards BUG-006: every platform row (TikTok, Spotify, YouTube, Instagram)
// rendered a bare "—" with no indication of whether data was missing or the
// view was broken. platformDisplay now names the absence explicitly, and a
// real value still formats normally.

test('formatValue treats null/empty/zero as the no-data sentinel', () => {
  assert.equal(formatValue(null), '—');
  assert.equal(formatValue(''), '—');
  assert.equal(formatValue(0), '—');
  assert.equal(formatValue('0'), '—');
});

test('formatValue abbreviates large numbers', () => {
  assert.equal(formatValue(4_200_000), '4.2M');
  assert.equal(formatValue('1500'), '1.5K');
  assert.equal(formatValue(2_300_000_000), '2.3B');
  assert.equal(formatValue(750), '750');
});

test('platformDisplay shows an honest label instead of a bare dash when empty', () => {
  const d = platformDisplay(null);
  assert.equal(d.hasData, false);
  assert.equal(d.text, 'No signal');
  assert.notEqual(d.text, '—');
});

test('platformDisplay honors a custom empty label', () => {
  assert.equal(platformDisplay(0, 'Not ingested yet').text, 'Not ingested yet');
});

test('platformDisplay passes through a real, formatted value', () => {
  const d = platformDisplay(4_200_000);
  assert.equal(d.hasData, true);
  assert.equal(d.text, '4.2M');
});

test('platformDisplay surfaces a Spotify popularity string (the BUG-006 row that was always empty)', () => {
  const d = platformDisplay('Pop 73');
  assert.equal(d.hasData, true);
  assert.equal(d.text, 'Pop 73');
});
