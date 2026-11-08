import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * N2 — Notifications API.
 *
 * GET /api/notifications?subs=<URL-encoded JSON array>
 *
 * For each subscribed material, counts papers whose `createdAt` is newer than
 * the subscription's `lastCheckedAt` watermark, and fetches the title + year
 * of the newest such paper. Only materials with `newCount > 0` are returned.
 *
 * Subscriptions are stored client-side (localStorage, see
 * `src/lib/subscription-store.ts`), so the client must send them with each
 * request. To keep the API RESTful and cache-friendly we use a GET with a
 * URL-encoded JSON `subs` param — capped at 50 entries (the store's MAX), so
 * even the worst-case URL (~7 KB) stays well under browser limits.
 *
 * When called with no `subs` (e.g. a health-check `curl /api/notifications`)
 * the endpoint returns `{ notifications: [], totalNew: 0 }` with status 200.
 */

interface SubInput {
  materialId: string
  materialName: string
  lastCheckedAt: number
}

interface NotificationItem {
  materialId: string
  materialName: string
  newCount: number
  latestPaperTitle: string
  latestPaperDate: string
}

interface NotificationResponse {
  notifications: NotificationItem[]
  totalNew: number
  checkedAt: number
}

function isSubInput(x: unknown): x is SubInput {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  return (
    typeof s.materialId === 'string' &&
    typeof s.materialName === 'string' &&
    typeof s.lastCheckedAt === 'number'
  )
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const subsParam = searchParams.get('subs')

  let subs: SubInput[] = []
  if (subsParam) {
    let parsed: unknown
    try {
      parsed = JSON.parse(decodeURIComponent(subsParam))
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid `subs` query parameter — expected URL-encoded JSON array.',
        },
        { status: 400 },
      )
    }
    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: '`subs` must be a JSON array.' },
        { status: 400 },
      )
    }
    subs = parsed.filter(isSubInput).slice(0, 50)
  }

  // Empty input → empty output. Lets `curl /api/notifications` return 200
  // and lets the client poll cheaply when the user has no subscriptions yet.
  if (subs.length === 0) {
    const empty: NotificationResponse = {
      notifications: [],
      totalNew: 0,
      checkedAt: Date.now(),
    }
    return NextResponse.json(empty)
  }

  // Validate that subscribed materials still exist; if a material was deleted
  // since the subscription was created, the client should clean it up. We
  // simply skip orphaned subscriptions here (per spec: only include materials
  // with newCount > 0).
  const materialIds = subs.map((s) => s.materialId)
  const materials = await db.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, name: true },
  })
  const matNameById = new Map(materials.map((m) => [m.id, m.name]))

  // For each subscription: count new papers + fetch the latest one's title/year.
  // Run them in parallel — capped by the 50-entry store limit, so worst case
  // is ~100 lightweight DB hits (count + findFirst) per poll.
  const settled = await Promise.all(
    subs.map(async (s) => {
      // Skip orphaned subscriptions (material was deleted).
      if (!matNameById.has(s.materialId)) return null
      const since = new Date(s.lastCheckedAt)
      const [count, latest] = await Promise.all([
        db.paper.count({
          where: {
            materialId: s.materialId,
            createdAt: { gt: since },
          },
        }),
        db.paper.findFirst({
          where: {
            materialId: s.materialId,
            createdAt: { gt: since },
          },
          orderBy: { createdAt: 'desc' },
          select: { title: true, year: true, createdAt: true },
        }),
      ])
      if (count === 0 || !latest) return null
      const name = matNameById.get(s.materialId) ?? s.materialName
      const item: NotificationItem = {
        materialId: s.materialId,
        materialName: name,
        newCount: count,
        latestPaperTitle: latest.title,
        // Prefer the publication year (more meaningful to researchers); fall
        // back to the ISO date the paper record was inserted.
        latestPaperDate:
          latest.year != null
            ? String(latest.year)
            : latest.createdAt.toISOString().slice(0, 10),
      }
      return item
    }),
  )

  const notifications = settled.filter(
    (x): x is NotificationItem => x !== null,
  )

  // Sort: most-new-papers first, then by latest paper date desc.
  notifications.sort((a, b) => {
    if (b.newCount !== a.newCount) return b.newCount - a.newCount
    return b.latestPaperDate.localeCompare(a.latestPaperDate)
  })

  const totalNew = notifications.reduce((sum, n) => sum + n.newCount, 0)
  const body: NotificationResponse = {
    notifications,
    totalNew,
    checkedAt: Date.now(),
  }
  return NextResponse.json(body)
}
