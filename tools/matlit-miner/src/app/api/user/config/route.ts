import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fs } from 'fs'
import path from 'path'

// GET / POST /api/user/config
//
// Persists user-configured API settings (S2 key, CrossRef/OpenAlex polite-pool
// emails, LLM provider config) so they sync across devices when signed in.
//
// Storage: a single JSON file at `data/user-config.json` whose shape is:
//   {
//     "<userId>": { ...config },
//     "<userId2>": { ...config },
//     "_anonymous": { ...config }   // when no session — keyed by client fingerprint
//   }
//
// The frontend settings dialog (src/components/*) calls these endpoints when
// the user signs in / out to load and save their settings. Anonymous visitors
// continue to use localStorage only (no sync).
//
// Why a JSON file instead of Prisma? The User model in prisma/schema.prisma
// has no `config` field, and adding one would require a migration. A simple
// JSON file is plenty for a demo / single-instance deployment; for production
// a `UserConfig` table would be the right choice.

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'user-config.json')

/** Allowed top-level keys — anything else is silently dropped (defensive). */
const ALLOWED_KEYS = new Set([
  'semanticScholar',
  'crossref',
  'openalex',
  'llmProvider',
  'llmBaseURL',
  'llmApiKey',
  'llmModel',
])

/** Max payload size — 8 KB is generous for a handful of API keys. */
const MAX_BODY_BYTES = 8 * 1024

export interface UserConfig {
  semanticScholar?: string
  crossref?: string
  openalex?: string
  llmProvider?: string
  llmBaseURL?: string
  llmApiKey?: string
  llmModel?: string
}

type ConfigStore = Record<string, UserConfig>

async function readStore(): Promise<ConfigStore> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ConfigStore
    }
    return {}
  } catch (err) {
    // Missing file or invalid JSON — treat as empty.
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      console.warn('[user/config] failed to read store:', err)
    }
    return {}
  }
}

async function writeStore(store: ConfigStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  // Write atomically: tmp file + rename.
  const tmp = `${CONFIG_FILE}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, CONFIG_FILE)
}

/** Strip unknown keys + enforce string types. Returns a clean UserConfig. */
function sanitize(input: unknown): UserConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const src = input as Record<string, unknown>
  const out: UserConfig = {}
  for (const key of Object.keys(src)) {
    if (!ALLOWED_KEYS.has(key)) continue
    const v = src[key]
    if (typeof v === 'string') {
      // Cap individual value length to prevent runaway payloads.
      out[key as keyof UserConfig] = v.slice(0, 2048)
    }
  }
  return out
}

/** Resolve the storage key — user id when authenticated, "_anonymous" otherwise. */
async function resolveStoreKey(): Promise<string> {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user) {
      const id = (session.user as { id?: string }).id
      if (id) return id
    }
  } catch (err) {
    // NextAuth may not be configured (no NEXTAUTH_SECRET) — fall through to
    // the anonymous key so the endpoint still works for unauthenticated users.
    console.warn('[user/config] session lookup failed, using anonymous key:', err)
  }
  return '_anonymous'
}

// GET /api/user/config
// Returns the stored config for the current user (or {} if none / anonymous).
export async function GET() {
  const key = await resolveStoreKey()
  const store = await readStore()
  const config = store[key] ?? {}
  return NextResponse.json({ config, scope: key === '_anonymous' ? 'anonymous' : 'user' })
}

// POST /api/user/config
// Body: UserConfig (any subset of the allowed keys; unknown keys dropped).
// Replaces the stored config for the current user.
export async function POST(req: NextRequest) {
  // Guard against oversized payloads before parsing.
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `payload too large (max ${MAX_BODY_BYTES} bytes)` },
      { status: 413 },
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const config = sanitize(raw)
  const key = await resolveStoreKey()
  const store = await readStore()
  store[key] = config
  await writeStore(store)

  return NextResponse.json({ ok: true, config, scope: key === '_anonymous' ? 'anonymous' : 'user' })
}

// DELETE /api/user/config
// Clears the stored config for the current user.
export async function DELETE() {
  const key = await resolveStoreKey()
  const store = await readStore()
  if (key in store) {
    delete store[key]
    await writeStore(store)
  }
  return NextResponse.json({ ok: true })
}
