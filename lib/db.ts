import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

/**
 * Normalises the pooled Postgres connection string so it is valid no matter how
 * the `DATABASE_URL` secret happens to be stored. This is deliberately
 * defensive because the value reaches us from several places (Vercel env,
 * GitHub Actions secrets, local `.env`) and was historically corrupted by
 * workflow steps that blindly appended `?pgbouncer=true&connection_limit=1` —
 * producing an invalid double-"?" URL when the secret already had a query
 * string. Prisma rejects that with "the provided arguments are not supported
 * in database URL", which silently took down every DB-backed job.
 *
 * Rules applied:
 *   1. Repair a malformed `...?a=b?c=d` into `...?a=b&c=d`.
 *   2. Preserve any pre-existing params (e.g. `sslmode=require`).
 *   3. Guarantee `pgbouncer=true` — Supabase's transaction pooler (port 6543)
 *      requires it so Prisma disables prepared statements.
 *   4. Default `connection_limit=1` — each scheduled job and serverless
 *      function is a short-lived single worker.
 *
 * Exported so it can be unit-tested in isolation.
 */
export function normalizePooledUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined

  // (1) Repair the most common corruption: a second "?" introduced by naive
  // string concatenation. Everything after the first "?" is the query string,
  // so any further "?" must become "&".
  const firstQ = raw.indexOf('?')
  let url = raw
  if (firstQ !== -1) {
    url = raw.slice(0, firstQ + 1) + raw.slice(firstQ + 1).replace(/\?/g, '&')
  }

  try {
    const u = new URL(url)
    u.searchParams.set('pgbouncer', 'true')
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', '1')
    }
    return u.toString()
  } catch {
    // Fallback for any non-standard URI the WHATWG parser rejects (e.g. an
    // unencoded special character in the password). Operate on the string.
    let out = url
    if (!/[?&]pgbouncer=true(?:&|$)/.test(out)) {
      out += `${out.includes('?') ? '&' : '?'}pgbouncer=true`
    }
    if (!/[?&]connection_limit=/.test(out)) {
      out += `&connection_limit=1`
    }
    return out
  }
}

const datasourceUrl = normalizePooledUrl(process.env.DATABASE_URL)

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
