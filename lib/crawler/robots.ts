// lib/crawler/robots.ts
//
// A focused robots.txt parser + matcher (RFC 9309-style): group selection by
// User-agent, Allow/Disallow rules with `*` wildcards and `$` end-anchors, and
// longest-match precedence (Allow wins ties). Kept dependency-free and pure so
// the crawl-gating decision is unit-tested.

export type RobotsRule = { allow: boolean; pattern: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

/** Parse robots.txt into groups. */
export function parseRobotsTxt(txt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      // Consecutive User-agent lines share the following rule block.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        groups.push(current);
      }
      // A blank Disallow means "allow all" — skip adding a rule.
      if (field === 'disallow' && value === '') {
        lastWasAgent = false;
        continue;
      }
      current.rules.push({ allow: field === 'allow', pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** Pick the rule group for a user-agent: exact/substring match, else `*`. */
export function selectGroup(groups: RobotsGroup[], userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let star: RobotsGroup | null = null;
  let best: RobotsGroup | null = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === '*') star = star ?? g;
      else if (ua.includes(a)) best = best ?? g;
    }
  }
  return best ?? star;
}

/** Does a robots pattern (with `*` and `$`) match a path? */
export function patternMatches(pattern: string, path: string): boolean {
  if (pattern === '') return false;
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + escaped + (anchored ? '$' : ''));
  return re.test(path);
}

/**
 * Is `path` allowed for `userAgent` under this robots.txt? Longest matching
 * rule wins; on an equal-length tie, Allow wins (per Google's spec). A robots
 * with no applicable disallow → allowed.
 */
export function isPathAllowed(robotsTxt: string, userAgent: string, path: string): boolean {
  const group = selectGroup(parseRobotsTxt(robotsTxt), userAgent);
  if (!group) return true;

  let decision: { allow: boolean; len: number } | null = null;
  for (const rule of group.rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    const len = rule.pattern.replace(/\$$/, '').length;
    if (!decision || len > decision.len || (len === decision.len && rule.allow)) {
      decision = { allow: rule.allow, len };
    }
  }
  return decision ? decision.allow : true;
}
