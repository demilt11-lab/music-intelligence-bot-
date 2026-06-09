import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url) return undefined
  if (url.includes('pgbouncer=true')) return url

  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}pgbouncer=true&connection_limit=1`
}

const datasourceUrl = buildDatasourceUrl()

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
