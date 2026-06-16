import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripMarkdown,
  looksLikeMarkdownJunk,
  safeDisplayName,
  sanitizeNameForStorage,
} from '@/lib/shared/text';

// Guards BUG-001: the Billboard scraper leaked raw markdown image syntax and
// share-link fragments into artist/track names, which then rendered verbatim
// in search results (e.g. "![](https://…drake….jpg)", "Twitter](https://…)").

// The two exact strings from the bug report.
const IMAGE_JUNK =
  '![](https://charts-static.billboard.com/img/2009/04/drake-v3o-180x180.jpg)';
const SHARE_JUNK =
  'Twitter](https://twitter.com/intent/tweet?url=https%3A%2F%2Fwww.billboard.com%2Fcharts%2Fhot-100&text=x)';

test('looksLikeMarkdownJunk flags image syntax, share fragments, and bare URLs', () => {
  assert.equal(looksLikeMarkdownJunk(IMAGE_JUNK), true);
  assert.equal(looksLikeMarkdownJunk(SHARE_JUNK), true);
  assert.equal(looksLikeMarkdownJunk('https://twitter.com/drake'), true);
  assert.equal(looksLikeMarkdownJunk('www.billboard.com'), true);
});

test('looksLikeMarkdownJunk does NOT flag clean names or complete links', () => {
  assert.equal(looksLikeMarkdownJunk('Drake'), false);
  assert.equal(looksLikeMarkdownJunk('Tyler, The Creator'), false);
  assert.equal(looksLikeMarkdownJunk('AC/DC'), false);
  // A complete link is recoverable, not junk — the URL is inside the link.
  assert.equal(looksLikeMarkdownJunk('[Drake](https://billboard.com/drake)'), false);
});

test('stripMarkdown recovers link text and removes emphasis', () => {
  assert.equal(stripMarkdown('[Drake](https://billboard.com/drake)'), 'Drake');
  assert.equal(stripMarkdown('**Drake**'), 'Drake');
  assert.equal(stripMarkdown('### 1'), '1');
  assert.equal(stripMarkdown('Drake'), 'Drake');
});

test('safeDisplayName falls back for the exact bug-report junk strings', () => {
  assert.equal(safeDisplayName(IMAGE_JUNK, 'Unknown Artist'), 'Unknown Artist');
  assert.equal(safeDisplayName(SHARE_JUNK, 'Unknown Artist'), 'Unknown Artist');
  assert.equal(safeDisplayName('- ![](https://x.com/a.jpg)', 'Unknown Artist'), 'Unknown Artist');
  assert.equal(safeDisplayName('https://twitter.com/drake', 'Unknown Artist'), 'Unknown Artist');
  assert.equal(safeDisplayName(null, 'Unknown Artist'), 'Unknown Artist');
  assert.equal(safeDisplayName('', 'Unknown Artist'), 'Unknown Artist');
});

test('safeDisplayName preserves and recovers legitimate names', () => {
  assert.equal(safeDisplayName('Drake', 'Unknown Artist'), 'Drake');
  assert.equal(safeDisplayName('[Drake](https://x)', 'Unknown Artist'), 'Drake');
  assert.equal(safeDisplayName('**Beyoncé**', 'Unknown Artist'), 'Beyoncé');
  assert.equal(safeDisplayName('Tyler, The Creator', 'Unknown Artist'), 'Tyler, The Creator');
  assert.equal(safeDisplayName('21 Savage', 'Unknown Artist'), '21 Savage');
  assert.equal(safeDisplayName('P!nk', 'Unknown Artist'), 'P!nk');
});

test('sanitizeNameForStorage returns null for junk, clean string otherwise', () => {
  assert.equal(sanitizeNameForStorage(IMAGE_JUNK), null);
  assert.equal(sanitizeNameForStorage(SHARE_JUNK), null);
  assert.equal(sanitizeNameForStorage('https://x.com'), null);
  assert.equal(sanitizeNameForStorage(''), null);
  assert.equal(sanitizeNameForStorage(null), null);
  assert.equal(sanitizeNameForStorage('Drake'), 'Drake');
  assert.equal(sanitizeNameForStorage('[Drake](https://x)'), 'Drake');
});

// Guards BUG-003: the Talent Scout NOTE interpolated a contaminated top track,
// rendering "Top priority right now is \ by Twitter](https://...)". The track
// name was a stray backslash and the artist was an orphan share fragment.
test('stripMarkdown drops backslash escape artifacts', () => {
  assert.equal(stripMarkdown('\\'), '');
  assert.equal(stripMarkdown('Drake\\'), 'Drake');
  assert.equal(stripMarkdown('\\\\'), '');
});

test('a lone backslash name falls back; a recoverable name is salvaged', () => {
  // The exact NOTE-failure case: name is "\", artist is the share fragment.
  assert.equal(safeDisplayName('\\', 'this track'), 'this track');
  assert.equal(safeDisplayName('Drake\\', 'Unknown Artist'), 'Drake');
  assert.equal(sanitizeNameForStorage('\\'), null);
  // The share-link artist fragment from the NOTE must not survive.
  assert.equal(
    safeDisplayName(
      'Twitter](https://twitter.com/intent/tweet?url=https%3A%2F%2Fwww.billboard.com)',
      'Unknown Artist',
    ),
    'Unknown Artist',
  );
});
