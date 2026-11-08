import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// The previous revision hard-coded `log: ['query']`, which prints every SQL
// statement regardless of environment. That flooded dev.log (70 KB of raw SQL
// per session) and would have done the same in production.
//
// Development keeps the full query log because it is genuinely useful while
// debugging. Production is restricted to errors and warnings only.
//
// `PRISMA_LOG` overrides both: set it to `query` to debug a deployed
// instance, or to `error` to silence a noisy dev session.
const LOG_LEVELS: Prisma.LogLevel[] = ['info', 'query', 'warn', 'error']

function resolveLogLevel(): Prisma.LogLevel[] {
  const override = process.env.PRISMA_LOG
    ?.split(',')
    .map((level) => level.trim())
    .filter((level): level is Prisma.LogLevel =>
      LOG_LEVELS.includes(level as Prisma.LogLevel)
    )

  if (override && override.length > 0) return override

  return process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['query', 'info', 'warn', 'error']
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: resolveLogLevel(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
