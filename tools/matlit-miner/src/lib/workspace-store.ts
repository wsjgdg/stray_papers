'use client'

import { useState, useEffect } from 'react'

/**
 * G9 — Team workspace store.
 *
 * Client-side (localStorage) team workspace for sharing material
 * collections. Persisted under `matlit-workspaces` as a JSON array.
 *
 * NOTE: This is a *local-only* collaboration surface. Members and
 * material lists are stored in this browser; they are NOT synced to a
 * backend. Real multi-user collaboration requires migrating the
 * mutations below to a server API + DB table — the shape of this store
 * is intentionally close to what a future Prisma `Workspace` model
 * would expose so the migration is mechanical.
 *
 * Layout:
 *   Workspace {
 *     id, name, description,
 *     materialIds: string[],            // references Material.id
 *     members: Array<{ email, role }>,  // owner | editor | viewer
 *     createdAt: number
 *   }
 *
 * Re-reads on:
 *   - the custom `matlit:workspaces-changed` event (this tab)
 *   - the native `storage` event (other tabs)
 */

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export interface WorkspaceMember {
  email: string
  role: WorkspaceRole
}

export interface Workspace {
  id: string
  name: string
  description: string
  materialIds: string[]
  members: WorkspaceMember[]
  createdAt: number
}

const KEY = 'matlit-workspaces'
const CHANGE_EVENT = 'matlit:workspaces-changed'

function isMember(x: unknown): x is WorkspaceMember {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  return (
    typeof m.email === 'string' &&
    (m.role === 'owner' || m.role === 'editor' || m.role === 'viewer')
  )
}

export function isWorkspace(x: unknown): x is Workspace {
  if (typeof x !== 'object' || x === null) return false
  const w = x as Record<string, unknown>
  return (
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.description === 'string' &&
    Array.isArray(w.materialIds) &&
    w.materialIds.every((v) => typeof v === 'string') &&
    Array.isArray(w.members) &&
    w.members.every(isMember) &&
    typeof w.createdAt === 'number'
  )
}

function genId(): string {
  // Lightweight unique id without pulling in a uuid dep. Format:
  // `ws-<base36-timestamp>-<4-random-base36>` — sortable + collision-safe
  // for a single-user localStorage scope.
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 6)
  return `ws-${t}-${r}`
}

export function getWorkspaces(): Workspace[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isWorkspace)
  } catch {
    return []
  }
}

function save(list: Workspace[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    /* ignore — quota / private mode */
  }
}

/**
 * Create a new workspace. The current reviewer email (or "default") is
 * seeded as the owner so the workspace isn't orphaned. Returns the new
 * workspace id.
 */
export function createWorkspace(
  name: string,
  description: string,
  ownerEmail?: string,
): string {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('Workspace name is required')
  }
  const owner: WorkspaceMember = {
    email: (ownerEmail && ownerEmail.trim()) || 'default',
    role: 'owner',
  }
  const ws: Workspace = {
    id: genId(),
    name: trimmedName,
    description: description.trim(),
    materialIds: [],
    members: [owner],
    createdAt: Date.now(),
  }
  const next = [ws, ...getWorkspaces()]
  save(next)
  return ws.id
}

export function addMaterial(wsId: string, materialId: string): void {
  if (!materialId) return
  const next = getWorkspaces().map((w) =>
    w.id === wsId && !w.materialIds.includes(materialId)
      ? { ...w, materialIds: [...w.materialIds, materialId] }
      : w,
  )
  save(next)
}

export function removeMaterial(wsId: string, materialId: string): void {
  const next = getWorkspaces().map((w) =>
    w.id === wsId
      ? { ...w, materialIds: w.materialIds.filter((id) => id !== materialId) }
      : w,
  )
  save(next)
}

export function inviteMember(
  wsId: string,
  email: string,
  role: WorkspaceRole,
): void {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Invalid email')
  }
  const next = getWorkspaces().map((w) => {
    if (w.id !== wsId) return w
    // Replace role if already a member; otherwise append.
    const existing = w.members.findIndex((m) => m.email === trimmed)
    const members =
      existing >= 0
        ? w.members.map((m, i) => (i === existing ? { ...m, role } : m))
        : [...w.members, { email: trimmed, role }]
    return { ...w, members }
  })
  save(next)
}

export function removeMember(wsId: string, email: string): void {
  const target = email.trim().toLowerCase()
  const next = getWorkspaces().map((w) =>
    w.id === wsId
      ? {
          ...w,
          // Never remove the last owner — guard against orphaned workspaces.
          members: w.members.filter(
            (m) => !(m.email === target && m.role !== 'owner'),
          ),
        }
      : w,
  )
  save(next)
}

export function deleteWorkspace(wsId: string): void {
  const next = getWorkspaces().filter((w) => w.id !== wsId)
  save(next)
}

export function getWorkspace(wsId: string): Workspace | undefined {
  return getWorkspaces().find((w) => w.id === wsId)
}

/**
 * React hook — subscribes to workspace list changes from localStorage.
 * Re-reads on the custom change event (same tab) and the native
 * `storage` event (cross-tab).
 */
export function useWorkspaces(): Workspace[] {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  useEffect(() => {
    setWorkspaces(getWorkspaces())
    const handler = () => setWorkspaces(getWorkspaces())
    window.addEventListener(CHANGE_EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [])
  return workspaces
}
