// lib/crawler/textParsing.ts
//
// Generic markdown/text cleanup shared by every crawl4ai ingestion job that
// parses a ranked title/artist (or name/value) list out of markdown rather
// than a CSS extraction schema. Markdown parsing is more resilient than CSS
// selectors against sites with obfuscated/hashed class names (Apple Music,
// X, etc) — see jobs/ingest/billboard.ts for the original, hand-tuned
// version this was extracted from.

/** Lowercase, strip punctuation, collapse whitespace — for fuzzy title/artist matching. */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Strip markdown formatting (bold/italic/headings/links/code) down to plain text. */
export function cleanLine(l: string): string {
  return l
    .replace(/\*+/g, '')
    .replace(/#+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`+/g, '')
    .trim();
}

/**
 * True if a cleaned line looks like real content rather than nav/metadata
 * noise. `metadataRe` is site-specific (each job supplies its own list of
 * chrome/nav words to reject).
 */
export function isUsableLine(l: string, metadataRe: RegExp): boolean {
  if (l.length < 2) return false;
  if (metadataRe.test(l)) return false;
  if (/^[\d\s\-–|.,]+$/.test(l)) return false;
  if (/^https?:\/\//.test(l)) return false;
  return true;
}
