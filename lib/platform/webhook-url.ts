// lib/platform/webhook-url.ts
//
// Validates user-supplied webhook URLs before storing or fetching them.
// Prevents SSRF attacks where an attacker points a webhook at an internal
// service (Redis, Postgres, AWS metadata endpoint, etc.).
import dns from 'node:dns';

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, // link-local / AWS metadata
  /^100\.64\./, // CGNAT
  /^::1$/,
  /^fc00:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 link-local
];

/**
 * Validates the URL is well-formed and non-private by hostname pattern, then
 * resolves it via DNS and re-checks the resolved address. Hostname-pattern
 * checks alone only catch literal IP hostnames — a domain name can pass that
 * check and still resolve to a private/internal address (DNS rebinding).
 * Call this again immediately before each delivery attempt, not just once at
 * rule-creation time, to keep the window between check and use as small as
 * possible (a fully closed window would require pinning the resolved IP
 * through to the fetch() call itself).
 */
export async function validateWebhookUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error('Invalid webhook URL'), { status: 400 });
  }

  // Only allow http/https
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw Object.assign(
      new Error('Webhook URL must use http or https'),
      { status: 400 },
    );
  }

  // Reject https in dev is fine, but production must use https
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw Object.assign(
      new Error('Webhook URL must use https in production'),
      { status: 400 },
    );
  }

  // Reject URLs with embedded credentials (user:pass@host)
  if (parsed.username || parsed.password) {
    throw Object.assign(
      new Error('Webhook URL must not contain embedded credentials'),
      { status: 400 },
    );
  }

  // Reject private/internal IP ranges (SSRF guard)
  const hostname = parsed.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw Object.assign(
        new Error('Webhook URL must not target private or internal IP ranges'),
        { status: 400 },
      );
    }
  }

  // Reject non-standard ports that suggest targeting internal services
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
    ? 443
    : 80;

  if (![80, 443, 8080, 8443].includes(port)) {
    throw Object.assign(
      new Error(`Webhook URL port ${port} is not allowed (use 80, 443, 8080, or 8443)`),
      { status: 400 },
    );
  }

  // Resolve and re-check: a hostname can pass the pattern check above and
  // still resolve to a private/internal address.
  let addresses: string[];
  try {
    addresses = await dns.promises.resolve(hostname).catch(() =>
      dns.promises.resolve6(hostname),
    );
  } catch {
    throw Object.assign(
      new Error('Webhook URL hostname could not be resolved'),
      { status: 400 },
    );
  }

  for (const addr of addresses) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(addr)) {
        throw Object.assign(
          new Error('Webhook URL resolves to a private or internal IP range'),
          { status: 400 },
        );
      }
    }
  }
}
