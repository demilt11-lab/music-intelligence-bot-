// lib/shared/text.ts
//
// Text sanitisation for entity names/titles. Some ingest paths — notably the
// Billboard chart scraper, which parses Firecrawl markdown — can leak raw
// markdown image syntax, share-link fragments, or bare URLs into name fields.
// These helpers strip that syntax before storage and guard the render layer so
// junk never reaches the UI.

/** Matches a bare URL anywhere in a string. */
const URL_RE = /https?:\/\/|www\.[a-z0-9-]+\.[a-z]/i;

/**
 * Returns true when a string still looks like scraped markdown, a bare URL, or
 * a broken share-link fragment rather than a clean entity name. Used as a
 * render- and write-time guard.
 *
 * It distinguishes a *complete* link/image (`[Drake](url)`, whose text we can
 * safely recover) from an *orphan* fragment (`Twitter](url)`, a share-widget
 * remnant whose opening bracket was split off upstream): only the latter, plus
 * bare URLs, count as junk.
 *
 * @param input - String to inspect (raw or already markdown-stripped).
 */
export function looksLikeMarkdownJunk(input: string): boolean {
  if (!input) return false;
  // Image embeds are always junk: unlike a link, there is no text to recover.
  if (/!\[/.test(input)) return true;
  // Remove *complete* links first, so a recoverable link such as "[Drake](url)"
  // isn't flagged for the URL it legitimately wraps.
  const withoutLinks = input.replace(/\[[^\]]*\]\([^)]*\)/g, ' ');
  // Residual "](" or "[…](" means a broken/orphan link fragment.
  if (/\]\(|\[[^\]]*\]\(/.test(withoutLinks)) return true;
  // A bare URL left outside any complete link is junk for a name field.
  if (URL_RE.test(withoutLinks)) return true;
  return false;
}

/**
 * Strips markdown image/link/formatting syntax from a string, returning plain
 * text. Designed to be lossless for clean names (`"Drake"` → `"Drake"`) while
 * recovering link text (`"[Drake](url)"` → `"Drake"`) and dropping images and
 * broken share-link fragments entirely.
 *
 * @param input - Raw, possibly markdown-bearing string.
 */
export function stripMarkdown(input: string): string {
  let s = input;

  // 0. Markdown escape backslashes ("\!", "\[", or a stray "\") — never part of
  //    a real entity name; drop them before anything else so "Drake\" → "Drake"
  //    and a lone "\" collapses to empty (and thus falls back).
  s = s.replace(/\\/g, ' ');
  // 1. Images: ![alt](url) — drop entirely (alt text is rarely an entity name)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // 2. Links: [text](url) → text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 3. Orphan link tails: "Twitter](https://…)" → drop the "](url)" remnant.
  //    These come from share widgets whose opening "[" was split off upstream.
  s = s.replace(/\]\([^)]*\)/g, ' ');
  // 4. Stray brackets left behind by partial markdown
  s = s.replace(/[[\]]/g, ' ');
  // 5. Emphasis / heading / code / strikethrough markers
  s = s.replace(/[*#`~]+/g, ' ');
  // 6. Leading list / blockquote markers ("- ", "+ ", "> ")
  s = s.replace(/^\s*[-+>]+\s+/, ' ');
  // 7. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * Produces a safe, display-ready entity name. Rejects raw scraped junk (orphan
 * link fragments, bare URLs), strips markdown from the remainder, and falls
 * back when nothing usable is left. This is the single choke point used by the
 * search normaliser and UI render guard so corrupt rows already in the database
 * never surface raw.
 *
 * @param raw      - Raw value of unknown type from a DB row.
 * @param fallback - Returned when the value cannot be cleaned (default
 *                   `"Unknown"`).
 */
export function safeDisplayName(raw: unknown, fallback = 'Unknown'): string {
  if (raw === null || raw === undefined) return fallback;
  const str = String(raw);
  // Reject on the raw value first: an orphan "](url)" tail strips down to a
  // plausible-looking word ("Twitter") that the post-strip check would miss.
  if (looksLikeMarkdownJunk(str)) return fallback;
  const stripped = stripMarkdown(str);
  if (!stripped) return fallback;
  if (looksLikeMarkdownJunk(stripped)) return fallback;
  return stripped;
}

/**
 * Sanitises a name for *storage*. Returns the cleaned string, or `null` when
 * the input is empty/whitespace or looks like junk — the caller should skip
 * such rows rather than persist them.
 *
 * @param raw - Raw scraped string.
 */
export function sanitizeNameForStorage(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw);
  if (looksLikeMarkdownJunk(str)) return null;
  const stripped = stripMarkdown(str);
  if (stripped.length < 2) return null;
  if (looksLikeMarkdownJunk(stripped)) return null;
  return stripped;
}
